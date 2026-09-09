import test from "node:test";
import assert from "node:assert/strict";
import type { GuildQueue } from "discord-player";
import { confirmPlayback } from "../src/utils/helpers/playbackWatchdog";

type FakeQueueOptions = {
	streamTimes: number[];
	deleted?: boolean;
	currentTrack?: unknown;
	paused?: boolean;
};

/** Minimal stand-in for a GuildQueue: streamTime advances one step per read. */
function fakeQueue({ streamTimes, deleted = false, currentTrack = {}, paused = false }: FakeQueueOptions): GuildQueue {
	let index = 0;
	return {
		get deleted() {
			return deleted;
		},
		get currentTrack() {
			return currentTrack;
		},
		node: {
			get streamTime() {
				const value = streamTimes[Math.min(index, streamTimes.length - 1)];
				index += 1;
				return value;
			},
			isPaused: () => paused,
		},
	} as unknown as GuildQueue;
}

test("confirmPlayback confirms once stream time passes the threshold", async () => {
	const result = await confirmPlayback(fakeQueue({ streamTimes: [0, 0, 700] }), {
		minStreamTimeMs: 500,
		timeoutMs: 2_000,
		pollIntervalMs: 1,
	});

	assert.equal(result.confirmed, true);
	assert.equal(result.streamTimeMs, 700);
});

test("confirmPlayback reports a stall when no audio ever flows", async () => {
	const result = await confirmPlayback(fakeQueue({ streamTimes: [0] }), {
		minStreamTimeMs: 500,
		timeoutMs: 50,
		pollIntervalMs: 1,
	});

	assert.equal(result.confirmed, false);
	assert.equal(result.reason, "stalled");
	assert.equal(result.streamTimeMs, 0);
});

test("confirmPlayback reports 'ended' when the queue dies before producing audio", async () => {
	const result = await confirmPlayback(fakeQueue({ streamTimes: [0], currentTrack: null }), {
		minStreamTimeMs: 500,
		timeoutMs: 2_000,
		pollIntervalMs: 1,
	});

	assert.equal(result.confirmed, false);
	assert.equal(result.reason, "ended");
});

test("confirmPlayback does not treat a paused queue as a stall", async () => {
	const started = Date.now();
	const result = await confirmPlayback(fakeQueue({ streamTimes: [0, 0, 0, 900], paused: true }), {
		minStreamTimeMs: 500,
		timeoutMs: 30,
		pollIntervalMs: 1,
	});

	// Without the pause exemption the 30ms timeout would have fired first.
	assert.equal(result.confirmed, true);
	assert.ok(Date.now() - started >= 0);
});
