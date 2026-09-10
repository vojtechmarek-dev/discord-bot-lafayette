import test from "node:test";
import assert from "node:assert/strict";
import type { GuildQueue, Track } from "discord-player";
import { trackProbe } from "../src/utils/helpers/playbackWatchdog";

/**
 * The adapter is the only part of the watchdog that touches discord-player, so
 * it keeps the `as unknown as GuildQueue` fake pattern. Everything else is
 * covered against the probe directly.
 *
 * The fakes below deliberately mirror how discord-player really behaves:
 * `queue.node.streamTime` carries the mounted resource's playback duration, and
 * `track.resource` is null for anything an extractor resolved. An earlier
 * version of this suite invented a `track.resource.playbackDuration` value, so
 * it passed while production reported 0ms for every track and stalled them all.
 */
function fakeQueue(options: {
	currentTrackId?: string | null;
	streamTime?: number;
	deleted?: boolean;
	paused?: boolean;
}): GuildQueue {
	const { currentTrackId = "track-1", streamTime = 0, deleted = false, paused = false } = options;
	return {
		deleted,
		currentTrack: currentTrackId === null ? null : { id: currentTrackId },
		node: { streamTime, isPaused: () => paused },
	} as unknown as GuildQueue;
}

/** Extractor-resolved tracks never get a resource; this matches that. */
function fakeTrack(id: string): Track {
	return { id, resource: null } as unknown as Track;
}

test("trackProbe reports the queue's mounted stream time", () => {
	const probe = trackProbe(
		fakeQueue({ currentTrackId: "track-1", streamTime: 1_234 }),
		fakeTrack("track-1"),
	);

	assert.equal(probe().streamTimeMs, 1_234);
});

/**
 * The regression that shipped: reading `track.resource.playbackDuration` gave
 * 0ms forever, so every track stalled and got skipped after the timeout even
 * while audio was audibly playing.
 */
test("trackProbe does not depend on track.resource, which is null in practice", () => {
	const track = fakeTrack("track-1");
	assert.equal((track as unknown as { resource: unknown }).resource, null);

	const probe = trackProbe(fakeQueue({ currentTrackId: "track-1", streamTime: 5_000 }), track);

	assert.equal(probe().streamTimeMs, 5_000, "must read the queue, not the track");
});

/**
 * Scoping now comes from the id check. Zeroing the time when the watched track
 * is no longer mounted is what stops a stale watchdog from confirming on the
 * *next* track's audio.
 */
test("trackProbe reports zero once a different track is mounted", () => {
	const probe = trackProbe(
		fakeQueue({ currentTrackId: "track-2", streamTime: 9_999 }),
		fakeTrack("track-1"),
	);
	const snapshot = probe();

	assert.equal(snapshot.isCurrent, false);
	assert.equal(snapshot.streamTimeMs, 0, "a stale watchdog must not see the new track's audio");
});

test("trackProbe compares track ids to detect being superseded", () => {
	const track = fakeTrack("track-1");

	assert.equal(trackProbe(fakeQueue({ currentTrackId: "track-1" }), track)().isCurrent, true);
	assert.equal(trackProbe(fakeQueue({ currentTrackId: "track-2" }), track)().isCurrent, false);
});

test("trackProbe reports a deleted or empty queue as dead", () => {
	const track = fakeTrack("track-1");

	assert.equal(trackProbe(fakeQueue({ deleted: true }), track)().isDead, true);
	assert.equal(trackProbe(fakeQueue({ currentTrackId: null }), track)().isDead, true);
	assert.equal(trackProbe(fakeQueue({}), track)().isDead, false);
});

test("trackProbe surfaces the paused state", () => {
	const track = fakeTrack("track-1");

	assert.equal(trackProbe(fakeQueue({ paused: true }), track)().isPaused, true);
	assert.equal(trackProbe(fakeQueue({ paused: false }), track)().isPaused, false);
});
