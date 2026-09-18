import type { BaseExtractor, ExtractorStreamable, Track } from 'discord-player';
import { YoutubeSabrExtractor } from 'discord-player-googlevideo';
import { buildBridgeQuery } from '../bridgeQuery';

/**
 * Teaches the YouTube extractor to act as a bridge target.
 *
 * A Spotify track has no stream of its own, so `SpotifyExtractor.stream()`
 * calls `context.requestBridge(track, this)`, which walks the extractors by
 * descending priority and asks each one for `bridge(track, sourceExtractor)`.
 * `BaseExtractor.bridge()` returns `null` by default, and the SABR extractor
 * never overrode it - while `discord-player-soundcloud` does implement it.
 *
 * That is why *every* Spotify link played SoundCloud audio, and why
 * `README.md`'s "Spotify (searches on YouTube)" was false. Implementing
 * `bridge()` here, with YouTube at a higher priority than SoundCloud, makes it
 * true - and returning `null` on failure lets `requestBridge` fall through to
 * SoundCloud, so the old behaviour remains the automatic backup.
 *
 * Note this cannot be done through Spotify's `createStream` option instead:
 * that hook is wired as `this._stream = (q) => fn(this, q)` but invoked as
 * `this._stream(info.url, info)`, so the wrapper drops the second argument and
 * the callback never receives the Track - only a URL. `bridge()` gets the whole
 * Track, which is what building a decent search query requires.
 */
export class BridgingYoutubeSabrExtractor extends YoutubeSabrExtractor {
    async bridge(track: Track, _sourceExtractor: BaseExtractor | null): Promise<ExtractorStreamable | null> {
        const query = buildBridgeQuery(track.title, track.author);
        if (!query) {
            return null;
        }

        try {
            const info = await this.handle(query, { requestedBy: track.requestedBy });
            const candidate = info.tracks[0];

            if (!candidate) {
                console.warn(`[EXTRACTORS] YouTube bridge found nothing for "${query}"`);
                return null;
            }

            const stream = await this.stream(candidate);

            // Recorded so the caller (and the smoke canary) can assert which
            // source actually supplied the audio.
            track.bridgedTrack = candidate;

            console.log(`[EXTRACTORS] Bridged "${track.title}" via YouTube: "${candidate.title}"`);
            return stream;
        } catch (error) {
            // Deliberately swallowed: returning null lets requestBridge try the
            // next extractor rather than failing the whole track.
            console.warn(`[EXTRACTORS] YouTube bridge failed for "${query}":`, error);
            return null;
        }
    }
}
