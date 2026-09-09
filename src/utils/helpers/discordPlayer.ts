import fs from "node:fs";
import path from "node:path";
import { BaseExtractor, Player } from "discord-player";
import { AttachmentExtractor } from "@discord-player/extractor";
import { ExtendedClient } from "../../types";
import { config } from "../../config";
import {
    BridgingYoutubeSabrExtractor,
    EXTRACTOR_IDS,
    EXTRACTOR_PRIORITIES,
    UrlOnlySoundcloudExtractor,
    UrlOnlySpotifyExtractor,
} from "./extractors";

/**
 * Initializes a new Player instance
 *
 * @param {Client} client
 * @returns
 */
export async function initPlayer(client: ExtendedClient): Promise<Player> {
    ensureInnertubeCacheDir();

    return new Player(client, {
        ffmpegPath: config.DP_FFMPEG_PATH,
    });
}

/**
 * `YoutubeSabrExtractor.activate()` hardcodes `new UniversalCache(true, '/tmp/.cache')`,
 * which does not exist on Windows and makes `npm run dev` fail there.
 *
 * This cannot be fixed by subclassing: the Innertube instance is assigned to a
 * private field, so an overridden `activate()` has no way to set it other than
 * calling `super.activate()` - which is the call that hardcodes the path. So we
 * create the directory the library expects instead, and only on win32 where the
 * path is unusual. Upstream should accept a configurable cache path.
 */
function ensureInnertubeCacheDir(): void {
    if (process.platform !== "win32") {
        return;
    }
    const cacheDir = path.join(path.parse(process.cwd()).root, "tmp", ".cache");
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch (error) {
        console.warn(`[SETUP] Could not create Innertube cache dir ${cacheDir}:`, error);
    }
}

/**
 * Registers an extractor, or throws.
 *
 * The previous code logged an error and carried on - and one of the four calls
 * forgot to `await`, so its `if (!extractor)` guard was testing a Promise and
 * could never be falsy. A bot with no SoundCloud extractor has a broken
 * `/play`; it should fail loudly and let the container healthcheck restart it
 * rather than pretend to work. (This is why `main().catch()` must exit non-zero.)
 */
async function registerOrThrow<O extends object, T extends typeof BaseExtractor<O>>(
    player: Player,
    extractor: T,
    options: ConstructorParameters<T>["1"],
    label: string,
    priority?: number,
): Promise<InstanceType<T>> {
    const instance = await player.extractors.register(extractor, options);

    if (!instance) {
        throw new Error(
            `[EXTRACTORS] ${label} failed to register (${extractor.identifier}). ` +
            `A duplicate identifier is the usual cause.`,
        );
    }

    if (priority !== undefined) {
        instance.priority = priority;
    }

    console.log(
        `[EXTRACTORS] ${label} registered (${extractor.identifier}, priority ${instance.priority}).`,
    );
    return instance;
}

export async function registerExtractors(player: Player): Promise<void> {
    // Registration order no longer decides who wins a query - the URL-only
    // validators and explicit priorities do - but priority still orders bridge
    // attempts, so YouTube must outrank SoundCloud.
    await registerOrThrow(
        player,
        BridgingYoutubeSabrExtractor,
        {},
        "Youtube Extractor",
        EXTRACTOR_PRIORITIES.youtube,
    );

    await registerOrThrow(
        player,
        UrlOnlySpotifyExtractor,
        { market: "CZ" },
        "Spotify Extractor",
        EXTRACTOR_PRIORITIES.spotify,
    );

    await registerOrThrow(
        player,
        UrlOnlySoundcloudExtractor,
        {},
        "Soundcloud Extractor",
        EXTRACTOR_PRIORITIES.soundcloud,
    );

    await registerOrThrow(
        player,
        AttachmentExtractor,
        {},
        "Attachment Extractor",
        EXTRACTOR_PRIORITIES.attachment,
    );

    const warnings = await assertExtractorContract(player);
    for (const warning of warnings) {
        console.warn(`[EXTRACTORS] ${warning}`);
    }
    if (warnings.length === 0) {
        console.log("[EXTRACTORS] Contract check passed.");
    }
}

/**
 * Boot-time tripwire for the assumption this whole design rests on: that no
 * extractor claims plain text.
 *
 * A Renovate bump can change a third-party `validate()` without any local diff,
 * and the failure mode is silent - queries quietly start resolving to the wrong
 * source. The smoke canary structurally cannot catch that (it asserts audio
 * plays, not who supplied it). A startup log line can.
 *
 * Warns rather than throws: a false alarm should not ground the bot.
 */
export async function assertExtractorContract(player: Player): Promise<string[]> {
    const warnings: string[] = [];

    for (const [name, id] of Object.entries(EXTRACTOR_IDS)) {
        if (!player.extractors.get(id)) {
            warnings.push(`Expected ${name} extractor (${id}) to be registered, but it is not.`);
        }
    }

    const greedy: string[] = [];
    for (const extractor of player.extractors.store.values()) {
        if (await extractor.validate("some free text query", "autoSearch")) {
            greedy.push(extractor.identifier);
        }
    }
    if (greedy.length > 0) {
        warnings.push(
            `These extractors still claim plain-text queries, so /play <text> is decided by ` +
            `priority rather than by routeQuery: ${greedy.join(", ")}.`,
        );
    }

    const urlChecks: { label: string; query: string; type: string; expected: string }[] = [
        {
            label: "Spotify track URL",
            query: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
            type: "spotifySong",
            expected: EXTRACTOR_IDS.spotify,
        },
        {
            label: "SoundCloud track URL",
            query: "https://soundcloud.com/someone/some-track",
            type: "soundcloudTrack",
            expected: EXTRACTOR_IDS.soundcloud,
        },
        {
            label: "YouTube video URL",
            query: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            type: "youtubeVideo",
            expected: EXTRACTOR_IDS.youtube,
        },
    ];

    for (const check of urlChecks) {
        const claimants: string[] = [];
        for (const extractor of player.extractors.store.values()) {
            if (await extractor.validate(check.query, check.type as never)) {
                claimants.push(extractor.identifier);
            }
        }
        if (claimants.length !== 1 || claimants[0] !== check.expected) {
            warnings.push(
                `${check.label} should be claimed only by ${check.expected}, ` +
                `but was claimed by [${claimants.join(", ") || "nobody"}].`,
            );
        }
    }

    const youtube = player.extractors.get(EXTRACTOR_IDS.youtube);
    const soundcloud = player.extractors.get(EXTRACTOR_IDS.soundcloud);
    if (youtube && soundcloud && youtube.priority <= soundcloud.priority) {
        warnings.push(
            `YouTube priority (${youtube.priority}) must exceed SoundCloud's ` +
            `(${soundcloud.priority}), or Spotify links will bridge to SoundCloud audio.`,
        );
    }

    return warnings;
}
