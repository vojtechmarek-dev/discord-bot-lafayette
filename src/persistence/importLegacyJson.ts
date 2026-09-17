import fs from 'node:fs/promises';
import path from 'node:path';
import type { Database } from './db';
import { parseColorString } from '../utils/colorUtils';
import { setDeck } from './deckRepository';
import type { Card, DeckType } from '../types';
import { cardFromId } from '../utils/deckUtils';

export interface LegacyImportReport {
    settingsFileFound: boolean;
    stateFileFound: boolean;
    guildsImported: number;
    userSettingsImported: number;
    decksImported: number;
    decksSkipped: number;
    warnings: string[];
}

export function emptyReport(): LegacyImportReport {
    return {
        settingsFileFound: false,
        stateFileFound: false,
        guildsImported: 0,
        userSettingsImported: 0,
        decksImported: 0,
        decksSkipped: 0,
        warnings: [],
    };
}

/**
 * Normalises a stored colour to '#RRGGBB'.
 *
 * The live JSON holds 5793266 - the *number* 0x5865F2 - because
 * PREDEFINED_COLORS[0].value is a discord.js Colors enum member while
 * parseColorString returns strings. A STRICT column cannot be both, so the
 * number form is converted here rather than being allowed into the schema.
 *
 * The recursion is bounded: a string hops to the number branch at most once,
 * and the number branch always returns.
 */
export function normalizeColor(value: unknown): string | null {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
        return `#${value.toString(16).padStart(6, '0').toUpperCase()}`;
    }

    if (typeof value === 'string') {
        const parsed = parseColorString(value);
        if (typeof parsed === 'number') {
            return normalizeColor(parsed);
        }
        if (typeof parsed === 'string') {
            const raw = parsed.startsWith('#') ? parsed.slice(1) : parsed;
            // parseColorString also accepts 3- and 8-digit hex.
            const six = raw.length === 3
                ? raw.split('').map((character) => character + character).join('')
                : raw.slice(0, 6);
            return /^[0-9A-F]{6}$/i.test(six) ? `#${six.toUpperCase()}` : null;
        }
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCards(value: unknown, guildId: string, deckType: string, report: LegacyImportReport): Card[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const cards: Card[] = [];
    for (const entry of value) {
        const id = isRecord(entry) && typeof entry.id === 'string' ? entry.id : null;
        const card = id ? cardFromId(id) : null;
        if (card) {
            cards.push(card);
        } else {
            report.warnings.push(
                `Guild ${guildId}, deck ${deckType}: unknown card ${JSON.stringify(id)}; dropped.`,
            );
        }
    }
    return cards;
}

/**
 * Imports the parsed contents of guild-settings.json. Pure with respect to I/O,
 * so it can be tested against a fixture copied from the real file.
 */
export function importLegacySettings(
    db: Database,
    raw: unknown,
    report: LegacyImportReport = emptyReport(),
): LegacyImportReport {
    if (!isRecord(raw)) {
        report.warnings.push('guild-settings.json did not contain an object; skipped.');
        return report;
    }

    db.transaction(() => {
        for (const [guildId, guildValue] of Object.entries(raw)) {
            if (!isRecord(guildValue)) {
                report.warnings.push(`Guild ${guildId}: settings were not an object; skipped.`);
                continue;
            }

            // `diceExplode` is the pre-rename key for `highlightCrits`; honour it
            // so a guild that configured it keeps its choice.
            const highlight = guildValue.highlightCrits ?? guildValue.diceExplode;
            const highlightCrits = typeof highlight === 'boolean' ? highlight : true;

            const searchSource = guildValue.musicSearchSource;
            const musicSearchSource =
                searchSource === 'youtube' || searchSource === 'soundcloud' ? searchSource : 'soundcloud';

            db.run(
                `INSERT INTO guild_settings (guild_id, highlight_crits, music_search_source, updated_at)
                 VALUES (:guildId, :highlightCrits, :musicSearchSource, :now)
                 ON CONFLICT (guild_id) DO UPDATE SET
                     highlight_crits     = :highlightCrits,
                     music_search_source = :musicSearchSource,
                     updated_at          = :now`,
                {
                    guildId,
                    highlightCrits: highlightCrits ? 1 : 0,
                    musicSearchSource,
                    now: Date.now(),
                },
            );
            report.guildsImported += 1;

            const userSettings = guildValue.userSettings;
            if (!isRecord(userSettings)) {
                continue;
            }

            for (const [userId, userValue] of Object.entries(userSettings)) {
                if (!isRecord(userValue)) {
                    continue;
                }

                const color = normalizeColor(userValue.rollEmbedColor);
                if (userValue.rollEmbedColor !== undefined && color === null) {
                    report.warnings.push(
                        `Guild ${guildId}, user ${userId}: could not normalise colour ` +
                        `${JSON.stringify(userValue.rollEmbedColor)}; left unset.`,
                    );
                }
                if (color === null) {
                    continue;
                }

                db.run(
                    `INSERT INTO user_settings (guild_id, user_id, roll_embed_color, updated_at)
                     VALUES (:guildId, :userId, :color, :now)
                     ON CONFLICT (guild_id, user_id) DO UPDATE SET
                         roll_embed_color = :color,
                         updated_at       = :now`,
                    { guildId, userId, color, now: Date.now() },
                );
                report.userSettingsImported += 1;
            }
        }
    });

    return report;
}

/** Imports the parsed contents of guild-state.json (card decks). */
export function importLegacyState(
    db: Database,
    raw: unknown,
    report: LegacyImportReport = emptyReport(),
): LegacyImportReport {
    if (!isRecord(raw)) {
        report.warnings.push('guild-state.json did not contain an object; skipped.');
        return report;
    }

    db.transaction(() => {
        for (const [guildId, guildValue] of Object.entries(raw)) {
            if (!isRecord(guildValue) || !isRecord(guildValue.decks)) {
                continue;
            }

            for (const [deckType, deckValue] of Object.entries(guildValue.decks)) {
                if (!isRecord(deckValue)) {
                    report.decksSkipped += 1;
                    continue;
                }

                const remainingCards = toCards(deckValue.remainingCards, guildId, deckType, report);
                const drawnCards = toCards(deckValue.drawnCards, guildId, deckType, report);
                const lastActivity =
                    typeof deckValue.lastActivity === 'number' ? deckValue.lastActivity : Date.now();
                const shuffledBy =
                    typeof deckValue.shuffledBy === 'string' ? deckValue.shuffledBy : undefined;

                setDeck(db, guildId, deckType as DeckType, {
                    remainingCards,
                    drawnCards,
                    lastActivity,
                    shuffledBy,
                });
                report.decksImported += 1;
            }
        }
    });

    return report;
}

async function readJsonIfPresent(filePath: string): Promise<{ found: boolean; value: unknown }> {
    try {
        const contents = await fs.readFile(filePath, 'utf-8');
        return { found: true, value: JSON.parse(contents) };
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return { found: false, value: null };
        }
        throw error;
    }
}

/**
 * Imports both legacy files, then renames them aside.
 *
 * Renamed rather than deleted, so the operator can roll back by checking out
 * the previous release and renaming them back. Only called when the database
 * was brand new, so it cannot run twice over the same data.
 */
export async function importLegacyJsonFiles(db: Database, dataDir: string): Promise<LegacyImportReport> {
    const report = emptyReport();
    const stamp = Date.now();

    const settingsPath = path.join(dataDir, 'guild-settings.json');
    const settings = await readJsonIfPresent(settingsPath);
    if (settings.found) {
        report.settingsFileFound = true;
        importLegacySettings(db, settings.value, report);
        await fs.rename(settingsPath, `${settingsPath}.imported-${stamp}`);
    }

    const statePath = path.join(dataDir, 'guild-state.json');
    const state = await readJsonIfPresent(statePath);
    if (state.found) {
        report.stateFileFound = true;
        importLegacyState(db, state.value, report);
        await fs.rename(statePath, `${statePath}.imported-${stamp}`);
    }

    return report;
}
