import { Client, GatewayIntentBits, Events } from 'discord.js';
import { Player } from 'discord-player';
import { config } from './config';
import commandsCollection from './commands';
import { initPlayer, registerExtractors } from './utils/helpers/discordPlayer';
import { closePersistence, initPersistence } from './persistence';
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
            // Tear down through the normal path rather than exiting on the spot:
            // the player already holds native voice/ffmpeg handles by now, and
            // calling process.exit() while those are closing trips a libuv
            // assertion on Windows.
            void shutdown('login failure', 1);
        });

    // Basic error handling
    client.on(Events.Error, console.error);
    client.on(Events.Warn, console.warn);
} 


async function main() {    
    // --- Open the database (migrates, and imports legacy JSON on first run) ---
    await initPersistence();

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
    void shutdown('setup failure', 1);
});

// --- Graceful shutdown ---

let isShuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    console.log(`[SETUP] Lafayette is shutting down (${reason})...`);

    // Hard backstop for a teardown that hangs. Unref'd so it never keeps the
    // process alive on its own, but it still fires if something else does.
    setTimeout(() => {
        console.error('[SETUP] Shutdown did not finish within 5s, forcing exit.');
        process.exit(exitCode || 1);
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

    try {
        // Checkpoints the WAL and releases the file. Without this a stop can
        // leave -wal/-shm behind holding the most recent commits.
        closePersistence();
    } catch (error) {
        console.error('[SETUP] Error while closing the database:', error);
    }

    // Set the code and let the event loop drain rather than calling
    // process.exit(): the voice pipeline's native handles are still finishing
    // their close at this point, and exiting on top of that trips a libuv
    // assertion (`UV_HANDLE_CLOSING`, src/win/async.c) on Windows.
    process.exitCode = exitCode;
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));