import { Player, TrackSkipReason } from 'discord-player';
import { diagnoseStreamFailure } from '../../utils/helpers/streamDiagnostics';
import { announceSafely } from './announce';
import { handlePlayerStart } from './handlePlayerStart';

/**
 * Wires the discord-player event surface.
 *
 * Previously only three of roughly a dozen events were handled, and the two
 * most diagnostic ones were missing entirely: `playerSkip` (whose
 * `TrackSkipReason.NoStream` is precisely "the extractor gave us nothing" - the
 * event that would have made the 2026-09-08 silent-playback incident obvious)
 * and the `track` argument of `playerError`.
 */
export function registerPlayerEvents(player: Player): void {
    player.events.on('playerStart', (queue, track) => {
        handlePlayerStart(queue, track).catch((error) => {
            console.error('[Player] playerStart handler failed:', error);
        });
    });

    player.events.on('playerSkip', (queue, track, reason, description) => {
        const diagnosis = diagnoseStreamFailure(track.metadata);
        const detail = diagnosis ? ` cause=[${diagnosis.kind}] ${diagnosis.message}` : '';

        if (reason === TrackSkipReason.NoStream) {
            console.error(
                `[Player] Skipped ${track.title} (${track.url}): the extractor produced no stream. ` +
                `${description}${detail}`,
            );
            return;
        }

        console.log(`[Player] Skipped ${track.title}: ${reason} ${description}`.trim());
    });

    player.events.on('playerError', (queue, error, track) => {
        // Log everything, tell the channel only what is useful to a human.
        console.error(`[${queue.guild?.name ?? 'unknown'}] Player error on ${track?.title ?? 'unknown track'}:`, error);
        announceSafely(
            queue,
            `❌ Přehrávání **${track?.title ?? 'skladby'}** selhalo. Podrobnosti jsem si zapsal, vám by nepomohly.`,
        );
    });

    player.events.on('error', (queue, error) => {
        // Emitted when the player queue itself encounters an error.
        console.error(`[${queue?.guild?.name ?? 'unknown'}] General player error:`, error);
    });

    player.events.on('emptyQueue', (queue) => {
        announceSafely(queue, '📭 Fronta dohrána. Ticho, které následuje, je zasloužené.');
    });

    player.events.on('emptyChannel', (queue) => {
        console.log(`[Player] Voice channel empty in ${queue.guild?.name ?? 'unknown'}; idle timer running.`);
    });

    /**
     * `Player.play` does `if (!queue.channel) await queue.connect(...)`, so a
     * queue left half-alive after the bot is kicked or moved reports itself as
     * still connected and blocks recovery. Tearing it down means the next
     * `/play` reconnects cleanly.
     */
    player.events.on('disconnect', (queue) => {
        console.warn(`[Player] Disconnected from voice in ${queue.guild?.name ?? 'unknown'}.`);
        try {
            if (!queue.deleted) {
                queue.delete();
            }
        } catch (error) {
            console.error('[Player] Failed to clean up queue after disconnect:', error);
        }
    });

    player.events.on('connectionDestroyed', (queue) => {
        console.log(`[Player] Voice connection destroyed in ${queue.guild?.name ?? 'unknown'}.`);
    });

    /**
     * Log only, deliberately. The play commands answer the invoking interaction
     * with "added to the queue" themselves, based on a `currentTrack` read taken
     * *before* the track is added - which is race-free, unlike the four-branch
     * reply ladder this replaced. Announcing here as well would say it twice.
     */
    player.events.on('audioTrackAdd', (queue, track) => {
        console.log(`[Player] Queued ${track.title} (queue length ${queue.tracks.size}).`);
    });

    // Very chatty, and discord-player builds the strings eagerly whenever a
    // listener exists (`hasDebugger` is `listenerCount('debug') > 0`). But it is
    // the only place that reports which extractor ran and whether a fallback was
    // attempted, which is exactly what is needed the next time YouTube breaks.
    if (process.env.LAFAYETTE_PLAYER_DEBUG === '1') {
        player.events.on('debug', (queue, message) => {
            console.log(`[Player:debug] ${queue?.guild?.name ?? 'global'}: ${message}`);
        });
        console.log('[EVTS] Player debug logging enabled (LAFAYETTE_PLAYER_DEBUG=1).');
    }

    console.log('[EVTS] Registered player events.');
}

export { announce, resolveChannel } from './announce';
