import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SEARCH_SOURCE, isSupportedUrl, routeQuery, urlSource } from "../src/utils/helpers/queryRouter";

test("routeQuery sends plain text to the default source with an explicit prefix", () => {
	const routed = routeQuery("tavern ambience");

	assert.equal(routed.query, "scsearch:tavern ambience");
	assert.equal(routed.source, "soundcloud");
	assert.equal(routed.protocol, "scsearch");
	assert.equal(routed.isSearch, true);
	assert.equal(routed.userPrefixed, false);
	assert.equal(DEFAULT_SEARCH_SOURCE, "soundcloud");
});

test("routeQuery honours an explicit YouTube search source", () => {
	const routed = routeQuery("tavern ambience", { defaultSearchSource: "youtube" });

	assert.equal(routed.query, "ytsearch:tavern ambience");
	assert.equal(routed.source, "youtube");
});

/**
 * The trap. WHATWG `new URL()` parses any `scheme:opaque` string, so
 * `new URL('artist: song')` succeeds with protocol `artist:`. Treating that as
 * a URL would misroute an ordinary search. And discord-player's own prefix
 * handling does `searchQuery.split(':')` then `query2.join(':')`, so the inner
 * colon survives being prefixed.
 */
test("routeQuery treats a colon inside free text as text, not a URL", () => {
	const routed = routeQuery("artist: song");

	assert.equal(routed.query, "scsearch:artist: song");
	assert.equal(routed.isSearch, true);
	assert.equal(isSupportedUrl("artist: song"), false);
});

test("routeQuery leaves a caller-supplied protocol untouched", () => {
	for (const query of ["ytsearch:never gonna give you up", "scsearch:tavern", "spsearch:something"]) {
		const routed = routeQuery(query);
		assert.equal(routed.query, query, `${query} must pass through verbatim`);
		assert.equal(routed.userPrefixed, true);
	}

	assert.equal(routeQuery("ytsearch:x").source, "youtube");
	assert.equal(routeQuery("soundcloud:x").source, "soundcloud");
	assert.equal(routeQuery("spotify:x").source, "spotify");
});

test("routeQuery classifies URLs by host and adds no prefix", () => {
	const cases: [string, string][] = [
		["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
		["https://youtu.be/dQw4w9WgXcQ", "youtube"],
		["https://music.youtube.com/watch?v=x", "youtube"],
		["https://soundcloud.com/artist/track", "soundcloud"],
		["https://on.soundcloud.com/abc", "soundcloud"],
		["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "spotify"],
		["https://spotify.link/abc", "spotify"],
		["https://cdn.discordapp.com/attachments/1/2/song.mp3", "attachment"],
		["https://example.com/some/audio.ogg", "attachment"],
	];

	for (const [url, expected] of cases) {
		const routed = routeQuery(url);
		assert.equal(routed.source, expected, `${url} should route to ${expected}`);
		assert.equal(routed.query, url, `${url} must not be rewritten`);
		assert.equal(routed.protocol, null);
		assert.equal(routed.isSearch, false);
	}
});

test("routeQuery does not let a lookalike host masquerade as a known source", () => {
	// Substring matching would wrongly claim these for youtube/soundcloud.
	assert.equal(routeQuery("https://notyoutube.com/watch?v=x").source, "attachment");
	assert.equal(routeQuery("https://youtube.com.evil.example/x").source, "attachment");
	assert.equal(routeQuery("https://soundcloud.com.evil.example/x").source, "attachment");
});

test("routeQuery trims surrounding whitespace", () => {
	assert.equal(routeQuery("   tavern   ").query, "scsearch:tavern");
	assert.equal(routeQuery("  https://youtu.be/x  ").source, "youtube");
});

test("routeQuery reports an empty query without inventing a prefix", () => {
	const routed = routeQuery("   ");

	assert.equal(routed.query, "");
	assert.equal(routed.source, null);
	assert.equal(routed.isSearch, false);
});

test("isSupportedUrl accepts only absolute http(s) URLs", () => {
	assert.equal(isSupportedUrl("https://youtu.be/x"), true);
	assert.equal(isSupportedUrl("http://example.com/a.mp3"), true);
	assert.equal(isSupportedUrl("file:///etc/passwd"), false);
	assert.equal(isSupportedUrl("ytsearch:something"), false);
	assert.equal(isSupportedUrl("just some words"), false);
	assert.equal(isSupportedUrl(""), false);
});

test("urlSource returns null for anything that is not an http(s) URL", () => {
	assert.equal(urlSource("https://soundcloud.com/a/b"), "soundcloud");
	assert.equal(urlSource("tavern music"), null);
	assert.equal(urlSource("scsearch:tavern"), null);
});
