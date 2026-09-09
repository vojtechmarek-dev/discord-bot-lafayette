import { ChatInputCommandInteraction, Client, SendableChannels, TextBasedChannel } from 'discord.js'; // Import necessary types

// Import your event handler modules
import { readyEvent } from './ready';
import { interactionCreateEvent } from './interactionCreate';
import { GuildQueue, Player, Track } from 'discord-player';
import { BotEvent } from '../types';
import { confirmPlayback } from '../utils/helpers/playbackWatchdog';

const allEvents: BotEvent[] = [
    readyEvent,
    interactionCreateEvent,
    // ... add other imported event objects here
];

/** Stream time the queue must reach before we tell the channel we are playing. */
const PLAYBACK_CONFIRM_MIN_STREAM_TIME_MS = 500;
const PLAYBACK_CONFIRM_TIMEOUT_MS = 12_000;

type QueueMetadata = {
    channel?: TextBasedChannel;
    interaction?: ChatInputCommandInteraction;
};

/**
 * Resolves the text channel to talk to, whether the queue metadata is the raw
 * interaction (older call sites) or a `PlayerQueueMetadata` object.
 */
function resolveChannel(queue: GuildQueue): SendableChannels | null {
    const metadata = queue.metadata as QueueMetadata | null;
    const channel = metadata?.channel ?? metadata?.interaction?.channel ?? null;
    return channel?.isSendable() ? channel : null;
}

/**
 * Discord throws `Missing Access` (50001) whenever the bot lost permission to the
 * channel the command came from. That is not worth a stack trace on every event.
 */
async function announce(queue: GuildQueue, content: string): Promise<void> {
    const channel = resolveChannel(queue);
    if (!channel) {
        return;
    }
    try {
        await channel.send(content);
    } catch (error: any) {
        if (error?.code === 50001 || error?.code === 50013) {
            console.warn(`[Player] Cannot post to channel ${channel.id}: ${error.rawError?.message ?? error.message}`);
            return;
        }
        console.error('[Player] Failed to send message:', error);
    }
}

/**
 * `playerStart` only means a stream object was handed to the voice connection. The
 * YouTube SABR extractor resolves its stream before fetching any segment, so a 403
 * on the segments ends the stream with zero bytes *after* `playerStart` fired and
 * without emitting `playerError`. Announcing playback on `playerStart` alone is
 * therefore a lie, and it is what hides the breakage from the smoke canary too.
 */
async function handlePlayerStart(queue: GuildQueue, track: Track): Promise<void> {
    const result = await confirmPlayback(queue, {
        minStreamTimeMs: PLAYBACK_CONFIRM_MIN_STREAM_TIME_MS,
        timeoutMs: PLAYBACK_CONFIRM_TIMEOUT_MS,
    });

    if (result.confirmed) {
        await announce(queue, `▶️ Zvuková sekvence inicializována: **${track.title}** od ${track.author}!`);
        return;
    }

    // 'ended' means the queue moved on by itself - nothing left to report or skip.
    if (result.reason === 'ended') {
        console.warn(`[Player] Track ended before producing audio: ${track.title} (${track.url})`);
        return;
    }

    console.error(
        `[Player] No audio after ${PLAYBACK_CONFIRM_TIMEOUT_MS}ms for ${track.title} (${track.url}); ` +
        `streamTime=${result.streamTimeMs}ms. Source likely rejected the stream.`
    );

    await announce(
        queue,
        `❌ **${track.title}** se nepodařilo přehrát – zdroj nevrátil žádný zvuk. Přeskakuji.`
    );

    try {
        if (!queue.deleted) {
            queue.node.skip();
        }
    } catch (error) {
        console.error('[Player] Failed to skip stalled track:', error);
    }
}

export function registerEvents(client: Client, player: Player | null): void {
    for (const event of allEvents) {
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`[EVTS] Registered event manually: ${event.name}`);
    }

    if (player) {
        player.events.on('playerStart', (queue, track) => {
            handlePlayerStart(queue, track).catch((error) => {
                console.error('[Player] playerStart handler failed:', error);
            });
        });

        player.events.on('error', (queue, error) => {
            // Emitted when the player queue encounters error
            console.error(`[${queue?.guild?.name ?? 'unknown'}] General player error:`, error);
        });

        player.events.on('playerError', (queue, error) => {
            console.error(`[${queue.guild.name}] Player error:`, error);
            announce(queue, `❌ Oops! Something went wrong with the player: ${error.message}`)
                .catch((err) => console.error('[Player] Failed to report player error:', err));
        });
    }

}
