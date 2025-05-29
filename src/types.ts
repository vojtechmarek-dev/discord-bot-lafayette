import {
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
  Collection,
  Client,
  // VoiceBasedChannel, // No longer directly needed for queue type
  TextBasedChannel, // Keep if you used it for metadata
} from 'discord.js';
// import { AudioPlayer, VoiceConnection } from '@discordjs/voice'; // No longer directly needed

// Define the structure of a command
export interface Command {
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => Promise<void>;
}

export interface BotEvent {
    name: string; // The name of the discord.js event (e.g., Events.ClientReady)
    once?: boolean; // Whether the event should only run once
    execute: (...args: any[]) => void | Promise<void>; // The function to execute
}
  

// Extend the discord.js Client type for your commands, but not for discord-player's queue
export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

// Augment the module
declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, Command>;
  }
}

// Metadata type for discord-player queue
export interface PlayerQueueMetadata {
    channel?: TextBasedChannel; // Channel where commands are initiated
    interaction?: ChatInputCommandInteraction; // Optionally store the interaction
    // Add any other data you want to associate with a queue
}