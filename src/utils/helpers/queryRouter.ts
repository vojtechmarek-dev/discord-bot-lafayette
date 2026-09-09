/**
 * Decides which audio source a `/play` argument should go to, by rewriting it
 * into an explicit discord-player protocol prefix.
 *
 * Why this exists: extractor `validate()` implementations disagree about who
 * owns plain text, and the disagreement is not resolvable by ordering or
 * priority.
 *
 *   YoutubeSabrExtractor.validate('tavern music')  -> false  (URL or ytsearch:/youtube: only)
 *   SoundcloudExtractor.validate('tavern music')   -> true   (!isUrl(query) || <sc regexes>)
 *   SpotifyExtractor.validate('tavern music')      -> true   (!isUrl(query) || <sp regexes>)
 *
 * So YouTube declines free text outright, while SoundCloud and Spotify both
 * claim all of it. SoundCloud only wins today because it happens to be
 * registered first and V8's sort is stable at equal priority. Reordering the
 * extractors would not have made `/play <text>` reach YouTube, and bumping
 * Spotify's priority would silently turn plain-text search into Spotify
 * metadata lookups that then bridge elsewhere for audio.
 *
 * Routing here instead means no extractor ever wins a query by accident.
 */

export type AudioSource = 'youtube' | 'soundcloud' | 'spotify' | 'attachment';

/** discord-player protocol prefixes that bind a query to one extractor. */
export type SearchProtocol = 'ytsearch' | 'scsearch' | 'spsearch';

/** Sources a plain-text search can be sent to. */
export type SearchableSource = 'youtube' | 'soundcloud';

export interface RoutedQuery {
    /** The value to hand to `player.search()`. */
    query: string;
    /** Which source this resolved to, or null if unrecognised. */
    source: AudioSource | null;
    /** The protocol prefix applied, if any. */
    protocol: SearchProtocol | null;
    /** True when this is a text search rather than a direct URL. */
    isSearch: boolean;
    /** True when the caller supplied their own prefix and we left it alone. */
    userPrefixed: boolean;
}

export interface RouteQueryOptions {
    /** Where bare text goes. Defaults to DEFAULT_SEARCH_SOURCE. */
    defaultSearchSource?: SearchableSource;
}

/**
 * SoundCloud is the default for text search on purpose. It is what the bot
 * already does by accident, it needs no PO token, and it works from datacenter
 * IPs as well as residential ones. Defaulting to YouTube would be choosing the
 * exact failure mode this project has been burned by repeatedly.
 */
export const DEFAULT_SEARCH_SOURCE: SearchableSource = 'soundcloud';

const SEARCH_PROTOCOL_BY_SOURCE: Record<SearchableSource, SearchProtocol> = {
    youtube: 'ytsearch',
    soundcloud: 'scsearch',
};

/**
 * Prefixes discord-player recognises, mapped to the source they bind to. Both
 * the `*search:` and bare-name forms are accepted because the library treats
 * them as aliases.
 */
const KNOWN_PROTOCOLS: Record<string, AudioSource> = {
    ytsearch: 'youtube',
    youtube: 'youtube',
    scsearch: 'soundcloud',
    soundcloud: 'soundcloud',
    spsearch: 'spotify',
    spotify: 'spotify',
};

const HOST_PATTERNS: { source: AudioSource; pattern: RegExp }[] = [
    { source: 'youtube', pattern: /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i },
    { source: 'soundcloud', pattern: /(^|\.)(soundcloud\.com|snd\.sc)$/i },
    { source: 'spotify', pattern: /(^|\.)(spotify\.com|spotify\.link)$/i },
];

/**
 * True only for absolute http(s) URLs.
 *
 * The protocol check is load-bearing: WHATWG `new URL()` happily parses any
 * `scheme:opaque` string, so `new URL('artist: song')` succeeds with protocol
 * `artist:`. Treating that as a URL would misroute an ordinary search whose
 * text happens to contain a colon.
 */
export function isSupportedUrl(raw: string): boolean {
    const parsed = tryParseHttpUrl(raw);
    return parsed !== null;
}

function tryParseHttpUrl(raw: string): URL | null {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
    }
    return parsed;
}

/**
 * The source a direct http(s) URL belongs to, or null if the string is not one.
 *
 * Shared with the URL-only extractor subclasses so host knowledge lives in
 * exactly one place.
 */
export function urlSource(raw: string): AudioSource | null {
    const url = tryParseHttpUrl(raw);
    return url ? classifyUrl(url) : null;
}

/** Reads a leading `<name>:` prefix, if it is one discord-player knows. */
function readKnownProtocol(raw: string): { name: string; source: AudioSource } | null {
    const match = /^([a-z]+):/i.exec(raw);
    if (!match) {
        return null;
    }
    const name = match[1].toLowerCase();
    const source = KNOWN_PROTOCOLS[name];
    return source ? { name, source } : null;
}

/** Classifies a direct URL by host. Unknown hosts are treated as raw media. */
function classifyUrl(url: URL): AudioSource {
    for (const { source, pattern } of HOST_PATTERNS) {
        if (pattern.test(url.hostname)) {
            return source;
        }
    }
    // A direct link to an audio file, which AttachmentExtractor handles.
    return 'attachment';
}

/**
 * Rewrites a raw `/play` argument into something that resolves predictably.
 *
 * Order matters: a caller-supplied prefix is honoured before anything else, so
 * `ytsearch:...` stays an escape hatch for forcing a source by hand.
 */
export function routeQuery(raw: string, options: RouteQueryOptions = {}): RoutedQuery {
    const query = raw.trim();
    const defaultSearchSource = options.defaultSearchSource ?? DEFAULT_SEARCH_SOURCE;

    if (!query) {
        return { query, source: null, protocol: null, isSearch: false, userPrefixed: false };
    }

    // 1. The caller already picked a source. Leave the string untouched.
    const userProtocol = readKnownProtocol(query);
    if (userProtocol) {
        return {
            query,
            source: userProtocol.source,
            protocol: isSearchProtocol(userProtocol.name) ? userProtocol.name : null,
            isSearch: !isSupportedUrl(query.slice(userProtocol.name.length + 1)),
            userPrefixed: true,
        };
    }

    // 2. A real URL routes by host, with no prefix needed.
    const url = tryParseHttpUrl(query);
    if (url) {
        return {
            query,
            source: classifyUrl(url),
            protocol: null,
            isSearch: false,
            userPrefixed: false,
        };
    }

    // 3. Plain text. Bind it to the configured source explicitly rather than
    //    letting whichever greedy extractor sorted first take it.
    const protocol = SEARCH_PROTOCOL_BY_SOURCE[defaultSearchSource];
    return {
        query: `${protocol}:${query}`,
        source: defaultSearchSource,
        protocol,
        isSearch: true,
        userPrefixed: false,
    };
}

function isSearchProtocol(name: string): name is SearchProtocol {
    return name === 'ytsearch' || name === 'scsearch' || name === 'spsearch';
}
