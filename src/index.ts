import { Client, GatewayIntentBits, Events, Message, Collection } from 'discord.js';
import { config } from './config'; // Or directly use process.env if not using config.ts
import commandsCollection from './commands'; // Import commands collection
import { initPlayer, registerExtractors } from './utils/helpers/discordPlayer';
import { registerEvents } from './events';
import { ExtendedClient } from './types';

// Create a new Client instance
const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,          // Required for basic server functionality
      //GatewayIntentBits.GuildMessages,   // Required to receive messages in guilds
      GatewayIntentBits.GuildVoiceStates, // Required to manage voice states
      GatewayIntentBits.MessageContent,  // Required to read message content (PRIVILEGED INTENT!)
      // Add other intents your bot needs, e.g., GatewayIntentBits.GuildMembers
    ],
});

// --- Assign Commands to Client ---
client.commands = commandsCollection; // Assign the pre-populated collection

// --- Initialize Discord Player ---

(async () => {
    const player = await initPlayer(client);
    await registerExtractors(player);
    registerEvents(client, player);

    clientLogin(client);
})().catch(error => {
    console.error('[SETUP] Error initializing Lafayette:', error);
});



// --- Register Events Manually ---
 // Call the function to attach all imported events

// Log in to Discord with your client's token
function clientLogin(client: ExtendedClient) {
    client.login(config.DISCORD_TOKEN) // Or process.env.DISCORD_TOKEN
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