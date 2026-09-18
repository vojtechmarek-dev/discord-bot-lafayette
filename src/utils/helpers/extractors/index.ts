export { UrlOnlySoundcloudExtractor, UrlOnlySpotifyExtractor } from './urlOnlyExtractors';
export { BridgingYoutubeSabrExtractor } from './bridgingYoutubeSabrExtractor';

/**
 * Identifiers of the four extractors this bot registers.
 *
 * Note the collision hazard: `discord-player-soundcloud`'s extractor and the
 * `SoundCloudExtractor` bundled inside `@discord-player/extractor` BOTH declare
 * `com.discord-player.soundcloudextractor`, and `extractors.register()` returns
 * null on a duplicate id. So a future "just load DefaultExtractors" refactor
 * would silently drop whichever SoundCloud extractor lost the race - including
 * the one that implements `bridge()`. Register explicitly, one at a time.
 */
export const EXTRACTOR_IDS = {
    soundcloud: 'com.discord-player.soundcloudextractor',
    spotify: 'com.discord-player.itsmaat.spotifyextractor',
    youtube: 'com.github.xxczaki.youtube-sabr',
    attachment: 'com.discord-player.attachmentextractor',
} as const;

/**
 * Explicit priorities. `extractors.run()` sorts by descending priority, so
 * these decide two things: who gets asked to `validate()` first, and - more
 * importantly now - the order `requestBridge()` tries bridge targets.
 *
 * YouTube above SoundCloud is the whole point: it makes a Spotify link bridge
 * to YouTube audio, with SoundCloud as the automatic fallback.
 */
export const EXTRACTOR_PRIORITIES = {
    youtube: 30,
    spotify: 20,
    soundcloud: 10,
    // AttachmentExtractor keeps its own default of 0: it validates only
    // 'arbitrary'/'file' queries and should never outrank a real source.
    attachment: 0,
} as const;
