import test from "node:test";
import assert from "node:assert/strict";
import type { GuildQueue, Track } from "discord-player";
import { trackProbe } from "../src/utils/helpers/playbackWatchdog";

/**
 * The adapter is the only part of the watchdog that touches discord-player, so
 * it keeps the `as unknown as GuildQueue` fake pattern. Everything else is
 * covered against the probe directly.
 */
function fakeQueue(options: { currentTrackId?: string | null; deleted?: boolean; paused?: boolean }): GuildQueue {
	const { currentTrackId = "track-1", deleted = false, paused = false } = options;
	return {
		deleted,
		currentTrack: currentTrackId === null ? null : { id: currentTrackId },
		node: { isPaused: () => paused },
	} as unknown as GuildQueue;
}

function fakeTrack(id: string, playbackDuration: number | null): Track {
	return {
		id,
		resource: playbackDuration === null ? null : { playbackDuration },
	} as unknown as Track;
}

/**
 * The core of the stale-watchdog fix: read the *track's* resource rather than
 * `queue.node.streamTime`, which reports whatever is mounted now.
 */
test("trackProbe reads playback duration from the watched track's own resource", () => {
	const track = fakeTrack("track-1", 1_234);
	const probe = trackProbe(fakeQueue({ currentTrackId: "track-1" }), track);

	assert.equal(probe().streamTimeMs, 1_234);
});

test("trackProbe reports zero audio when the track has no resource yet", () => {
	const probe = trackProbe(fakeQueue({}), fakeTrack("track-1", null));

	assert.equal(probe().streamTimeMs, 0);
});

test("trackProbe compares track ids to detect being superseded", () => {
	const track = fakeTrack("track-1", 0);

	assert.equal(trackProbe(fakeQueue({ currentTrackId: "track-1" }), track)().isCurrent, true);
	assert.equal(trackProbe(fakeQueue({ currentTrackId: "track-2" }), track)().isCurrent, false);
});

test("trackProbe reports a deleted or empty queue as dead", () => {
	const track = fakeTrack("track-1", 0);

	assert.equal(trackProbe(fakeQueue({ deleted: true }), track)().isDead, true);
	assert.equal(trackProbe(fakeQueue({ currentTrackId: null }), track)().isDead, true);
	assert.equal(trackProbe(fakeQueue({}), track)().isDead, false);
});

test("trackProbe surfaces the paused state", () => {
	const track = fakeTrack("track-1", 0);

	assert.equal(trackProbe(fakeQueue({ paused: true }), track)().isPaused, true);
	assert.equal(trackProbe(fakeQueue({ paused: false }), track)().isPaused, false);
});
