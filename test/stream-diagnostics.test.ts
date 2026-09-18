import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseStreamFailure } from "../src/utils/helpers/streamDiagnostics";

test("diagnoseStreamFailure returns null when no stream error was recorded", () => {
	// Must stay distinguishable from "failed for an unknown reason": a healthy
	// track has no diagnosis at all.
	assert.equal(diagnoseStreamFailure(undefined), null);
	assert.equal(diagnoseStreamFailure(null), null);
	assert.equal(diagnoseStreamFailure({}), null);
	assert.equal(diagnoseStreamFailure({ streamError: null }), null);
	assert.equal(diagnoseStreamFailure("not an object"), null);
	assert.equal(diagnoseStreamFailure({ somethingElse: "x" }), null);
});

test("diagnoseStreamFailure classifies the messages the extractor actually throws", () => {
	const cases: [string, string][] = [
		["Streaming URL not available", "no-stream-url"],
		["Streaming configuration not available", "no-ustreamer-config"],
		["Failed to generate PO token", "po-token"],
		["Request failed with status code 403", "forbidden"],
		["403 Forbidden", "forbidden"],
		["Video returned 404", "not-found"],
		["This private video is unavailable", "not-found"],
		["read ECONNRESET", "network"],
		["getaddrinfo EAI_AGAIN rr1---sn-x.googlevideo.com", "network"],
		["something nobody has seen before", "unknown"],
	];

	for (const [message, expected] of cases) {
		const diagnosis = diagnoseStreamFailure({ streamError: new Error(message) });
		assert.equal(diagnosis?.kind, expected, `"${message}" should classify as ${expected}`);
		assert.ok(diagnosis?.userMessage, "every kind needs a user-facing message");
	}
});

/**
 * A PO-token failure usually reports a 403 as well, and the token is the more
 * useful of the two diagnoses - so the ordering of the pattern list matters.
 */
test("diagnoseStreamFailure prefers the PO-token diagnosis over a co-occurring 403", () => {
	const diagnosis = diagnoseStreamFailure({
		streamError: new Error("Failed to generate PO token; segment request returned 403"),
	});

	assert.equal(diagnosis?.kind, "po-token");
});

test("diagnoseStreamFailure accepts a plain string, an Error, or an error-like object", () => {
	assert.equal(diagnoseStreamFailure({ streamError: "403 Forbidden" })?.kind, "forbidden");
	assert.equal(diagnoseStreamFailure({ streamError: new Error("403") })?.kind, "forbidden");
	assert.equal(diagnoseStreamFailure({ streamError: { message: "403" } })?.kind, "forbidden");
});

test("diagnoseStreamFailure keeps the original text for the log", () => {
	const diagnosis = diagnoseStreamFailure({ streamError: new Error("Streaming URL not available") });

	assert.ok(diagnosis?.message.includes("Streaming URL not available"));
});

test("diagnoseStreamFailure points a 403 at an alternative source", () => {
	const diagnosis = diagnoseStreamFailure({ streamError: "403" });

	// The whole point of reading streamError is telling the user what to do next.
	assert.ok(diagnosis?.userMessage.includes("source:soundcloud"));
});
