import test from "node:test";
import assert from "node:assert/strict";
import { AttachmentExtractor } from "@discord-player/extractor";
import {
	BridgingYoutubeSabrExtractor,
	EXTRACTOR_IDS,
	EXTRACTOR_PRIORITIES,
	UrlOnlySoundcloudExtractor,
	UrlOnlySpotifyExtractor,
} from "../src/utils/helpers/extractors";

/**
 * These assert the contract the query router depends on: that no extractor
 * claims plain text, and that each URL shape is claimed by exactly one.
 *
 * A Renovate bump can change a third-party `validate()` with no local diff, and
 * the failure is silent - queries quietly start resolving to the wrong source.
 * The smoke canary cannot catch it either, because it asserts that audio plays,
 * not who supplied it.
 *
 * Runs entirely offline. `validate()` is pure string matching, and instances are
 * built with `Object.create(prototype)` so `activate()` never runs - which
 * matters because the YouTube extractor's `activate()` calls `Innertube.create()`
 * and would hit the network.
 */

type ExtractorLike = { validate(query: string, type?: unknown): Promise<boolean> };

function uninitialised(constructor: { prototype: object }): ExtractorLike {
	return Object.create(constructor.prototype) as ExtractorLike;
}

const EXTRACTORS = {
	soundcloud: UrlOnlySoundcloudExtractor,
	spotify: UrlOnlySpotifyExtractor,
	youtube: BridgingYoutubeSabrExtractor,
	attachment: AttachmentExtractor,
} as const;

type SourceName = keyof typeof EXTRACTORS;

async function claimants(query: string, type: string): Promise<SourceName[]> {
	const claimed: SourceName[] = [];
	for (const name of Object.keys(EXTRACTORS) as SourceName[]) {
		if (await uninitialised(EXTRACTORS[name]).validate(query, type)) {
			claimed.push(name);
		}
	}
	return claimed;
}

test("the subclasses keep their parents' identifiers", () => {
	assert.equal(UrlOnlySoundcloudExtractor.identifier, EXTRACTOR_IDS.soundcloud);
	assert.equal(UrlOnlySpotifyExtractor.identifier, EXTRACTOR_IDS.spotify);
	assert.equal(BridgingYoutubeSabrExtractor.identifier, EXTRACTOR_IDS.youtube);
	assert.equal(AttachmentExtractor.identifier, EXTRACTOR_IDS.attachment);
});

/**
 * The premise of the whole routing design. Upstream, SoundCloud and Spotify
 * both return `!isUrl(query) || ...`, so each claimed every plain-text query and
 * the winner was decided by registration order.
 */
test("no extractor claims a plain-text query", async () => {
	for (const query of ["tavern ambience", "artist: song", "never gonna give you up"]) {
		assert.deepEqual(await claimants(query, "autoSearch"), [], `"${query}" must be claimed by nobody`);
	}
});

test("each URL shape is claimed by exactly one extractor", async () => {
	const cases: [string, string, SourceName][] = [
		["https://soundcloud.com/artist/track", "soundcloudTrack", "soundcloud"],
		["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "spotifySong", "spotify"],
		["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtubeVideo", "youtube"],
		["https://youtu.be/dQw4w9WgXcQ", "youtubeVideo", "youtube"],
	];

	for (const [query, type, expected] of cases) {
		assert.deepEqual(await claimants(query, type), [expected], `${query} should be claimed only by ${expected}`);
	}
});

test("the attachment extractor owns arbitrary media URLs", async () => {
	const claimed = await claimants("https://cdn.discordapp.com/attachments/1/2/song.mp3", "arbitrary");

	assert.deepEqual(claimed, ["attachment"]);
});

/**
 * Priority is what orders `requestBridge()` attempts, so this is the assertion
 * that keeps Spotify links bridging to YouTube rather than SoundCloud.
 */
test("YouTube outranks SoundCloud so Spotify bridges to YouTube audio", () => {
	assert.ok(
		EXTRACTOR_PRIORITIES.youtube > EXTRACTOR_PRIORITIES.soundcloud,
		"YouTube must outrank SoundCloud for bridging",
	);
});

/**
 * `BaseExtractor.bridge()` returns null by default, and the SABR extractor never
 * overrode it while SoundCloud did - which is exactly why every Spotify link
 * played SoundCloud audio.
 */
test("the YouTube extractor defines its own bridge()", () => {
	const ownMethods = Object.getOwnPropertyNames(BridgingYoutubeSabrExtractor.prototype);

	assert.ok(ownMethods.includes("bridge"), "BridgingYoutubeSabrExtractor must override bridge()");
});
