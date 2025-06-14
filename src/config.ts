import dotenv from 'dotenv';

dotenv.config();

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, BOT_OWNER_ID, DP_FFMPEG_PATH } = process.env;

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

export const config = {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    BOT_OWNER_ID,
    DP_FFMPEG_PATH
};