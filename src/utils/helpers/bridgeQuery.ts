/**
 * Builds the search string used to find playable audio for a track that has no
 * stream of its own (a Spotify track, for instance).
 *
 * discord-player's built-in bridge query is
 * `${title} by ${author} official audio`, which is worse than it looks:
 * "official audio" biases results towards music videos and promotional uploads,
 * it fails on catalogues where that phrase never appears, and "by" is dead
 * weight in a search index.
 *
 * This keeps the signal (title + artist) and strips the noise that streaming
 * catalogues bolt onto titles but uploads rarely repeat verbatim.
 */

/**
 * Parenthesised or bracketed content is only removed when it matches one of
 * these. Blanket-stripping brackets would destroy real titles such as
 * "(Don't Fear) The Reaper" or "Sing (Sing Sing)".
 */
const BRACKET_NOISE = new RegExp(
    '^\\s*(' +
    [
        '\\d{0,4}\\s*re-?master(ed)?(\\s*\\d{0,4})?',
        '(feat|ft|featuring)\\.?\\s+.+',
        'official\\s*(music\\s*)?(video|audio|visualizer)',
        'lyrics?\\s*video',
        'audio\\s*only',
        'explicit(\\s*version)?',
        'clean(\\s*version)?',
        'radio\\s*edit',
        'single\\s*version',
        'album\\s*version',
        'mono|stereo(\\s*version)?',
        'deluxe(\\s*edition)?',
        'bonus\\s*track',
        '\\d{0,4}\\s*anniversary(\\s*edition)?',
        'hd|hq|4k',
    ].join('|') +
    ')\\s*$',
    'i',
);

/** Trailing " - Radio Edit" style suffixes, using the same noise vocabulary. */
const DASH_NOISE = new RegExp(
    '\\s+[-–—]\\s+(' +
    [
        '\\d{0,4}\\s*re-?master(ed)?(\\s*\\d{0,4})?',
        'radio\\s*edit',
        'single\\s*version',
        'album\\s*version',
        'explicit(\\s*version)?',
        'clean(\\s*version)?',
        'official\\s*(music\\s*)?(video|audio)',
        'deluxe(\\s*edition)?',
        '\\d{0,4}\\s*anniversary(\\s*edition)?',
    ].join('|') +
    ')\\s*$',
    'i',
);

/** YouTube auto-generated artist channels are named "<Artist> - Topic". */
const AUTHOR_NOISE = /\s+[-–—]\s+topic\s*$/i;

function stripBracketNoise(value: string): string {
    // Repeat: a title can carry several, e.g. "Song (feat. X) (Remastered 2011)".
    let previous: string;
    let current = value;
    do {
        previous = current;
        current = current.replace(/\s*[([]([^()[\]]*)[)\]]/g, (match, inner: string) =>
            BRACKET_NOISE.test(inner) ? '' : match,
        );
    } while (current !== previous);
    return current;
}

function stripDashNoise(value: string): string {
    let previous: string;
    let current = value;
    do {
        previous = current;
        current = current.replace(DASH_NOISE, '');
    } while (current !== previous);
    return current;
}

function collapse(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

/** Removes catalogue decoration from a track title. */
export function cleanTrackTitle(title: string): string {
    return collapse(stripDashNoise(stripBracketNoise(title ?? '')));
}

/** Removes YouTube's "- Topic" suffix from an author name. */
export function cleanTrackAuthor(author: string): string {
    return collapse((author ?? '').replace(AUTHOR_NOISE, ''));
}

/**
 * `"<title> <author>"`, cleaned. Falls back to whichever half survives if the
 * other is empty, so a malformed track still produces a usable search.
 */
export function buildBridgeQuery(title: string, author: string): string {
    const cleanedTitle = cleanTrackTitle(title);
    const cleanedAuthor = cleanTrackAuthor(author);

    // Do not repeat the artist when the title already leads with it, which is
    // common for auto-generated uploads ("Artist - Song").
    if (cleanedAuthor && cleanedTitle.toLowerCase().includes(cleanedAuthor.toLowerCase())) {
        return cleanedTitle;
    }

    return collapse(`${cleanedTitle} ${cleanedAuthor}`);
}
