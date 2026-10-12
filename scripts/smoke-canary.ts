import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChannelType, Client, GatewayIntentBits, type VoiceBasedChannel } from 'discord.js';
import { QueryType, type GuildQueue, type Track } from 'discord-player';
import { initPlayer, registerExtractors } from '../src/utils/helpers/discordPlayer';
import { EXTRACTOR_IDS } from '../src/utils/helpers/extractors';
import { confirmPlaybackWith, trackProbe } from '../src/utils/helpers/playbackWatchdog';
import { CONFIRM_TIMEOUT_MS, MIN_REAL_AUDIO_MS } from '../src/utils/helpers/playbackThresholds';
import { routeQuery } from '../src/utils/helpers/queryRouter';
import { diagnoseStreamFailure } from '../src/utils/helpers/streamDiagnostics';

/**
 * Live voice/playback canary.
 *
 * Runs the *bot's own* pipeline rather than a parallel reimplementation: the
 * same extractor registration, the same query router, the same playback
 * watchdog and the same audio thresholds. The previous version duplicated all
 * of that with its own constants, so it could pass while production was broken
 * and vice versa - production required 500ms of audio while the canary demanded
 * 3000ms, which meant they were testing different bots.
 *
 * It also registered only the YouTube extractor, so it could not catch a
 * SoundCloud, Spotify or attachment regression at all.
 */

const {
    DISCORD_TOKEN_CANARY,
    CANARY_GUILD_ID,
    CANARY_VOICE_CHANNEL_ID,
    CANARY_TEXT_CHANNEL_ID,
    CANARY_SOUNDCLOUD_QUERY,
    CANARY_SPOTIFY_URL,
    CANARY_YOUTUBE_QUERY,
    SMOKE_REPORT_PATH,
} = process.env;

const READY_TIMEOUT_MS = 30_000;
const PLAY_TIMEOUT_MS = 45_000;

type LegId = 'attachment' | 'soundcloud' | 'bridge' | 'youtube';

interface Leg {
    id: LegId;
    label: string;
    /**
     * Required legs gate the build. Only legs that do not depend on YouTube
     * being reachable qualify - see the note on `bridge` and `youtube` below.
     */
    required: boolean;
    /** Resolved lazily so the attachment leg can generate its file first. */
    query: () => Promise<string> | string;
    searchEngine?: (typeof QueryType)[keyof typeof QueryType];
    /** Extra assertion once real audio is confirmed. Returns a failure reason. */
    verify?: (track: Track) => string | null;
}

interface LegResult {
    leg: LegId;
    label: string;
    required: boolean;
    status: 'passed' | 'failed' | 'skipped';
    streamTimeMs?: number;
    bridgedVia?: string | null;
    trackTitle?: string;
    detail?: string;
    diagnosis?: string;
}

function requiredEnv(name: string, value: string | undefined): string {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
}

/**
 * Writes a few seconds of quiet noise as a 16-bit PCM WAV.
 *
 * Generated rather than downloaded so the one leg that gates the build depends
 * on nothing outside this process - no CDN, no rate limit, no third party
 * having a bad day. AttachmentExtractor accepts it because file-type reports
 * `audio/wav`.
 */
function writeProbeWav(seconds = 6): string {
    const sampleRate = 48_000;
    const channels = 2;
    const bytesPerSample = 2;
    const frames = sampleRate * seconds;
    const dataBytes = frames * channels * bytesPerSample;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataBytes, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
    header.writeUInt16LE(channels * bytesPerSample, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataBytes, 40);

    const data = Buffer.alloc(dataBytes);
    for (let frame = 0; frame < frames; frame++) {
        // Quiet noise rather than silence: silence can be optimised away and
        // would not prove the pipeline actually moved samples.
        const sample = Math.round((Math.random() * 2 - 1) * 800);
        for (let channel = 0; channel < channels; channel++) {
            data.writeInt16LE(sample, (frame * channels + channel) * bytesPerSample);
        }
    }

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lafayette-canary-')), 'probe.wav');
    fs.writeFileSync(file, Buffer.concat([header, data]));
    return file;
}

const LEGS: Leg[] = [
    {
        id: 'attachment',
        label: 'Local file (AttachmentExtractor)',
        required: true,
        query: () => writeProbeWav(),
        searchEngine: QueryType.FILE,
    },
    {
        id: 'soundcloud',
        label: 'SoundCloud search',
        required: true,
        query: () => CANARY_SOUNDCLOUD_QUERY || 'scsearch:lofi hip hop',
    },
    {
        /**
         * Informational, despite being the regression with no other end-to-end
         * cover: bridging goes Spotify -> YouTube, so it fails whenever YouTube
         * refuses the runner's datacenter IP, which has nothing to do with this
         * repository's code.
         *
         * The wiring it would protect is gated offline instead, in
         * test/extractor-contract.test.ts: that YouTube defines its own
         * bridge() and outranks SoundCloud. Removing either - the way this
         * actually regresses - fails CI on every PR rather than weekly here.
         */
        id: 'bridge',
        label: 'Spotify bridged to YouTube',
        required: false,
        query: () => CANARY_SPOTIFY_URL || 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        verify: (track) => {
            const via = track.bridgedExtractor?.identifier ?? null;
            if (via === EXTRACTOR_IDS.youtube) {
                return null;
            }
            return `Expected the bridge to use YouTube, got ${via ?? 'no bridged extractor'}.`;
        },
    },
    {
        /**
         * Informational on purpose. GitHub-hosted runners are datacenter IPs
         * and YouTube rates them harshly, so this leg goes red for reasons
         * unrelated to the code. A check that reddens for external reasons is
         * not a gate, it is noise that trains you to ignore CI - but "did
         * YouTube break again?" is still worth asking weekly.
         */
        id: 'youtube',
        label: 'YouTube search',
        required: false,
        query: () => CANARY_YOUTUBE_QUERY || 'ytsearch:never gonna give you up',
    },
];

async function runLeg(
    leg: Leg,
    player: Awaited<ReturnType<typeof initPlayer>>,
    channel: VoiceBasedChannel,
    client: Client,
): Promise<LegResult> {
    const base: LegResult = { leg: leg.id, label: leg.label, required: leg.required, status: 'failed' };

    let queue: GuildQueue | null = null;
    let playbackError: Error | null = null;

    const onError = (_queue: GuildQueue, error: Error) => { playbackError = error; };
    player.events.on('playerError', onError);
    player.events.on('error', onError);

    try {
        const raw = await leg.query();
        // Route exactly as /play does, so the canary exercises the real
        // decision rather than a hand-written prefix.
        const routed = leg.searchEngine ? { query: raw, source: 'attachment' } : routeQuery(raw);
        console.log(`[SMOKE] ${leg.id}: "${raw}" -> "${routed.query}"`);

        const searchResult = await player.search(routed.query, {
            requestedBy: client.user ?? undefined,
            searchEngine: leg.searchEngine ?? QueryType.AUTO,
        });

        if (!searchResult?.hasTracks()) {
            return { ...base, detail: 'No tracks found.' };
        }

        const played = await withTimeout(
            player.play(channel, searchResult, {
                nodeOptions: {
                    volume: 20,
                    selfDeaf: true,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 5_000,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 5_000,
                    pauseOnEmpty: false,
                    disableFallbackStream: true,
                },
            }),
            PLAY_TIMEOUT_MS,
            `${leg.id} play()`,
        );

        queue = played.queue;
        const track = played.track;

        // The bot's own watchdog, with the bot's own thresholds.
        const confirmation = await confirmPlaybackWith(trackProbe(queue, track), {
            minStreamTimeMs: MIN_REAL_AUDIO_MS,
            timeoutMs: CONFIRM_TIMEOUT_MS,
        });

        const diagnosis = diagnoseStreamFailure(track.metadata);

        if (!confirmation.confirmed) {
            return {
                ...base,
                streamTimeMs: confirmation.streamTimeMs,
                trackTitle: track.title,
                detail:
                    `Only ${confirmation.streamTimeMs}ms of audio (need ${MIN_REAL_AUDIO_MS}ms), ` +
                    `reason=${confirmation.reason}` +
                    (playbackError ? `, playerError=${(playbackError as Error).message}` : ''),
                diagnosis: diagnosis ? `${diagnosis.kind}: ${diagnosis.message}` : undefined,
            };
        }

        const verifyFailure = leg.verify?.(track) ?? null;
        if (verifyFailure) {
            return {
                ...base,
                streamTimeMs: confirmation.streamTimeMs,
                trackTitle: track.title,
                bridgedVia: track.bridgedExtractor?.identifier ?? null,
                detail: verifyFailure,
            };
        }

        return {
            ...base,
            status: 'passed',
            streamTimeMs: confirmation.streamTimeMs,
            trackTitle: track.title,
            bridgedVia: track.bridgedExtractor?.identifier ?? null,
        };
    } catch (error) {
        return { ...base, detail: error instanceof Error ? error.message : String(error) };
    } finally {
        player.events.off('playerError', onError);
        player.events.off('error', onError);
        try {
            if (queue && !queue.deleted) {
                queue.delete();
            }
        } catch {
            // Already gone; nothing to clean up.
        }
    }
}

function renderSummary(results: LegResult[]): string {
    return results
        .map((result) => {
            const icon = result.status === 'passed' ? '✅' : result.required ? '❌' : '⚠️';
            const gate = result.required ? 'required' : 'informational';
            const audio = result.streamTimeMs !== undefined ? ` ${result.streamTimeMs}ms` : '';
            const via = result.bridgedVia ? ` via ${result.bridgedVia}` : '';
            const detail = result.detail ? ` - ${result.detail}` : '';
            return `${icon} ${result.label} (${gate})${audio}${via}${detail}`;
        })
        .join('\n');
}

async function postSummary(client: Client, results: LegResult[], ok: boolean): Promise<void> {
    if (!CANARY_TEXT_CHANNEL_ID || !client.isReady()) {
        return;
    }
    try {
        const channel = await client.channels.fetch(CANARY_TEXT_CHANNEL_ID);
        if (!channel?.isTextBased() || !channel.isSendable()) {
            return;
        }
        await channel.send(
            `${ok ? '✅' : '❌'} Smoke canary ${ok ? 'PASSED' : 'FAILED'} at ${new Date().toISOString()}\n` +
            '```\n' + renderSummary(results) + '\n```',
        );
    } catch (error) {
        console.warn('[SMOKE] Could not post summary:', error);
    }
}

async function main(): Promise<void> {
    const token = requiredEnv('DISCORD_TOKEN_CANARY', DISCORD_TOKEN_CANARY);
    const guildId = requiredEnv('CANARY_GUILD_ID', CANARY_GUILD_ID);
    const voiceChannelId = requiredEnv('CANARY_VOICE_CHANNEL_ID', CANARY_VOICE_CHANNEL_ID);

    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
    const player = await initPlayer(client as never);

    const results: LegResult[] = [];
    let ok = false;

    try {
        await client.login(token);
        await withTimeout(
            new Promise<void>((resolve) => {
                if (client.isReady()) { resolve(); return; }
                client.once('clientReady', () => resolve());
            }),
            READY_TIMEOUT_MS,
            'Client ready',
        );
        console.log(`[SMOKE] Ready as ${client.user?.tag}`);

        // Production registration, so a contract regression surfaces here too.
        await registerExtractors(player);

        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(voiceChannelId);
        if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            throw new Error(`Channel ${voiceChannelId} is not a voice or stage channel.`);
        }

        for (const leg of LEGS) {
            const result = await runLeg(leg, player, channel, client);
            results.push(result);
            console.log(`[SMOKE] ${result.status.toUpperCase()} ${result.label}${result.detail ? ` - ${result.detail}` : ''}`);
        }

        ok = results.every((result) => !result.required || result.status === 'passed');
    } catch (error) {
        console.error('[SMOKE] Canary aborted:', error);
        results.push({
            leg: 'attachment',
            label: 'Canary setup',
            required: true,
            status: 'failed',
            detail: error instanceof Error ? error.message : String(error),
        });
        ok = false;
    } finally {
        const report = { generatedAt: new Date().toISOString(), ok, results };
        const reportPath = SMOKE_REPORT_PATH || 'smoke-report.json';
        try {
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`[SMOKE] Report written to ${reportPath}`);
        } catch (error) {
            console.warn('[SMOKE] Could not write report:', error);
        }

        console.log('\n' + renderSummary(results) + '\n');
        await postSummary(client, results, ok);

        try { await player.destroy(); } catch { /* best effort */ }
        try { await client.destroy(); } catch { /* best effort */ }
    }

    // Only required legs gate the build.
    process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
    console.error('[SMOKE] FAILED:', error);
    process.exitCode = 1;
});
