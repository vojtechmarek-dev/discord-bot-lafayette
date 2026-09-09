import { Client, GatewayIntentBits, Events } from 'discord.js';
import { Player } from 'discord-player';
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
      // Add other intents as the need arises. Note that MessageContent and
      // GuildMessages are both needed before any messageCreate handler can work;
      // the bot is slash-command only, so neither is requested.
    ],
});

// Hoisted out of main() so the shutdown handlers can tear it down.
let player: Player | null = null;

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
    player = await initPlayer(client);
    await registerExtractors(player);

    // --- Register Events Manually ---
    registerEvents(client, player);

    clientLogin(client);
}

main().catch(error => {
    console.error('[SETUP] Error initializing Lafayette:', error);
    // Exit rather than linger: a failure here (player init, extractor
    // registration) leaves a process that answers nothing, and the healthcheck
    // would only notice it after the start period plus three retries.
    process.exit(1);
});

// --- Graceful shutdown ---

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    console.log(`[SETUP] Lafayette is shutting down (${signal})...`);

    // Never let a hung teardown block the container stop.
    setTimeout(() => {
        console.error('[SETUP] Shutdown did not finish within 5s, forcing exit.');
        process.exit(1);
    }, 5000).unref();

    try {
        // Disconnects voice, clears queues and releases the audio pipeline.
        await player?.destroy();
    } catch (error) {
        console.error('[SETUP] Error while destroying the player:', error);
    }

    try {
        await client.destroy();
    } catch (error) {
        console.error('[SETUP] Error while destroying the client:', error);
    }

    process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));