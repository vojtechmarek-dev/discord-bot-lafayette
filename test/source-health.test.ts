import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import {
	createSourceHealthTracker,
	describeTransition,
	sourceLabel,
} from "../src/utils/helpers/sourceHealth";
import { readStreamSample, toReadable } from "../src/utils/helpers/sourceProbe";

// --- health state machine ---

test("a source starts unknown and turns healthy on first success", () => {
	const tracker = createSourceHealthTracker({ now: () => 1_000 });

	assert.equal(tracker.get("youtube").state, "unknown");

	const transition = tracker.record("youtube", true);

	assert.equal(transition?.from, "unknown");
	assert.equal(transition?.to, "healthy");
	assert.equal(tracker.get("youtube").state, "healthy");
});

/**
 * The whole point of the threshold: one dead video or a typo is not an outage,
 * and alerting on it is how a health channel gets muted.
 */
test("a single failure does not degrade a healthy source", () => {
	const tracker = createSourceHealthTracker({ degradeAfter: 3 });
	tracker.record("youtube", true);

	assert.equal(tracker.record("youtube", false, "forbidden"), null);
	assert.equal(tracker.get("youtube").state, "healthy");
	assert.equal(tracker.get("youtube").consecutiveFailures, 1);
});

test("consecutive failures degrade the source exactly once", () => {
	const tracker = createSourceHealthTracker({ degradeAfter: 3 });
	tracker.record("youtube", true);

	assert.equal(tracker.record("youtube", false, "forbidden"), null);
	assert.equal(tracker.record("youtube", false, "forbidden"), null);

	const transition = tracker.record("youtube", false, "po-token");
	assert.equal(transition?.to, "degraded");
	assert.equal(transition?.consecutiveFailures, 3);
	assert.equal(transition?.kind, "po-token");

	// Still broken, but already reported - no repeat alerts.
	assert.equal(tracker.record("youtube", false, "po-token"), null);
});

test("one success clears the failure streak and reports recovery", () => {
	const tracker = createSourceHealthTracker({ degradeAfter: 2 });
	tracker.record("youtube", false);
	tracker.record("youtube", false);
	assert.equal(tracker.get("youtube").state, "degraded");

	const transition = tracker.record("youtube", true);

	assert.equal(transition?.from, "degraded");
	assert.equal(transition?.to, "healthy");
	assert.equal(tracker.get("youtube").consecutiveFailures, 0);
	assert.equal(tracker.get("youtube").lastFailureKind, undefined);
});

test("sources are tracked independently", () => {
	const tracker = createSourceHealthTracker({ degradeAfter: 2 });

	tracker.record("youtube", false);
	tracker.record("youtube", false);
	tracker.record("soundcloud", true);

	assert.equal(tracker.get("youtube").state, "degraded");
	assert.equal(tracker.get("soundcloud").state, "healthy");
});

test("snapshot returns copies rather than live state", () => {
	const tracker = createSourceHealthTracker();
	tracker.record("youtube", true);

	const snapshot = tracker.snapshot();
	snapshot.youtube.consecutiveFailures = 99;

	assert.equal(tracker.get("youtube").consecutiveFailures, 0);
});

test("transition messages are Czech and name the source", () => {
	const degraded = describeTransition({
		source: "youtube", from: "healthy", to: "degraded", consecutiveFailures: 3, kind: "forbidden",
	});
	assert.ok(degraded.includes("YouTube"));
	assert.ok(degraded.includes("forbidden"));
	assert.ok(degraded.startsWith("⚠️"));

	const recovered = describeTransition({
		source: "soundcloud", from: "degraded", to: "healthy", consecutiveFailures: 0,
	});
	assert.ok(recovered.includes("SoundCloud"));
	assert.ok(recovered.startsWith("✅"));

	assert.equal(sourceLabel("youtube"), "YouTube");
	assert.equal(sourceLabel("attachment"), "Soubory");
});

// --- probe stream sampling ---

test("toReadable unwraps both shapes an extractor can return", () => {
	const stream = Readable.from([Buffer.from("x")]);

	assert.equal(toReadable(stream), stream);
	assert.equal(toReadable({ stream, $fmt: "opus" }), stream);
	assert.equal(toReadable("https://example.com/a.mp3"), null);
	assert.equal(toReadable(null), null);
});

test("readStreamSample stops once it has enough bytes", async () => {
	const stream = Readable.from([Buffer.alloc(40), Buffer.alloc(40), Buffer.alloc(40)]);

	const result = await readStreamSample(stream, 64, 1_000);

	assert.equal(result.reason, "enough");
	assert.ok(result.bytes >= 64);
});

/**
 * The silent zero-byte stream: it ends cleanly, having delivered nothing. That
 * looks like success everywhere else, which is the failure this whole health
 * layer exists to surface.
 */
test("readStreamSample reports a stream that ends short", async () => {
	const stream = Readable.from([]);

	const result = await readStreamSample(stream, 64 * 1024, 1_000);

	assert.equal(result.reason, "ended");
	assert.equal(result.bytes, 0);
});

test("readStreamSample surfaces a stream error", async () => {
	const stream = new Readable({ read() { this.destroy(new Error("segment 403")); } });

	const result = await readStreamSample(stream, 1_024, 1_000);

	assert.equal(result.reason, "error");
	assert.ok(result.error?.includes("403"));
});

test("readStreamSample gives up on a stream that never finishes", async () => {
	// Produces nothing and never ends, like a stalled segment fetch.
	const stream = new Readable({ read() { /* intentionally silent */ } });

	const result = await readStreamSample(stream, 1_024, 50);

	assert.equal(result.reason, "timeout");
	assert.equal(result.bytes, 0);
});
