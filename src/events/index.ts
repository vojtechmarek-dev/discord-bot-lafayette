import { ChatInputCommandInteraction, Client, Events, Interaction } from 'discord.js'; // Import necessary types

// Import your event handler modules
import { readyEvent } from './ready';
import { interactionCreateEvent } from './interactionCreate';
import { Player } from 'discord-player';
import { BotEvent } from '../types';

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
            // we will later define queue.metadata object while creating the queue
            const metadata = queue.metadata as { channel?: any, interaction?: ChatInputCommandInteraction }; // Define a type for metadata
            if (metadata?.channel) {
                metadata.channel.send(`▶️ Now playing: **${track.title}** by ${track.author}!`).catch(console.error);
            }
        });

        player.events.on('playerError', (queue, error) => {
            console.error(`[${queue.guild.name}] Player error:`, error);
            const metadata = queue.metadata as { channel?: any };
            if (metadata?.channel) {
                metadata.channel.send(`❌ Oops! Something went wrong with the player: ${error.message}`).catch(console.error);
            }
        });
    }

}