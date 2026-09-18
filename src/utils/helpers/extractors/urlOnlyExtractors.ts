import { SoundcloudExtractor } from 'discord-player-soundcloud';
import { SpotifyExtractor } from 'discord-player-spotify';
import { urlSource } from '../queryRouter';

/**
 * SoundCloud and Spotify both ship a greedy `validate()`:
 *
 *     return !isUrl(query) || [<their own regexes>].some((r) => r.test(query));
 *
 * The `!isUrl(query)` arm means each of them claims *every* plain-text query.
 * With equal priority the winner is decided by registration order, so which
 * source answers `/play tavern music` was an accident of array position rather
 * than a decision - and bumping Spotify's priority would silently turn text
 * search into Spotify metadata lookups.
 *
 * These subclasses narrow `validate()` to "is this a URL I actually own".
 * Plain text then reaches an extractor only through an explicit protocol prefix
 * (see `routeQuery`), which discord-player binds *before* it calls `validate()`
 * at all - so text search still works, it just stops being decided by luck.
 *
 * Both keep their parent's `static identifier`, so they register under the same
 * ids and nothing downstream needs to know they are subclasses.
 */

export class UrlOnlySoundcloudExtractor extends SoundcloudExtractor {
    async validate(query: string): Promise<boolean> {
        if (urlSource(query) !== 'soundcloud') {
            return false;
        }
        return super.validate(query);
    }
}

export class UrlOnlySpotifyExtractor extends SpotifyExtractor {
    async validate(query: string): Promise<boolean> {
        if (urlSource(query) !== 'spotify') {
            return false;
        }
        return super.validate(query);
    }
}
