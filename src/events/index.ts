import { ChatInputCommandInteraction, Client, Events, Interaction } from 'discord.js'; // Import necessary types

// Import your event handler modules
import { readyEvent } from './ready';
import { interactionCreateEvent } from './interactionCreate';
import { Player } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { YoutubeiExtractor } from 'discord-player-youtubei';

//import { event as interactionCreateEvent } from './interactionCreate';
// ... import other event handlers as you create them (e.g., messageCreate, guildMemberAdd)

// Define a structure for your event modules if you haven't already
// (This was implied by the previous dynamic loader)

const allEvents: any[] = [
  readyEvent,
  interactionCreateEvent,
  // ... add other imported event objects here
];

export function registerEvents(client: Client, player: Player): void {
  for (const event of allEvents) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`[EVTS] Registered event manually: ${event.name}`);
  }

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

export async function registerPlayer(player: Player): Promise<{ success: boolean; error: null; }> {
  await player.extractors.register(YoutubeiExtractor, {});
  return await player.extractors.loadMulti(DefaultExtractors);
}