import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ambienceDir,
	findAmbiencePreset,
	labelFromFileName,
	listAmbiencePresets,
	slugFromFileName,
	suggestAmbiencePresets,
	type AmbiencePreset,
} from "../src/utils/helpers/ambience";

/** Builds a throwaway data dir containing an ambience folder with these files. */
function withAmbienceDir(fileNames: string[]): string {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lafayette-ambience-"));
	const dir = path.join(dataDir, "ambience");
	fs.mkdirSync(dir, { recursive: true });
	for (const name of fileNames) {
		fs.writeFileSync(path.join(dir, name), "not really audio");
	}
	return dataDir;
}

const preset = (slug: string, label: string): AmbiencePreset => ({
	slug,
	label,
	absolutePath: `/tmp/${slug}.opus`,
});

test("labelFromFileName turns a file stem into a readable name", () => {
	assert.equal(labelFromFileName("tavern-night.opus"), "Tavern Night");
	assert.equal(labelFromFileName("heavy_rain.mp3"), "Heavy Rain");
	assert.equal(labelFromFileName("dungeon.ogg"), "Dungeon");
	// Diacritics must survive and still capitalise.
	assert.equal(labelFromFileName("les-v-noci.opus"), "Les V Noci");
});

test("slugFromFileName lowercases and drops the extension", () => {
	assert.equal(slugFromFileName("Tavern-Night.OPUS"), "tavern-night");
	assert.equal(slugFromFileName("rain.mp3"), "rain");
});

test("listAmbiencePresets returns nothing when the directory is absent", () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lafayette-empty-"));

	// Must be silent rather than throwing: a fresh deploy has no ambience dir.
	assert.deepEqual(listAmbiencePresets(dataDir), []);
	fs.rmSync(dataDir, { recursive: true, force: true });
});

test("listAmbiencePresets picks up supported audio files, sorted by label", () => {
	const dataDir = withAmbienceDir(["rain.opus", "battle.mp3", "tavern-night.ogg"]);

	const presets = listAmbiencePresets(dataDir);

	assert.deepEqual(presets.map(p => p.label), ["Battle", "Rain", "Tavern Night"]);
	assert.deepEqual(presets.map(p => p.slug), ["battle", "rain", "tavern-night"]);
	assert.ok(presets[0].absolutePath.endsWith(path.join("ambience", "battle.mp3")));
	fs.rmSync(dataDir, { recursive: true, force: true });
});

test("listAmbiencePresets ignores files the extractor could not play", () => {
	const dataDir = withAmbienceDir(["rain.opus", "notes.txt", "cover.png", "README.md"]);

	assert.deepEqual(listAmbiencePresets(dataDir).map(p => p.slug), ["rain"]);
	fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ambienceDir points at the ambience folder inside the data dir", () => {
	assert.equal(ambienceDir("/data"), path.join("/data", "ambience"));
});

test("findAmbiencePreset matches an exact slug", () => {
	const presets = [preset("rain", "Rain"), preset("rain-heavy", "Rain Heavy")];

	// Exact wins even though 'rain' is also a prefix of 'rain-heavy'.
	assert.equal(findAmbiencePreset("rain", presets)?.slug, "rain");
	assert.equal(findAmbiencePreset("RAIN", presets)?.slug, "rain");
});

test("findAmbiencePreset accepts an unambiguous prefix but refuses an ambiguous one", () => {
	const presets = [preset("tavern-night", "Tavern Night"), preset("tomb", "Tomb")];

	assert.equal(findAmbiencePreset("tav", presets)?.slug, "tavern-night");
	assert.equal(findAmbiencePreset("t", presets), null, "two candidates must not silently pick one");
	assert.equal(findAmbiencePreset("nope", presets), null);
	assert.equal(findAmbiencePreset("   ", presets), null);
});

test("suggestAmbiencePresets filters on a substring and respects Discord's 25-choice cap", () => {
	const presets = [preset("rain", "Rain"), preset("battle", "Battle"), preset("heavy-rain", "Heavy Rain")];

	assert.deepEqual(suggestAmbiencePresets("rain", presets).map(p => p.slug), ["rain", "heavy-rain"]);
	assert.deepEqual(suggestAmbiencePresets("", presets).map(p => p.slug), ["rain", "battle", "heavy-rain"]);

	const many = Array.from({ length: 40 }, (_, index) => preset(`bed-${index}`, `Bed ${index}`));
	assert.equal(suggestAmbiencePresets("bed", many).length, 25);
});
