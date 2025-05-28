import {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    ChatInputCommandInteraction,
    Collection,
    Client // Import Client type
  } from 'discord.js';
  
  // Define the structure of a command
export interface Command {
    data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | SlashCommandSubcommandsOnlyBuilder; // The command's definition
    execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>; // The function to run when the command is called
    // Add any other properties your commands might need, e.g., cooldown, permissions
  }

export interface BotEvent {
    name: string; // The name of the discord.js event (e.g., Events.ClientReady)
    once?: boolean; // Whether the event should only run once
    execute: (...args: any[]) => void | Promise<void>; // The function to execute
}
  
  
  // Extend the discord.js Client type to include a 'commands' property
  declare module 'discord.js' {
    export interface Client {
      commands: Collection<string, Command>;
    }
  }