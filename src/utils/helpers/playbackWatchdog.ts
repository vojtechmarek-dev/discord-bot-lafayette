import type { GuildQueue, Track } from 'discord-player';
import {
    CONFIRM_POLL_INTERVAL_MS,
    CONFIRM_TIMEOUT_MS,
    MIN_REAL_AUDIO_MS,
} from './playbackThresholds';

/**
 * Extractors such as `discord-player-googlevideo` hand discord-player a
 * PassThrough *before* the first media segment is fetched. If the fetch then
 * fails (YouTube SABR returns 403 on segments, for example) the stream is
 * simply ended with zero bytes: `playerStart` has already fired, no
 * `playerError` is emitted, and the player silently moves on. To the bot - and
 * to the smoke canary - that looks exactly like a successful playback.
 *
 * The only reliable signal is whether the audio resource actually advanced, so
 * we sample it instead of trusting `playerStart`.
 *
 * The state machine below is deliberately separated from discord-player: it
 * consumes a `PlaybackProbe` and knows nothing about queues. That is what makes
 * it testable without a `GuildQueue` fake, and what lets the tests inject
 * `now`/`sleep` so they assert on logic rather than on wall-clock timing.
 */

export interface PlaybackProbe {
    /** Decoded audio (ms) produced by the specific track being watched. */
    streamTimeMs: number;
    /** Whether that track is still the one mounted on the queue. */
    isCurrent: boolean;
    /** Whether the queue is gone or has nothing playing at all. */
    isDead: boolean;
    /** A paused queue produces no audio by design. */
    isPaused: boolean;
}

export type PlaybackProbeFn = () => PlaybackProbe;

export type PlaybackFailureReason =
    /** No audio arrived within the timeout. */
    | 'stalled'
    /** The queue was torn down or emptied before any audio arrived. */
    | 'ended'
    /** A different track took over - this watchdog is stale and must stay quiet. */
    | 'superseded'
    /** The caller cancelled. */
    | 'aborted';

export interface PlaybackConfirmation {
    confirmed: boolean;
    streamTimeMs: number;
    reason?: PlaybackFailureReason;
}

export interface PlaybackConfirmationOptions {
    /** Audio (ms) that must be reached before playback counts as real. */
    minStreamTimeMs?: number;
    /** How long to wait for that audio before declaring the stream dead. */
    timeoutMs?: number;
    /** Sampling interval (ms). */
    pollIntervalMs?: number;
    /** Cancels the wait. */
    signal?: AbortSignal;
    /** Injectable clock, for tests. */
    now?: () => number;
    /** Injectable delay, for tests. */
    sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves once the probe reports enough real audio, or once it becomes clear
 * that it never will.
 *
 * A paused queue extends the deadline rather than counting as a stall, because
 * silence while paused is correct behaviour. That cannot spin forever in
 * practice: resuming confirms, skipping reports 'superseded', and stopping or
 * an idle-timeout teardown reports 'ended'. Pass a `signal` if the caller needs
 * a hard bound.
 */
export async function confirmPlaybackWith(
    probe: PlaybackProbeFn,
    options: PlaybackConfirmationOptions = {},
): Promise<PlaybackConfirmation> {
    const minStreamTimeMs = options.minStreamTimeMs ?? MIN_REAL_AUDIO_MS;
    const timeoutMs = options.timeoutMs ?? CONFIRM_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? CONFIRM_POLL_INTERVAL_MS;
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? defaultSleep;
    const signal = options.signal;

    let deadline = now() + timeoutMs;

    for (;;) {
        const snapshot = probe();
        const streamTimeMs = snapshot.streamTimeMs;

        if (streamTimeMs >= minStreamTimeMs) {
            return { confirmed: true, streamTimeMs };
        }

        if (signal?.aborted) {
            return { confirmed: false, streamTimeMs, reason: 'aborted' };
        }

        // Checked before `isCurrent`: a dead queue also has no current track,
        // and 'ended' is the more accurate of the two answers.
        if (snapshot.isDead) {
            return { confirmed: false, streamTimeMs, reason: 'ended' };
        }

        if (!snapshot.isCurrent) {
            return { confirmed: false, streamTimeMs, reason: 'superseded' };
        }

        if (snapshot.isPaused) {
            deadline = now() + timeoutMs;
        } else if (now() >= deadline) {
            return { confirmed: false, streamTimeMs, reason: 'stalled' };
        }

        await sleep(pollIntervalMs);
    }
}

/**
 * Binds a probe to one specific track.
 *
 * Stream time is read from the queue mounted resource
 * (`queue.node.streamTime` -> `dispatcher.streamTime` ->
 * `audioResource.playbackDuration`) rather than from `track.resource`.
 *
 * `Track.resource` looks like the correctly scoped option but is not: the only
 * `Track.setResource()` call in discord-player is on the path that wraps a
 * pre-built AudioResource into a synthetic DISCORD_PLAYER_BLOB track, so for
 * anything resolved through an extractor it stays null forever. Reading it
 * reported 0ms for every track and stalled all of them.
 *
 * Correct scoping comes from the id comparison instead: the queue-level time is
 * reported only while the watched track is the one mounted, and zero otherwise.
 * That is what stops a stale watchdog from confirming on a *later* track audio,
 * which is the bug this indirection exists to prevent.
 */
export function trackProbe(queue: GuildQueue, track: Track): PlaybackProbeFn {
    const watchedId = track.id;

    return () => {
        const isCurrent = queue.currentTrack?.id === watchedId;

        return {
            streamTimeMs: isCurrent ? (queue.node.streamTime ?? 0) : 0,
            isCurrent,
            isDead: queue.deleted || !queue.currentTrack,
            isPaused: queue.node.isPaused(),
        };
    };
}

/** `confirmPlaybackWith` wired to a real queue and track. */
export function confirmPlayback(
    queue: GuildQueue,
    track: Track,
    options: PlaybackConfirmationOptions = {},
): Promise<PlaybackConfirmation> {
    return confirmPlaybackWith(trackProbe(queue, track), options);
}
