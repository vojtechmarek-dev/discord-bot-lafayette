import test from "node:test";
import assert from "node:assert/strict";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import { formatIndividualRolls, hasTooManyNotations, splitDiceNotations } from "../src/commands/fun/roll";

test("splitDiceNotations parses comma and semicolon separators", () => {
	const parsed = splitDiceNotations(" 2d6 ; 1d20+5, d4 ");
	assert.deepEqual(parsed, ["2d6", "1d20+5", "d4"]);
});

test("splitDiceNotations removes empty notation parts", () => {
	const parsed = splitDiceNotations("2d6,, ; ; 1d8");
	assert.deepEqual(parsed, ["2d6", "1d8"]);
});

test("hasTooManyNotations is true when there are more than five requests", () => {
	const parsed = splitDiceNotations("1d6,2d6,3d6,4d6,5d6,6d6");
	assert.equal(hasTooManyNotations(parsed), true);
});

test("hasTooManyNotations is false when there are five or fewer requests", () => {
	const parsed = splitDiceNotations("1d6,2d6,3d6,4d6,5d6");
	assert.equal(hasTooManyNotations(parsed), false);
});

test("formatIndividualRolls marks max roll when explode info is enabled", () => {
	const roll = new DiceRoll("1d1");
	const formatted = formatIndividualRolls(roll, true);

	assert.equal(formatted, "`[1!]`");
});

test("formatIndividualRolls does not mark max roll when explode info is disabled", () => {
	const roll = new DiceRoll("1d1");
	const formatted = formatIndividualRolls(roll, false);

	assert.equal(formatted, "`[1]`");
});
