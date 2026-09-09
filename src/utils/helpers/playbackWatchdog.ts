import type { GuildQueue } from 'discord-player';

/**
 * Extractors such as `discord-player-googlevideo` hand discord-player a PassThrough
 * *before* the first media segment is fetched. If the fetch then fails (YouTube
 * SABR returns 403 on segments, for example) the stream is simply ended with zero
 * bytes: `playerStart` has already fired, no `playerError` is emitted, and the
 * player silently moves on. To the bot - and to the smoke canary - that looks
 * exactly like a successful playback.
 *
 * The only reliable signal is whether the audio resource actually advanced, so we
 * poll the queue's stream time instead of trusting `playerStart`.
 */
export interface PlaybackConfirmationOptions {
  /** Stream time (ms) that must be reached before playback counts as real. */
  minStreamTimeMs?: number;
  /** How long to wait for that stream time before declaring the stream dead. */
  timeoutMs?: number;
  /** Poll interval (ms). */
  pollIntervalMs?: number;
}

export interface PlaybackConfirmation {
  confirmed: boolean;
  streamTimeMs: number;
  /** Why confirmation failed: 'stalled' (no audio in time) or 'ended' (queue stopped). */
  reason?: 'stalled' | 'ended';
}

export const DEFAULT_MIN_STREAM_TIME_MS = 1_000;
export const DEFAULT_CONFIRM_TIMEOUT_MS = 12_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

/**
 * Resolves once the queue has actually pushed `minStreamTimeMs` of audio, or once
 * it becomes clear that it never will.
 */
export async function confirmPlayback(
  queue: GuildQueue,
  options: PlaybackConfirmationOptions = {},
): Promise<PlaybackConfirmation> {
  const minStreamTimeMs = options.minStreamTimeMs ?? DEFAULT_MIN_STREAM_TIME_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let deadline = Date.now() + timeoutMs;

  for (;;) {
    const streamTimeMs = readStreamTime(queue);

    if (streamTimeMs >= minStreamTimeMs) {
      return { confirmed: true, streamTimeMs };
    }

    // Queue torn down (or track swapped out) before any audio was produced.
    if (queue.deleted || !queue.currentTrack) {
      return { confirmed: false, streamTimeMs, reason: 'ended' };
    }

    // A paused queue produces no audio by design, so it must not count as a stall.
    if (queue.node.isPaused()) {
      deadline = Date.now() + timeoutMs;
    } else if (Date.now() >= deadline) {
      return { confirmed: false, streamTimeMs, reason: 'stalled' };
    }

    await sleep(pollIntervalMs);
  }
}

function readStreamTime(queue: GuildQueue): number {
  try {
    return queue.node.streamTime ?? 0;
  } catch {
    // `node.streamTime` throws once the underlying resource is gone.
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
