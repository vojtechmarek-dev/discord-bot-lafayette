import test from "node:test";
import assert from "node:assert/strict";
import { parseColorString } from "../src/utils/colorUtils";
import { formatCard, getNewPokerDeck } from "../src/utils/deckUtils";

test("parseColorString parses valid hex values", () => {
	const parsedWithHash = parseColorString("#ff00ff");
	const parsedWithoutHash = parseColorString("ff00ff");

	assert.equal(parsedWithHash, "#FF00FF");
	assert.equal(parsedWithoutHash, "#FF00FF");
});

test("parseColorString rejects unknown color keywords", () => {
	const parsed = parseColorString("not-a-real-color");
	assert.equal(parsed, null);
});

test("getNewPokerDeck returns expected deck size based on jokers option", () => {
	const withJokers = getNewPokerDeck(true);
	const withoutJokers = getNewPokerDeck(false);

	assert.equal(withJokers.length, 54);
	assert.equal(withoutJokers.length, 52);
});

test("getNewPokerDeck returns a copy on each call", () => {
	const first = getNewPokerDeck(false);
	const second = getNewPokerDeck(false);

	first.pop();

	assert.equal(first.length, 51);
	assert.equal(second.length, 52);
});

test("formatCard returns readable values for joker and standard cards", () => {
	const joker = formatCard({
		id: "JokerR",
		rank: "Joker",
		suit: "🃏",
		color: "red",
	});
	const aceSpades = formatCard({
		id: "A♠️",
		rank: "A",
		suit: "♠️",
		color: "black",
	});

	assert.equal(joker, "Joker (Red) 🃏");
	assert.equal(aceSpades, "A♠️");
});
