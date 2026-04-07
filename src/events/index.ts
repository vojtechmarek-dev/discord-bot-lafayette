import { ChatInputCommandInteraction, Client, Events, Interaction, SendableChannels } from 'discord.js'; // Import necessary types

// Import your event handler modules
import { readyEvent } from './ready';
import { interactionCreateEvent } from './interactionCreate';
import { Player } from 'discord-player';
import { BotEvent, PlayerQueueMetadata } from '../types';

function resolvePlayerNotifyChannel(queueMetadata: unknown): SendableChannels | null {
    if (!queueMetadata || typeof queueMetadata !== 'object') {
        return null;
    }
    const asMeta = queueMetadata as PlayerQueueMetadata;
    if (asMeta.channel?.isTextBased() && asMeta.channel.isSendable()) {
        return asMeta.channel;
    }
    const asInteraction = queueMetadata as ChatInputCommandInteraction;
    if (asInteraction.channel?.isTextBased() && asInteraction.channel.isSendable()) {
        return asInteraction.channel;
    }
    return null;
}

const allEvents: BotEvent[] = [
    readyEvent,
    interactionCreateEvent,
    // ... add other imported event objects here
];

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
            const channel = resolvePlayerNotifyChannel(queue.metadata);
            if (channel) {
                channel.send(`▶️ Zvuková sekvence inicializována: **${track.title}** od ${track.author}!`).catch(console.error);
            }
        });

        player.events.on('error', (queue, error) => {
            // Emitted when the player queue encounters error
            console.log(`General player error event: ${error.message}`);
            console.log(error);
        });

        player.events.on('playerError', (queue, error) => {
            console.error(`[${queue.guild.name}] Player error:`, error);
            const channel = resolvePlayerNotifyChannel(queue.metadata);
            if (channel) {
                channel.send(`❌ Oops! Something went wrong with the player: ${error.message}`).catch(console.error);
            }
        });
    }

}