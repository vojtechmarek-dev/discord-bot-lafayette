import type { ChatInputCommandInteraction, TextBasedChannel } from 'discord.js';
import type { GuildNodeCreateOptions, GuildQueue } from 'discord-player';

export interface QueueContext {
    /** Channel the command came from, used for playback announcements. */
    channel?: TextBasedChannel;
    interaction?: ChatInputCommandInteraction;
}

/**
 * One shared set of queue options for every play path.
 *
 * `/play` and `/playfile` previously passed their own copies, which disagreed:
 * 30s idle cooldowns versus 300000ms. That divergence was invisible anyway,
 * because `nodes.create()` returns the *cached* queue for a guild and never
 * re-applies options - so whichever command created the queue first silently
 * decided the settings for every later one.
 */
export const BASE_NODE_OPTIONS: Omit<GuildNodeCreateOptions<QueueContext>, 'metadata'> = {
    volume: 50,
    selfDeaf: true,

    // 5 minutes, not 30s. A D&D session has long lulls, and leaving the channel
    // means the next /play pays full reconnect and extraction latency.
    leaveOnEmpty: true,
    leaveOnEmptyCooldown: 300_000,
    leaveOnEnd: true,
    leaveOnEndCooldown: 300_000,

    // The library default auto-pauses when the voice channel empties. Combined
    // with leaveOnEmpty that is redundant, and it makes the playback watchdog
    // extend its deadline indefinitely while nobody is listening.
    pauseOnEmpty: false,

    /**
     * The important one. With fallback enabled, a failed stream is silently
     * retried as a `${title} ${author}` search on a *different* extractor and
     * the first hit is played - no verification, no bot-level log, and
     * `bridgedTrack` quietly swapped underneath. That is a machine for playing
     * the wrong song into a live session, where a wrong song is worse than
     * silence.
     *
     * Substitution now happens only where it is semantically correct: Spotify,
     * which has no stream of its own, via the explicit `bridge()` on the
     * YouTube extractor.
     */
    disableFallbackStream: true,
};

/**
 * Points an existing queue's announcements at the channel that most recently
 * invoked a play command.
 *
 * Needed because `nodes.create()` ignores options for an existing queue, so
 * without this every announcement keeps going to whichever channel started the
 * queue - even after someone plays from somewhere else.
 */
export function refreshQueueMetadata(queue: GuildQueue | null | undefined, context: QueueContext): void {
    if (!queue || queue.deleted) {
        return;
    }
    queue.setMetadata(context);
}

/** `BASE_NODE_OPTIONS` plus the per-invocation metadata. */
export function buildNodeOptions(context: QueueContext): GuildNodeCreateOptions<QueueContext> {
    return { ...BASE_NODE_OPTIONS, metadata: context };
}
