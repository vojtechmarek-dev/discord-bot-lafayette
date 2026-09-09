import test from "node:test";
import assert from "node:assert/strict";
import {
	confirmPlaybackWith,
	type PlaybackProbe,
	type PlaybackProbeFn,
} from "../src/utils/helpers/playbackWatchdog";

/**
 * The state machine takes a probe, so these tests need no GuildQueue fake at
 * all - and with `now`/`sleep` injected they assert on logic instead of on
 * wall-clock timing, which the previous version did (and which made them flaky
 * under CI load).
 */
function scriptedProbe(snapshots: Partial<PlaybackProbe>[]): PlaybackProbeFn {
	const defaults: PlaybackProbe = {
		streamTimeMs: 0,
		isCurrent: true,
		isDead: false,
		isPaused: false,
	};
	let index = 0;
	return () => {
		const snapshot = snapshots[Math.min(index, snapshots.length - 1)];
		index += 1;
		return { ...defaults, ...snapshot };
	};
}

/** A clock that advances by a fixed step every time it is read. */
function steppingClock(stepMs: number): () => number {
	let current = 0;
	return () => {
		const value = current;
		current += stepMs;
		return value;
	};
}

const noSleep = () => Promise.resolve();

const baseOptions = {
	minStreamTimeMs: 500,
	pollIntervalMs: 1,
	sleep: noSleep,
};

test("confirmPlaybackWith confirms once stream time passes the threshold", async () => {
	const result = await confirmPlaybackWith(
		scriptedProbe([{ streamTimeMs: 0 }, { streamTimeMs: 0 }, { streamTimeMs: 700 }]),
		{ ...baseOptions, timeoutMs: 2_000, now: steppingClock(1) },
	);

	assert.equal(result.confirmed, true);
	assert.equal(result.streamTimeMs, 700);
	assert.equal(result.reason, undefined);
});

test("confirmPlaybackWith reports a stall when no audio ever flows", async () => {
	const result = await confirmPlaybackWith(scriptedProbe([{ streamTimeMs: 0 }]), {
		...baseOptions,
		timeoutMs: 10,
		now: steppingClock(5),
	});

	assert.equal(result.confirmed, false);
	assert.equal(result.reason, "stalled");
	assert.equal(result.streamTimeMs, 0);
});

test("confirmPlaybackWith reports 'ended' when the queue dies before producing audio", async () => {
	const result = await confirmPlaybackWith(scriptedProbe([{ isDead: true }]), {
		...baseOptions,
		timeoutMs: 2_000,
		now: steppingClock(1),
	});

	assert.equal(result.confirmed, false);
	assert.equal(result.reason, "ended");
});

/**
 * The stale-watchdog case. A handler whose track was skipped inside the
 * confirmation window must not announce, and must not skip whatever took over.
 */
test("confirmPlaybackWith reports 'superseded' when another track took over", async () => {
	const result = await confirmPlaybackWith(scriptedProbe([{ isCurrent: false }]), {
		...baseOptions,
		timeoutMs: 2_000,
		now: steppingClock(1),
	});

	assert.equal(result.confirmed, false);
	assert.equal(result.reason, "superseded");
});

test("confirmPlaybackWith prefers 'ended' over 'superseded' when the queue is gone", async () => {
	// A dead queue also has no current track; 'ended' is the accurate answer.
	const result = await confirmPlaybackWith(scriptedProbe([{ isDead: true, isCurrent: false }]), {
		...baseOptions,
		timeoutMs: 2_000,
		now: steppingClock(1),
	});

	assert.equal(result.reason, "ended");
});

test("confirmPlaybackWith does not treat a paused queue as a stall", async () => {
	const result = await confirmPlaybackWith(
		scriptedProbe([
			{ isPaused: true },
			{ isPaused: true },
			{ isPaused: true },
			{ streamTimeMs: 900 },
		]),
		// The clock races far past the timeout on every read, so without the
		// pause exemption this would stall on the first poll.
		{ ...baseOptions, timeoutMs: 10, now: steppingClock(1_000) },
	);

	assert.equal(result.confirmed, true);
	assert.equal(result.streamTimeMs, 900);
});

test("confirmPlaybackWith reports 'aborted' when the signal fires", async () => {
	const controller = new AbortController();
	controller.abort();

	const result = await confirmPlaybackWith(scriptedProbe([{ streamTimeMs: 0 }]), {
		...baseOptions,
		timeoutMs: 2_000,
		now: steppingClock(1),
		signal: controller.signal,
	});

	assert.equal(result.confirmed, false);
	assert.equal(result.reason, "aborted");
});

test("confirmPlaybackWith confirms already-playing audio without sleeping", async () => {
	let slept = 0;
	const result = await confirmPlaybackWith(scriptedProbe([{ streamTimeMs: 5_000 }]), {
		...baseOptions,
		timeoutMs: 2_000,
		now: steppingClock(1),
		sleep: () => {
			slept += 1;
			return Promise.resolve();
		},
	});

	assert.equal(result.confirmed, true);
	assert.equal(slept, 0);
});
