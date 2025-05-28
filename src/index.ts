import { Client, GatewayIntentBits, Events, Message, Collection } from 'discord.js';
import { config } from './config'; // Or directly use process.env if not using config.ts
import commandsCollection from './commands'; // Import commands collection
import { registerEvents, registerPlayer } from './events';
import { Player } from 'discord-player';

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
const player = new Player(client);

registerPlayer(player).then(result => {
  if (result.success) {
    console.log('[PLAYER] Discord Player initialized successfully.');
    registerEvents(client, player);

  } else {
    console.error('[PLAYER] Failed to initialize Discord Player:', result.error);
  }
}).catch(error => {
  console.error('[PLAYER] Error during Discord Player initialization:', error);
});

// --- Register Events Manually ---
 // Call the function to attach all imported events





// Log in to Discord with your client's token
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

// Optional: Graceful shutdown
process.on('SIGINT', () => {
    console.log('Lafayette is shutting down...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Lafayette is shutting down...');
    client.destroy();
    process.exit(0);
});