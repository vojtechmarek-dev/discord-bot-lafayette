import test from "node:test";
import assert from "node:assert/strict";
import { openInMemoryDatabase, type Database } from "../src/persistence/db";
import { MIGRATIONS, currentVersion, runMigrations } from "../src/persistence/migrations";
import {
	deleteExpiredDecks,
	drawCards,
	getDeck,
	setDeck,
} from "../src/persistence/deckRepository";
import {
	getGuildSettings,
	getUserSettings,
	setHighlightCrits,
	setMusicSearchSource,
	setRollEmbedColor,
} from "../src/persistence/settingsRepository";
import {
	importLegacySettings,
	importLegacyState,
	normalizeColor,
} from "../src/persistence/importLegacyJson";
import { getNewPokerDeck } from "../src/utils/deckUtils";

function freshDb(): Database {
	const db = openInMemoryDatabase();
	runMigrations(db);
	return db;
}

// --- migrations ---

test("runMigrations brings a new database to the latest version", () => {
	const db = openInMemoryDatabase();
	assert.equal(currentVersion(db), 0);

	const version = runMigrations(db);

	assert.equal(version, MIGRATIONS.length);
	assert.equal(currentVersion(db), MIGRATIONS.length);
	db.close();
});

test("runMigrations is a no-op the second time", () => {
	const db = freshDb();
	const before = currentVersion(db);

	assert.equal(runMigrations(db), before);
	db.close();
});

// --- transactions ---

test("a failing transaction rolls back every write inside it", () => {
	const db = freshDb();
	setHighlightCrits(db, "g1", false);

	assert.throws(() => {
		db.transaction(() => {
			setHighlightCrits(db, "g1", true);
			throw new Error("boom");
		});
	}, /boom/);

	assert.equal(getGuildSettings(db, "g1")?.highlight_crits, 0, "the write must not survive");
	db.close();
});

// --- settings ---

test("guild settings upsert without a prior row", () => {
	const db = freshDb();

	setHighlightCrits(db, "g1", false);
	setMusicSearchSource(db, "g1", "youtube");

	const row = getGuildSettings(db, "g1");
	assert.equal(row?.highlight_crits, 0);
	assert.equal(row?.music_search_source, "youtube");
	// Defaults survive an upsert that only touched other columns.
	assert.equal(row?.music_volume, 50);
	db.close();
});

test("user settings are scoped per guild and per user", () => {
	const db = freshDb();

	setRollEmbedColor(db, "g1", "u1", "#AABBCC");
	setRollEmbedColor(db, "g2", "u1", "#112233");

	assert.equal(getUserSettings(db, "g1", "u1")?.roll_embed_color, "#AABBCC");
	assert.equal(getUserSettings(db, "g2", "u1")?.roll_embed_color, "#112233");
	assert.equal(getUserSettings(db, "g1", "u2"), undefined);
	db.close();
});

// --- colour normalisation ---

test("normalizeColor converts the stored number form to #RRGGBB", () => {
	// The exact value in the live data file: 0x5865F2, Discord Blurple.
	assert.equal(normalizeColor(5793266), "#5865F2");
	assert.equal(normalizeColor(0), "#000000");
	assert.equal(normalizeColor(0xffffff), "#FFFFFF");
});

test("normalizeColor accepts the string forms parseColorString produces", () => {
	assert.equal(normalizeColor("#aabbcc"), "#AABBCC");
	assert.equal(normalizeColor("aabbcc"), "#AABBCC");
	assert.equal(normalizeColor("#abc"), "#AABBCC");
	assert.equal(normalizeColor("Red"), "#ED4245");
});

test("normalizeColor rejects anything it cannot represent", () => {
	assert.equal(normalizeColor(undefined), null);
	assert.equal(normalizeColor(null), null);
	assert.equal(normalizeColor("not a colour"), null);
	assert.equal(normalizeColor(-1), null);
	assert.equal(normalizeColor(1.5), null);
	assert.equal(normalizeColor(0x1000000), null);
});

// --- legacy import ---

/**
 * A verbatim copy of the real data/guild-settings.json, including the number
 * colour and the pre-rename `diceExplode` key.
 */
const LIVE_FIXTURE = {
	"1377246760988184616": {
		userSettings: {
			"258970022947323906": { rollEmbedColor: 5793266 },
		},
		diceExplode: true,
	},
};

test("importLegacySettings imports the real settings file", () => {
	const db = freshDb();

	const report = importLegacySettings(db, LIVE_FIXTURE);

	assert.equal(report.guildsImported, 1);
	assert.equal(report.userSettingsImported, 1);
	assert.deepEqual(report.warnings, []);

	const guild = getGuildSettings(db, "1377246760988184616");
	assert.equal(guild?.highlight_crits, 1, "diceExplode:true must carry over to highlight_crits");
	assert.equal(guild?.music_search_source, "soundcloud");

	const user = getUserSettings(db, "1377246760988184616", "258970022947323906");
	assert.equal(user?.roll_embed_color, "#5865F2", "the number colour must normalise");
	db.close();
});

test("importLegacySettings is idempotent", () => {
	const db = freshDb();

	importLegacySettings(db, LIVE_FIXTURE);
	importLegacySettings(db, LIVE_FIXTURE);

	const rows = db.all<{ n: number }>("SELECT COUNT(*) AS n FROM guild_settings");
	assert.equal(rows[0].n, 1);
	db.close();
});

test("importLegacySettings prefers highlightCrits over the legacy key", () => {
	const db = freshDb();

	importLegacySettings(db, { g1: { diceExplode: true, highlightCrits: false } });

	assert.equal(getGuildSettings(db, "g1")?.highlight_crits, 0);
	db.close();
});

test("importLegacySettings survives malformed input without throwing", () => {
	const db = freshDb();

	assert.equal(importLegacySettings(db, null).warnings.length, 1);
	assert.equal(importLegacySettings(db, "nonsense").warnings.length, 1);
	assert.equal(importLegacySettings(db, { g1: "not an object" }).warnings.length, 1);
	db.close();
});

test("importLegacyState imports decks and drops unknown card ids", () => {
	const db = freshDb();

	const report = importLegacyState(db, {
		g1: {
			decks: {
				poker: {
					remainingCards: [{ id: "A♠️" }, { id: "K♥️" }, { id: "NOT_A_CARD" }],
					drawnCards: [{ id: "JokerR" }],
					lastActivity: 1234,
					shuffledBy: "Vojta",
				},
			},
		},
	});

	assert.equal(report.decksImported, 1);
	assert.equal(report.warnings.length, 1, "the unknown id should warn");

	const deck = getDeck(db, "g1", "poker");
	assert.equal(deck?.remainingCards.length, 2);
	assert.equal(deck?.drawnCards.length, 1);
	assert.equal(deck?.shuffledBy, "Vojta");
	assert.equal(deck?.lastActivity, 1234);
	db.close();
});

test("importLegacyState handles the real file's empty decks object", () => {
	const db = freshDb();

	const report = importLegacyState(db, { "1377246760988184616": { decks: {} } });

	assert.equal(report.decksImported, 0);
	assert.deepEqual(report.warnings, []);
	db.close();
});

// --- decks ---

test("a deck round-trips through storage by card id", () => {
	const db = freshDb();
	const cards = getNewPokerDeck(true);

	setDeck(db, "g1", "poker", {
		remainingCards: cards,
		drawnCards: [],
		lastActivity: 99,
		shuffledBy: "Vojta",
	});

	const loaded = getDeck(db, "g1", "poker");
	assert.equal(loaded?.remainingCards.length, 54);
	assert.deepEqual(loaded?.remainingCards[0], cards[0]);
	assert.equal(loaded?.shuffledBy, "Vojta");
	db.close();
});

test("setDeck with null removes the deck", () => {
	const db = freshDb();
	setDeck(db, "g1", "poker", { remainingCards: getNewPokerDeck(true), drawnCards: [], lastActivity: 1 });

	setDeck(db, "g1", "poker", null);

	assert.equal(getDeck(db, "g1", "poker"), null);
	db.close();
});

test("drawCards refuses to over-draw and leaves the deck untouched", () => {
	const db = freshDb();
	setDeck(db, "g1", "poker", {
		remainingCards: getNewPokerDeck(true).slice(0, 3),
		drawnCards: [],
		lastActivity: 1,
	});

	assert.equal(drawCards(db, "g1", "poker", 5), null);
	assert.equal(getDeck(db, "g1", "poker")?.remainingCards.length, 3, "deck must be unchanged");
	db.close();
});

/**
 * Checks the arithmetic of two draws against one deck.
 *
 * Note this does NOT by itself prove the race is fixed: `drawCards` is
 * synchronous, so sequencing it through Promise.all just runs one call after
 * the other and would pass against a broken implementation too. The test below
 * ('the old read-yield-write shape...') is the one that actually interleaves.
 */
test("concurrent draws never deal the same card twice", async () => {
	const db = freshDb();
	setDeck(db, "g1", "poker", {
		remainingCards: getNewPokerDeck(true),
		drawnCards: [],
		lastActivity: 1,
	});

	const [first, second] = await Promise.all([
		Promise.resolve().then(() => drawCards(db, "g1", "poker", 5)),
		Promise.resolve().then(() => drawCards(db, "g1", "poker", 5)),
	]);

	assert.ok(first && second, "both draws should succeed on a 54-card deck");

	const ids = [...first.drawn, ...second.drawn].map((card) => card.id);
	assert.equal(ids.length, 10);
	assert.equal(new Set(ids).size, 10, "all ten cards must be distinct");

	const deck = getDeck(db, "g1", "poker");
	assert.equal(deck?.remainingCards.length, 44);
	assert.equal(deck?.drawnCards.length, 10);
	db.close();
});

/**
 * Demonstrates *why* the transaction is required, by reproducing the shape the
 * JSON store used: read, yield to the event loop, mutate, write back.
 *
 * The test above cannot show this on its own - `drawCards` is synchronous, so
 * two calls sequenced through Promise.all simply run one after the other and
 * would pass against a broken implementation too. This one interleaves for
 * real, and asserts the old shape loses cards while the transactional one does
 * not.
 */
test("the old read-yield-write shape loses cards, the transaction does not", async () => {
	const db = freshDb();

	const seed = () =>
		setDeck(db, "g1", "poker", {
			remainingCards: getNewPokerDeck(true),
			drawnCards: [],
			lastActivity: 1,
		});

	// The old pattern: the await between reading and writing is the whole bug.
	const unsafeDraw = async (count: number) => {
		const state = getDeck(db, "g1", "poker");
		if (!state) return [];
		await Promise.resolve();
		const drawn = state.remainingCards.splice(0, count);
		state.drawnCards.push(...drawn);
		setDeck(db, "g1", "poker", state);
		return drawn;
	};

	seed();
	const unsafe = (await Promise.all([unsafeDraw(5), unsafeDraw(5)])).flat();
	const unsafeIds = new Set(unsafe.map((card) => card.id));
	assert.ok(
		unsafeIds.size < unsafe.length,
		"the old shape is expected to deal duplicates once reads and writes interleave",
	);
	assert.equal(getDeck(db, "g1", "poker")?.remainingCards.length, 49, "one draw was lost");

	seed();
	const safe = (
		await Promise.all([
			(async () => { await Promise.resolve(); return drawCards(db, "g1", "poker", 5)?.drawn ?? []; })(),
			(async () => { await Promise.resolve(); return drawCards(db, "g1", "poker", 5)?.drawn ?? []; })(),
		])
	).flat();
	assert.equal(new Set(safe.map((card) => card.id)).size, 10, "no duplicates");
	assert.equal(getDeck(db, "g1", "poker")?.remainingCards.length, 44, "both draws landed");

	db.close();
});

test("deleteExpiredDecks removes only decks past the cutoff", () => {
	const db = freshDb();
	const now = 1_000_000;
	const maxIdle = 1_000;

	setDeck(db, "fresh", "poker", { remainingCards: [], drawnCards: [], lastActivity: now - 500 });
	setDeck(db, "stale", "poker", { remainingCards: [], drawnCards: [], lastActivity: now - 5_000 });

	const removed = deleteExpiredDecks(db, maxIdle, now);

	assert.equal(removed, 1);
	assert.ok(getDeck(db, "fresh", "poker"));
	assert.equal(getDeck(db, "stale", "poker"), null);
	db.close();
});
