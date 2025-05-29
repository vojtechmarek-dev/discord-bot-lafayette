import dotenv from 'dotenv';

dotenv.config();

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, YT_CREDENTIALS } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) { // GUILD_ID is optional but recommended for dev
  throw new Error("Missing environment variables: DISCORD_TOKEN or CLIENT_ID are required.");
}
if (!GUILD_ID) {
  console.warn("Warning: GUILD_ID is not set. Slash commands will be registered globally (can take up to an hour to propagate) or you'll need to specify it during deployment.");
}


export const config = {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  YT_CREDENTIALS
};