import test from "node:test";
import assert from "node:assert/strict";
import { DiceRoll, NumberGenerator } from "@dice-roller/rpg-dice-roller";
import {
	CRIT_FAILURE_MARKER,
	CRIT_SUCCESS_MARKER,
	formatAdvDisRolls,
	formatIndividualRolls,
} from "../src/commands/fun/roll";

// The generator engine is global library state, so every test sets it explicitly
// and hands it back afterwards. `max` forces every die to its maximum and `min`
// to its minimum, which makes advantage/disadvantage output deterministic
// without stubbing anything.
const defaultEngine = NumberGenerator.generator.engine;

function withEngine<T>(engine: typeof defaultEngine, run: () => T): T {
	NumberGenerator.generator.engine = engine;
	try {
		return run();
	} finally {
		NumberGenerator.generator.engine = defaultEngine;
	}
}

const rollWith = (engine: typeof defaultEngine, notation: string) =>
	withEngine(engine, () => new DiceRoll(notation));

test("formatAdvDisRolls keeps the surviving d20 and strikes the dropped one", () => {
	const roll = rollWith(NumberGenerator.engines.max, "2d20kh1+5");
	const formatted = formatAdvDisRolls(roll, false);

	assert.equal(formatted, "`20`, ~~20~~");
});

test("formatAdvDisRolls marks a natural maximum as a critical success", () => {
	const roll = rollWith(NumberGenerator.engines.max, "2d20kh1+5");
	const formatted = formatAdvDisRolls(roll, true);

	assert.equal(formatted, `\`20${CRIT_SUCCESS_MARKER}\`, ~~20~~`);
});

// Asserted against the constant rather than a literal, so this keeps proving the
// minimum branch is wired if CRIT_FAILURE_MARKER is ever given a glyph. While the
// marker is empty the rendered output is deliberately indistinguishable from an
// unmarked roll.
test("formatAdvDisRolls renders a natural minimum with the crit-failure marker", () => {
	const roll = rollWith(NumberGenerator.engines.min, "2d20kl1+5");
	const formatted = formatAdvDisRolls(roll, true);

	assert.equal(formatted, `\`1${CRIT_FAILURE_MARKER}\`, ~~1~~`);
});

// Guards the wiring independently of the marker's current value: whatever the
// markers are set to, a maximum and a minimum must not render the same way
// unless both markers are equal.
test("formatRollResult distinguishes a maximum from a minimum via the markers", () => {
	const maxRoll = rollWith(NumberGenerator.engines.max, "1d20");
	const minRoll = rollWith(NumberGenerator.engines.min, "1d20");

	assert.equal(formatIndividualRolls(maxRoll, true), `\`[20${CRIT_SUCCESS_MARKER}]\``);
	assert.equal(formatIndividualRolls(minRoll, true), `\`[1${CRIT_FAILURE_MARKER}]\``);
	assert.notEqual(CRIT_SUCCESS_MARKER, CRIT_FAILURE_MARKER);
});

// The regression this suite exists for. `2d20kh1+5` produces ONE dice group
// because a flat `+5` is not a dice group, while `2d20kh1+5+1d4` produces TWO.
// The previous implementation branched on the group count, so any second dice
// term - Bless, Bardic Inspiration, Guidance - fell through to raw library
// output and lost the kept/dropped rendering entirely.
test("formatAdvDisRolls renders extra dice groups such as Bless (+1d4)", () => {
	const roll = rollWith(NumberGenerator.engines.max, "2d20kh1+5+1d4");
	const formatted = formatAdvDisRolls(roll, false);

	assert.equal(formatted, "`20`, ~~20~~ `[4]`");
	assert.ok(!formatted.includes("d"), "must not fall back to raw library output");
});

test("formatAdvDisRolls marks crits inside extra dice groups too", () => {
	const roll = rollWith(NumberGenerator.engines.max, "2d20kh1+1d4");
	const formatted = formatAdvDisRolls(roll, true);

	assert.equal(
		formatted,
		`\`20${CRIT_SUCCESS_MARKER}\`, ~~20~~ \`[4${CRIT_SUCCESS_MARKER}]\``,
	);
});

test("formatAdvDisRolls falls back to raw output when the notation is not a keep-pair", () => {
	const roll = rollWith(NumberGenerator.engines.max, "1d20+5");
	const formatted = formatAdvDisRolls(roll, true);

	assert.equal(formatted, roll.output);
});

test("formatIndividualRolls renders minimum rolls with the crit-failure marker", () => {
	const roll = rollWith(NumberGenerator.engines.min, "2d20");
	const formatted = formatIndividualRolls(roll, true);

	assert.equal(formatted, `\`[1${CRIT_FAILURE_MARKER},1${CRIT_FAILURE_MARKER}]\``);
});

test("formatIndividualRolls leaves minimum rolls unmarked when highlighting is off", () => {
	const roll = rollWith(NumberGenerator.engines.min, "2d20");
	const formatted = formatIndividualRolls(roll, false);

	assert.equal(formatted, "`[1,1]`");
});

// FudgeDice reports `sides` as the string 'F.2' with min -1 and max 1, so the
// previous `value == dice.sides` comparison could never mark a fudge die.
test("formatIndividualRolls marks fudge dice, which report sides as a string", () => {
	const maxRoll = rollWith(NumberGenerator.engines.max, "2dF");
	assert.equal(
		formatIndividualRolls(maxRoll, true),
		`\`[1${CRIT_SUCCESS_MARKER},1${CRIT_SUCCESS_MARKER}]\``,
	);

	const minRoll = rollWith(NumberGenerator.engines.min, "2dF");
	assert.equal(
		formatIndividualRolls(minRoll, true),
		`\`[-1${CRIT_FAILURE_MARKER},-1${CRIT_FAILURE_MARKER}]\``,
	);
});
