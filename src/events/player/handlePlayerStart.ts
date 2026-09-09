import type { GuildQueue, Track } from 'discord-player';
import { confirmPlayback } from '../../utils/helpers/playbackWatchdog';
import { CONFIRM_TIMEOUT_MS, MIN_REAL_AUDIO_MS } from '../../utils/helpers/playbackThresholds';
import { defaultStreamFailureMessage, diagnoseStreamFailure } from '../../utils/helpers/streamDiagnostics';
import { announce } from './announce';

/**
 * `playerStart` only means a stream object was handed to the voice connection. The
 * YouTube SABR extractor resolves its stream before fetching any segment, so a 403
 * on the segments ends the stream with zero bytes *after* `playerStart` fired and
 * without emitting `playerError`. Announcing playback on `playerStart` alone is
 * therefore a lie, and it is what hides the breakage from the smoke canary too.
 *
 * The watchdog is bound to `track`, so a handler whose track gets skipped inside
 * the confirmation window reports 'superseded' and stays quiet rather than
 * announcing the wrong title or skipping somebody else's track.
 */
export async function handlePlayerStart(queue: GuildQueue, track: Track): Promise<void> {
    const result = await confirmPlayback(queue, track);

    if (result.confirmed) {
        await announce(queue, `▶️ Zvuková sekvence inicializována: **${track.title}** od ${track.author}!`);
        return;
    }

    // A newer track took over. Whatever happened is that handler's business.
    if (result.reason === 'superseded') {
        console.warn(`[Player] Stale playback watchdog for ${track.title}; a different track is playing now.`);
        return;
    }

    // 'ended' means the queue moved on by itself - nothing left to report or skip.
    if (result.reason === 'ended') {
        console.warn(`[Player] Track ended before producing audio: ${track.title} (${track.url})`);
        return;
    }

    if (result.reason === 'aborted') {
        return;
    }

    // Stalled. The extractor stashes the real cause on the track metadata, which
    // nothing used to read - so this log said "source likely rejected the stream"
    // while the actual reason sat one property away.
    const diagnosis = diagnoseStreamFailure(track.metadata);

    console.error(
        `[Player] No audio after ${CONFIRM_TIMEOUT_MS}ms for ${track.title} (${track.url}); ` +
        `streamTime=${result.streamTimeMs}ms, required=${MIN_REAL_AUDIO_MS}ms. ` +
        (diagnosis
            ? `Cause [${diagnosis.kind}]: ${diagnosis.message}`
            : 'No streamError was recorded by the extractor.'),
    );

    await announce(
        queue,
        `❌ **${track.title}** se nepodařilo přehrát – ${diagnosis?.userMessage ?? defaultStreamFailureMessage()} Přeskakuji.`,
    );

    try {
        if (!queue.deleted) {
            queue.node.skip();
        }
    } catch (error) {
        console.error('[Player] Failed to skip stalled track:', error);
    }
}
