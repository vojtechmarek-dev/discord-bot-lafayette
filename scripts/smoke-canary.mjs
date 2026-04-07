import "dotenv/config";
import { ChannelType, Client, Events, GatewayIntentBits } from "discord.js";
import { Player, QueryType } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";

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
const DEFAULT_FALLBACK_VIDEO_ID = "dQw4w9WgXcQ";

/**
 * YOUTUBE_VIDEO handling in discord-player-youtubei runs getBasicInfo + chooseFormat(webm audio).
 * That often throws for some InnerTube clients (e.g. TV_EMBEDDED) and discord-player turns it
 * into an empty SearchResult. Search-by-keyword avoids that path.
 */
function extractYoutubeVideoId(input) {
	if (!input || typeof input !== "string") {
		return null;
	}
	try {
		const url = new URL(input.trim());
		const v = url.searchParams.get("v");
		if (v && /^[\w-]{11}$/.test(v)) {
			return v;
		}
		if (url.hostname === "youtu.be") {
			const id = url.pathname.replace(/^\//, "").split("/")[0];
			if (id && /^[\w-]{11}$/.test(id)) {
				return id;
			}
		}
	} catch {
		if (/^[\w-]{11}$/.test(input.trim())) {
			return input.trim();
		}
	}
	return null;
}

async function searchWithYoutubeFallbacks(player, client, primaryQuery) {
	const requestedBy = client.user;
	const attempts = [
		{
			label: "AUTO (URL or query)",
			run: () =>
				player.search(primaryQuery, {
					searchEngine: QueryType.AUTO,
					requestedBy,
				}),
		},
		{
			label: `YOUTUBE_SEARCH (video id ${extractYoutubeVideoId(primaryQuery) || DEFAULT_FALLBACK_VIDEO_ID})`,
			run: () =>
				player.search(extractYoutubeVideoId(primaryQuery) || DEFAULT_FALLBACK_VIDEO_ID, {
					searchEngine: QueryType.YOUTUBE_SEARCH,
					requestedBy,
				}),
		},
		{
			label: "ytsearch (keyword)",
			run: () =>
				player.search("ytsearch:never gonna give you up rick astley official", {
					requestedBy,
				}),
		},
	];

	let lastError = null;
	for (const { label, run } of attempts) {
		try {
			const result = await run();
			if (result && result.hasTracks()) {
				if (label !== attempts[0].label) {
					console.log(`[SMOKE] Search ok via fallback: ${label}`);
				}
				return result;
			}
			console.warn(`[SMOKE] No tracks from strategy: ${label}`);
		} catch (error) {
			lastError = error;
			console.warn(`[SMOKE] Search failed (${label}):`, error);
		}
	}

	if (lastError) {
		throw lastError;
	}
	throw new Error("No tracks found for canary query (all search strategies returned empty).");
}

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
				client.once(Events.ClientReady, () => {
					resolve();
				});
			}),
			JOIN_TIMEOUT_MS,
			"Client ready"
		);

		console.log(`[SMOKE] Client ready as ${client.user.tag}`);
		console.log("[SMOKE] Registering Youtube extractor...");
		await player.extractors.register(YoutubeiExtractor, {
			generateWithPoToken: true,
			disablePlayer: true,
			streamOptions: { useClient: "TV_EMBEDDED" },
		});

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
		const searchResult = await searchWithYoutubeFallbacks(player, client, query);

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
