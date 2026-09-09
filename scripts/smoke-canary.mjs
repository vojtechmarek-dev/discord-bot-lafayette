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

// `playerStart` fires as soon as an extractor hands discord-player a stream object,
// which the YouTube SABR extractor does *before* fetching a single media segment.
// When the segment fetch then 403s, the stream is ended with zero bytes: no
// `playerError` is emitted and `playerStart` has already fired, so a canary that
// waits for `playerStart` reports a green run while the bot plays silence. The only
// honest signal is the queue actually advancing, so require real decoded audio.
const MIN_AUDIO_MS = 3_000;
const AUDIO_TIMEOUT_MS = 30_000;
const AUDIO_POLL_INTERVAL_MS = 500;

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

function readStreamTime(queue) {
	try {
		return queue?.node?.streamTime ?? 0;
	} catch {
		// `node.streamTime` throws once the underlying audio resource is gone.
		return 0;
	}
}

/**
 * Waits until the queue has actually decoded `MIN_AUDIO_MS` of audio. Rejects if
 * the stream dies, stalls, or the queue empties first.
 */
async function waitForRealAudio(player, guildId, getPlaybackError) {
	const deadline = Date.now() + AUDIO_TIMEOUT_MS;
	let lastStreamTime = 0;

	for (;;) {
		const playbackError = getPlaybackError();
		if (playbackError) {
			throw playbackError;
		}

		const queue = player.nodes.get(guildId);
		const streamTime = readStreamTime(queue);
		lastStreamTime = Math.max(lastStreamTime, streamTime);

		if (streamTime >= MIN_AUDIO_MS) {
			return streamTime;
		}

		if (!queue || queue.deleted || !queue.currentTrack) {
			throw new Error(
				`Playback ended after only ${lastStreamTime}ms of audio (need ${MIN_AUDIO_MS}ms). ` +
				"Extractor most likely returned an empty stream - check the logs for segment 403s."
			);
		}

		if (Date.now() >= deadline) {
			throw new Error(
				`Playback stalled at ${lastStreamTime}ms of audio after ${AUDIO_TIMEOUT_MS}ms (need ${MIN_AUDIO_MS}ms).`
			);
		}

		await new Promise((resolve) => setTimeout(resolve, AUDIO_POLL_INTERVAL_MS));
	}
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
		console.log(`[SMOKE] Stream handed to voice connection in guild ${queue.guild.id}: ${track.cleanTitle}`);
	});

	player.events.on("playerFinish", (_queue, track) => {
		console.log(`[SMOKE] Track finished: ${track.cleanTitle}`);
	});

	player.events.on("emptyQueue", () => {
		console.log("[SMOKE] Queue emptied.");
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

		console.log(`[SMOKE] Verifying real audio (need ${MIN_AUDIO_MS}ms)...`);
		const streamTimeMs = await waitForRealAudio(player, guildId, () => playbackError);

		smokeStatus = "PASSED";
		smokeDetails = `Voice join and ${streamTimeMs}ms of decoded audio confirmed.`;
		console.log(`[SMOKE] SUCCESS: voice + playback canary passed (${streamTimeMs}ms of audio).`);
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
