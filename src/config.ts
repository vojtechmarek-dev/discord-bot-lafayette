import dotenv from 'dotenv';

dotenv.config();

const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    BOT_OWNER_ID,
    DP_FFMPEG_PATH,
    LAFAYETTE_HEALTH_CHANNEL_ID,
    LAFAYETTE_PROBE_INTERVAL_MS,
} = process.env;

console.log(`[Config] Raw BOT_OWNER_ID from process.env: ${BOT_OWNER_ID ? 'SET' : 'NOT SET'}`);


if (!DISCORD_TOKEN || !CLIENT_ID) { // GUILD_ID is optional but recommended for dev
    throw new Error("Missing environment variables: DISCORD_TOKEN or CLIENT_ID are required.");
}

if (!GUILD_ID) {
    console.warn("[Config] Warning: GUILD_ID is not set. Slash commands will be registered globally (can take up to an hour to propagate) or you'll need to specify it during deployment.");
}

if (!BOT_OWNER_ID) {
    console.warn("[Config] Warning: BOT_OWNER_ID is not set. Owner-only commands will not function correctly.");
}

/**
 * How often to probe each audio source from production. Six hours by default:
 * frequent enough to notice an outage the same day, rare enough that it is not
 * itself traffic worth rate-limiting. Set to 0 to disable probing entirely.
 */
const probeInterval = Number.parseInt(LAFAYETTE_PROBE_INTERVAL_MS ?? '', 10);

export const config = {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    BOT_OWNER_ID,
    DP_FFMPEG_PATH,
    /** Optional channel for source-health notices. Logs only when unset. */
    HEALTH_CHANNEL_ID: LAFAYETTE_HEALTH_CHANNEL_ID,
    PROBE_INTERVAL_MS: Number.isFinite(probeInterval) && probeInterval >= 0
        ? probeInterval
        : 6 * 60 * 60 * 1000,
};