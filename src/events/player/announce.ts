import type { SendableChannels } from 'discord.js';
import type { GuildQueue } from 'discord-player';
import type { QueueContext } from '../../utils/helpers/queueFactory';

/**
 * Resolves the text channel to talk to, tolerating both shapes the metadata has
 * had: a `QueueContext` object, or a bare interaction from older call sites.
 */
export function resolveChannel(queue: GuildQueue): SendableChannels | null {
    const metadata = queue.metadata as QueueContext | null;
    const channel = metadata?.channel ?? metadata?.interaction?.channel ?? null;
    return channel?.isSendable() ? channel : null;
}

/**
 * Discord throws `Missing Access` (50001) whenever the bot lost permission to the
 * channel the command came from. That is not worth a stack trace on every event.
 */
export async function announce(queue: GuildQueue, content: string): Promise<void> {
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

/** Fire-and-forget `announce`, for use inside synchronous event handlers. */
export function announceSafely(queue: GuildQueue, content: string): void {
    announce(queue, content).catch((error) => {
        console.error('[Player] Failed to announce:', error);
    });
}
