import { Readable } from 'node:stream';
import { QueryType, type Player, type Track } from 'discord-player';
import { routeQuery, type SearchableSource } from './queryRouter';
import { diagnoseStreamFailure, type StreamDiagnosis } from './streamDiagnostics';

/**
 * Checks that a source can actually deliver audio bytes, from production.
 *
 * The point is *where* this runs. YouTube extraction cannot be meaningfully
 * tested from GitHub-hosted runners - they are datacenter IPs that YouTube
 * rates harshly - so CI can only ever verify our wiring. The bot's own host has
 * the residential IP that matters, which makes it the only place an end-to-end
 * check means anything.
 *
 * No voice connection is involved. `YoutubeSabrExtractor.stream()` returns a
 * PassThrough immediately and fetches segments in the background, stashing any
 * failure on `track.metadata.streamError` - so pulling a sample of bytes
 * straight off the extractor reproduces exactly the production failure mode
 * (segment 403s, PO-token refusal) without joining a channel or making noise.
 */

export interface ProbeOptions {
    /** Bytes to pull before declaring success. */
    sampleBytes?: number;
    /** Hard limit for the whole probe. */
    timeoutMs?: number;
    queries?: Partial<Record<SearchableSource, string>>;
}

export interface ProbeResult {
    source: SearchableSource;
    ok: boolean;
    bytes: number;
    durationMs: number;
    trackTitle?: string;
    detail?: string;
    diagnosis?: StreamDiagnosis | null;
}

/**
 * 64 KiB is comfortably more than a container header, so it proves media data
 * is flowing rather than just that a connection opened.
 */
const DEFAULT_SAMPLE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Deliberately boring, long-lived uploads rather than anything trending: a
 * probe query that resolves to a livestream cannot be sampled at all (SABR
 * stalls and aborts), which would report a permanent outage that is not one.
 * Live results are filtered out below as well, since a search can always drift.
 */
const DEFAULT_QUERIES: Record<SearchableSource, string> = {
    youtube: 'ytsearch:rick astley never gonna give you up',
    soundcloud: 'scsearch:lofi hip hop',
};

/** Extractors may hand back a Readable or a `{ stream, $fmt }` pair. */
export function toReadable(streamable: unknown): Readable | null {
    if (streamable instanceof Readable) {
        return streamable;
    }
    if (streamable && typeof streamable === 'object' && 'stream' in streamable) {
        const inner = (streamable as { stream: unknown }).stream;
        return inner instanceof Readable ? inner : null;
    }
    return null;
}

export interface SampleResult {
    bytes: number;
    reason: 'enough' | 'ended' | 'timeout' | 'error';
    error?: string;
}

/**
 * Pulls up to `maxBytes` off a stream, then destroys it.
 *
 * 'ended' with too few bytes is the interesting case: that is the silent
 * zero-byte stream which looks like success everywhere else.
 */
export function readStreamSample(stream: Readable, maxBytes: number, timeoutMs: number): Promise<SampleResult> {
    return new Promise((resolve) => {
        let bytes = 0;
        let settled = false;

        const finish = (reason: SampleResult['reason'], error?: string) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            try {
                stream.destroy();
            } catch {
                // Already gone.
            }
            resolve({ bytes, reason, error });
        };

        const timer = setTimeout(() => finish('timeout'), timeoutMs);

        stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes >= maxBytes) {
                finish('enough');
            }
        });
        stream.on('end', () => finish('ended'));
        stream.on('error', (error: Error) => finish('error', error.message));
    });
}

export async function probeSource(
    player: Player,
    source: SearchableSource,
    options: ProbeOptions = {},
): Promise<ProbeResult> {
    const sampleBytes = options.sampleBytes ?? DEFAULT_SAMPLE_BYTES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const query = options.queries?.[source] ?? DEFAULT_QUERIES[source];
    const startedAt = Date.now();

    const fail = (detail: string, track?: Track): ProbeResult => ({
        source,
        ok: false,
        bytes: 0,
        durationMs: Date.now() - startedAt,
        trackTitle: track?.title,
        detail,
        diagnosis: track ? diagnoseStreamFailure(track.metadata) : null,
    });

    try {
        // Routed the same way /play routes, so the probe exercises the real
        // decision rather than a hand-written prefix.
        const routed = routeQuery(query, { defaultSearchSource: source });
        const searchResult = await player.search(routed.query, { searchEngine: QueryType.AUTO });

        const tracks = searchResult?.tracks ?? [];
        if (tracks.length === 0) {
            return fail('Search returned no tracks.');
        }

        // A livestream has no finite body to sample: SabrStream stalls and
        // aborts, which looks exactly like an outage. Observed in testing when
        // the YouTube query resolved to a 24/7 radio stream.
        const track = tracks.find((candidate) => !candidate.live);
        if (!track) {
            return fail('Every result was a livestream, which cannot be sampled. Pick a different probe query.');
        }

        const streamable = await track.extractor?.stream(track);
        const stream = toReadable(streamable);
        if (!stream) {
            return fail('Extractor did not return a readable stream.', track);
        }

        const sample = await readStreamSample(stream, sampleBytes, timeoutMs);
        const diagnosis = diagnoseStreamFailure(track.metadata);

        if (sample.bytes >= sampleBytes) {
            return {
                source,
                ok: true,
                bytes: sample.bytes,
                durationMs: Date.now() - startedAt,
                trackTitle: track.title,
            };
        }

        return {
            source,
            ok: false,
            bytes: sample.bytes,
            durationMs: Date.now() - startedAt,
            trackTitle: track.title,
            detail: `Only ${sample.bytes} of ${sampleBytes} bytes (${sample.reason}${sample.error ? `: ${sample.error}` : ''}).`,
            diagnosis,
        };
    } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
    }
}
