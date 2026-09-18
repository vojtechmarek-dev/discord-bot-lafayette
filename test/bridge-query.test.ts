import test from "node:test";
import assert from "node:assert/strict";
import { buildBridgeQuery, cleanTrackAuthor, cleanTrackTitle } from "../src/utils/helpers/bridgeQuery";

test("cleanTrackTitle strips remaster and edition noise in brackets", () => {
	assert.equal(cleanTrackTitle("Bohemian Rhapsody (Remastered 2011)"), "Bohemian Rhapsody");
	assert.equal(cleanTrackTitle("Song (2011 Remaster)"), "Song");
	assert.equal(cleanTrackTitle("Song (Deluxe Edition)"), "Song");
	assert.equal(cleanTrackTitle("Song [Official Video]"), "Song");
	assert.equal(cleanTrackTitle("Song (Official Music Video)"), "Song");
	assert.equal(cleanTrackTitle("Song (Lyrics Video)"), "Song");
});

test("cleanTrackTitle strips featured-artist brackets, which the author field already covers", () => {
	assert.equal(cleanTrackTitle("Song (feat. Someone)"), "Song");
	assert.equal(cleanTrackTitle("Song (ft. Someone Else)"), "Song");
	assert.equal(cleanTrackTitle("Song (featuring Another)"), "Song");
});

test("cleanTrackTitle strips dash-suffixed noise", () => {
	assert.equal(cleanTrackTitle("Song - Radio Edit"), "Song");
	assert.equal(cleanTrackTitle("Song - Remastered"), "Song");
	assert.equal(cleanTrackTitle("Song - Single Version"), "Song");
});

test("cleanTrackTitle removes several decorations at once", () => {
	assert.equal(cleanTrackTitle("Song (feat. X) (Remastered 2011)"), "Song");
	assert.equal(cleanTrackTitle("Song (feat. X) - Radio Edit"), "Song");
});

/**
 * The reason brackets are only stripped when their contents match the noise
 * vocabulary: plenty of real titles depend on them.
 */
test("cleanTrackTitle keeps brackets that are part of the actual title", () => {
	assert.equal(cleanTrackTitle("(Don't Fear) The Reaper"), "(Don't Fear) The Reaper");
	assert.equal(cleanTrackTitle("Sing (Sing Sing)"), "Sing (Sing Sing)");
	assert.equal(cleanTrackTitle("Song (Live at Wembley)"), "Song (Live at Wembley)");
	assert.equal(cleanTrackTitle("Marta (Acoustic)"), "Marta (Acoustic)");
});

test("cleanTrackAuthor strips YouTube's auto-generated channel suffix", () => {
	assert.equal(cleanTrackAuthor("Queen - Topic"), "Queen");
	assert.equal(cleanTrackAuthor("Queen"), "Queen");
});

test("buildBridgeQuery joins title and artist without filler", () => {
	assert.equal(
		buildBridgeQuery("Bohemian Rhapsody (Remastered 2011)", "Queen"),
		"Bohemian Rhapsody Queen",
	);
	// Deliberately not discord-player's `"<title> by <author> official audio"`,
	// which biases towards music videos and wastes index weight on "by".
	assert.ok(!buildBridgeQuery("Song", "Artist").includes("official audio"));
	assert.ok(!buildBridgeQuery("Song", "Artist").includes(" by "));
});

test("buildBridgeQuery does not repeat an artist already present in the title", () => {
	assert.equal(buildBridgeQuery("Queen - Bohemian Rhapsody", "Queen"), "Queen - Bohemian Rhapsody");
});

test("buildBridgeQuery survives a missing half", () => {
	assert.equal(buildBridgeQuery("Song", ""), "Song");
	assert.equal(buildBridgeQuery("", "Artist"), "Artist");
	assert.equal(buildBridgeQuery("", ""), "");
});

test("buildBridgeQuery collapses whitespace left behind by stripping", () => {
	const query = buildBridgeQuery("Song   (Remastered 2011)   ", "  Queen  ");

	assert.equal(query, "Song Queen");
	assert.ok(!query.includes("  "));
});
