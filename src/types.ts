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

export interface PlayerQueueMetadata {
    channel?: TextBasedChannel; // Channel where commands are initiated
    interaction?: ChatInputCommandInteraction; 
}

export type Suit = '♠️' | '♥️' | '♦️' | '♣️' | '🃏';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker';
export interface Card {
    id: string; // Unique ID for each card instance, e.g., "KH" for King of Hearts, "JokerR" for Red Joker
    suit: Suit;
    rank: Rank;
    color: 'red' | 'black'; // Optional, can be derived from suit
}

export type DeckType = 'poker';