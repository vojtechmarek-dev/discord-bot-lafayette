import { Client, Events, Interaction } from 'discord.js'; // Import necessary types

// Import your event handler modules
import { readyEvent } from './ready';
import { BotEvent } from '../types';
import { interactionCreateEvent } from './interactionCreate';

//import { event as interactionCreateEvent } from './interactionCreate';
// ... import other event handlers as you create them (e.g., messageCreate, guildMemberAdd)

// Define a structure for your event modules if you haven't already
// (This was implied by the previous dynamic loader)

const allEvents: BotEvent[] = [
  readyEvent,
  interactionCreateEvent,
  // ... add other imported event objects here
];

export function registerEvents(client: Client): void {
  for (const event of allEvents) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`[EVTS] Registered event manually: ${event.name}`);
  }
}