import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import { config } from './config'; // Or directly use process.env if not using config.ts

// Create a new Client instance
const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,          // Required for basic server functionality
      GatewayIntentBits.GuildMessages,   // Required to receive messages in guilds
      GatewayIntentBits.GuildVoiceStates, // Required to manage voice states
      GatewayIntentBits.MessageContent,  // Required to read message content (PRIVILEGED INTENT!)
      // Add other intents your bot needs, e.g., GatewayIntentBits.GuildMembers
    ],
  });

  // When the client is ready, run this code (only once)
client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log(`🤖 Lafayette is serving ${client.guilds.cache.size} guilds.`);
    // You can set the bot's presence here
    client.user?.setPresence({
        activities: [{ name: 'your commands | /help' }], // Example activity
        status: 'online', // online, idle, dnd, invisible
    });
});

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