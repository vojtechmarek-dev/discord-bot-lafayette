import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config';
import commandsCollection from './commands';
import { initPlayer, registerExtractors } from './utils/helpers/discordPlayer';
import { loadGuildSettings } from './guildSettingsManager';
import { loadGuildState } from './guildStateManager';
import { registerEvents } from './events';
import { ExtendedClient } from './types';

// Create a new Client instance
const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,          // Required for basic server functionality
      GatewayIntentBits.GuildVoiceStates, // Required to manage voice states
      GatewayIntentBits.MessageContent,  // Required to read message content (PRIVILEGED INTENT!)
      // Add other intents as the need arises
      //GatewayIntentBits.GuildMessages,   // Required to receive messages in guilds
    ],
});

// Log in to Discord with your client's token
function clientLogin(client: ExtendedClient) {
    client.login(config.DISCORD_TOKEN)
        .then(() => {
            console.log('Login successful!');
        })
        .catch(error => {
            console.error('Failed to login:', error);
            process.exit(1); // Exit if login fails
        });

    // Basic error handling
    client.on(Events.Error, console.error);
    client.on(Events.Warn, console.warn);
} 


async function main() {    
    // --- Load Guild Settings & State ---
    await loadGuildSettings();
    await loadGuildState();

    // --- Assign Commands to Client ---
    client.commands = commandsCollection; // Assign the pre-populated collection

    // --- Initialize Discord Player ---
    const player = await initPlayer(client);
    await registerExtractors(player);

    // --- Register Events Manually ---
    registerEvents(client, player);

    clientLogin(client);
}

main().catch(error => {
    console.error('[SETUP] Error initializing Lafayette:', error);
}); 

// Optional: Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Lafayette is shutting down...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Lafayette is shutting down...');
    await client.destroy();
    process.exit(0);
});