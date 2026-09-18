import { Client } from 'discord.js';
import { Player } from 'discord-player';

// Import your event handler modules
import { readyEvent } from './ready';
import { interactionCreateEvent } from './interactionCreate';
import { BotEvent } from '../types';
import { registerPlayerEvents } from './player';

const allEvents: BotEvent[] = [
    readyEvent,
    interactionCreateEvent,
    // ... add other imported event objects here
];

/**
 * Registers the discord.js client events. The discord-player event surface is
 * its own concern and lives in `./player`.
 */
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
        registerPlayerEvents(player);
    }
}

export { announce, resolveChannel } from './player/announce';
