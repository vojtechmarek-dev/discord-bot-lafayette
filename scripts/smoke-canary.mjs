import "dotenv/config";
import { ChannelType, Client, GatewayIntentBits } from "discord.js";
import { Player, QueryType } from "discord-player";
import { YoutubeSabrExtractor } from "discord-player-googlevideo";

const {
	DISCORD_TOKEN_CANARY,
	CANARY_GUILD_ID,
	CANARY_VOICE_CHANNEL_ID,
	CANARY_TEXT_CHANNEL_ID,
	CANARY_QUERY,
	DP_FFMPEG_PATH,
} = process.env;

const JOIN_TIMEOUT_MS = 30_000;
const PLAYBACK_TIMEOUT_MS = 45_000;
const DEFAULT_QUERY = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function requiredEnv(name, value) {
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function withTimeout(promise, timeoutMs, label) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		promise
			.then((result) => {
				clearTimeout(timeout);
				resolve(result);
			})
			.catch((error) => {
				clearTimeout(timeout);
				reject(error);
			});
	});
}

async function postCanaryStatus(client, status, details) {
	if (status === "ABORTED") {
		return;
	}

	if (!CANARY_TEXT_CHANNEL_ID) {
		return;
	}

	if (!client.isReady()) {
		return;
	}

	try {
		const channel = await client.channels.fetch(CANARY_TEXT_CHANNEL_ID);
		if (!channel || !channel.isTextBased()) {
			console.warn("[SMOKE] CANARY_TEXT_CHANNEL_ID is not a text channel.");
			return;
		}

		const icon = status === "PASSED" ? "✅" : "❌";
		const timestamp = new Date().toISOString();
		await channel.send(
			`${icon} Smoke canary ${status} at ${timestamp}\n` +
			`Guild: ${CANARY_GUILD_ID}\n` +
			`Voice channel: ${CANARY_VOICE_CHANNEL_ID}\n` +
			`Details: ${details}`
		);
	} catch (error) {
		console.warn("[SMOKE] Failed to post canary status message:", error);
	}
}

function isAbortLikeError(error) {
	if (!error) {
		return false;
	}

	const message = error instanceof Error ? error.message : String(error);
	const lowered = message.toLowerCase();
	return (
		lowered.includes("the operation was aborted") ||
		lowered.includes("operation was aborted") ||
		lowered.includes("aborterror") ||
		lowered.includes("aborted")
	);
}

async function runCanary() {
	const token = requiredEnv("DISCORD_TOKEN_CANARY", DISCORD_TOKEN_CANARY);
	const guildId = requiredEnv("CANARY_GUILD_ID", CANARY_GUILD_ID);
	const voiceChannelId = requiredEnv("CANARY_VOICE_CHANNEL_ID", CANARY_VOICE_CHANNEL_ID);
	const query = CANARY_QUERY || DEFAULT_QUERY;

	const client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
	});
	const player = new Player(client, {
		ffmpegPath: DP_FFMPEG_PATH,
	});

	let playbackStarted = false;
	let playbackError = null;
	let smokeStatus = "FAILED";
	let smokeDetails = "Unknown failure";

	player.events.on("playerStart", (queue, track) => {
		playbackStarted = true;
		console.log(`[SMOKE] Playback started in guild ${queue.guild.id}: ${track.cleanTitle}`);
	});

	player.events.on("playerError", (queue, error) => {
		playbackError = error;
		const guildLabel = queue ? queue.guild.id : "unknown-guild";
		console.error(`[SMOKE] Player error in ${guildLabel}:`, error);
	});

	player.events.on("error", (queue, error) => {
		playbackError = error;
		const guildLabel = queue ? queue.guild.id : "unknown-guild";
		console.error(`[SMOKE] Queue error in ${guildLabel}:`, error);
	});

	try {
		console.log("[SMOKE] Logging in canary bot...");
		await client.login(token);
		await withTimeout(
			new Promise((resolve) => {
				if (client.isReady()) {
					resolve();
					return;
				}
				client.once("ready", () => {
					resolve();
				});
			}),
			JOIN_TIMEOUT_MS,
			"Client ready"
		);

		console.log(`[SMOKE] Client ready as ${client.user.tag}`);
		console.log("[SMOKE] Registering Youtube extractor...");
		await player.extractors.register(YoutubeSabrExtractor, {});

		const guild = await client.guilds.fetch(guildId);
		if (!guild) {
			throw new Error(`Guild not found: ${guildId}`);
		}

		const channel = await guild.channels.fetch(voiceChannelId);
		if (!channel) {
			throw new Error(`Voice channel not found: ${voiceChannelId}`);
		}
		if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
			throw new Error(`Channel ${voiceChannelId} is not a voice/stage channel.`);
		}

		console.log(`[SMOKE] Searching query: ${query}`);
		const searchResult = await player.search(query, {
			searchEngine: QueryType.AUTO,
			requestedBy: client.user,
		});
		if (!searchResult || !searchResult.hasTracks()) {
			throw new Error("No tracks found for canary query.");
		}

		console.log("[SMOKE] Starting playback...");
		await withTimeout(
			player.play(channel, searchResult, {
				nodeOptions: {
					volume: 20,
					leaveOnEnd: true,
					leaveOnEndCooldown: 5_000,
					leaveOnEmpty: true,
					leaveOnEmptyCooldown: 5_000,
					selfDeaf: true,
				},
			}),
			JOIN_TIMEOUT_MS,
			"Start playback"
		);

		await withTimeout(
			new Promise((resolve, reject) => {
				const interval = setInterval(() => {
					if (playbackError) {
						clearInterval(interval);
						reject(playbackError);
						return;
					}
					if (playbackStarted) {
						clearInterval(interval);
						resolve();
					}
				}, 500);
			}),
			PLAYBACK_TIMEOUT_MS,
			"Wait for playerStart"
		);

		smokeStatus = "PASSED";
		smokeDetails = "Voice join and playback start completed.";
		console.log("[SMOKE] SUCCESS: voice + playback canary passed.");
	} catch (error) {
		smokeStatus = "FAILED";
		smokeDetails = error instanceof Error ? error.message : String(error);
		if (isAbortLikeError(error)) {
			smokeStatus = "ABORTED";
		}
		throw error;
	} finally {
		await postCanaryStatus(client, smokeStatus, smokeDetails);

		const queue = player.nodes.get(CANARY_GUILD_ID || "");
		if (queue) {
			try {
				queue.delete();
			} catch (error) {
				console.warn("[SMOKE] Queue cleanup warning:", error);
			}
		}
		await client.destroy();
	}
}

runCanary()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error("[SMOKE] FAILED:", error);
		process.exit(1);
	});
