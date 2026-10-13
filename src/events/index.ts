import { Client } from 'discord.js';
import { Player } from 'discord-player';

// Import your event handler modules
import { readyEvent } from './ready';
import { interactionCreateEvent } from './interactionCreate';
import { BotEvent } from '../types';
import { registerPlayerEvents } from './player';
import { startSourceMonitor } from '../utils/helpers/sourceMonitor';

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

    // Periodic end-to-end check from production, which is the only host with
    // the residential IP that makes a YouTube result meaningful.
    startSourceMonitor(client, player);
}

export { announce, resolveChannel } from './player/announce';
