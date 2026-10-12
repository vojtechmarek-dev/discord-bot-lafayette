import {
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  Collection,
  Client,
} from 'discord.js';

// Define the structure of a command
export interface Command {
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => Promise<void>;
  /**
   * Optional suggestion handler for options declared with setAutocomplete(true).
   *
   * Autocomplete arrives through interactionCreate like any other interaction,
   * but needs no persistence, no custom ids and no collectors - so it is the one
   * slice of component routing that can land on its own.
   */
  autocomplete?: (interaction: AutocompleteInteraction, client: ExtendedClient) => Promise<void>;
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

// Queue metadata lives in `utils/helpers/queueFactory` as `QueueContext`, next
// to the node options it is passed with.

export type Suit = '♠️' | '♥️' | '♦️' | '♣️' | '🃏';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker';
export interface Card {
    id: string; // Unique ID for each card instance, e.g., "KH" for King of Hearts, "JokerR" for Red Joker
    suit: Suit;
    rank: Rank;
    color: 'red' | 'black'; // Optional, can be derived from suit
}

export type DeckType = 'poker';