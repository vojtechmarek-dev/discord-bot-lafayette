import { ColorResolvable, Guild, User } from 'discord.js';
import { DEFAULT_EMBED_COLOR } from './utils/colorUtils';
import { DEFAULT_SEARCH_SOURCE, type SearchableSource } from './utils/helpers/queryRouter';
import { getDb } from './persistence';
import {
    getGuildSettings,
    getUserSettings,
    setHighlightCrits,
    setMusicSearchSource as writeMusicSearchSource,
    setRollEmbedColor,
} from './persistence/settingsRepository';

/**
 * Settings accessors, backed by SQLite.
 *
 * Every signature here is unchanged from the JSON-backed version, and the
 * getters are deliberately still synchronous. That is the whole reason
 * `node:sqlite` was chosen over Redis: an async store would have forced these
 * to return Promises and rippled through roll.ts, draw.ts, shuffe.ts and
 * settings.ts. Setters stay `async` so existing `await` call sites compile
 * untouched, even though the write is now synchronous.
 */

const DEFAULT_HIGHLIGHT_CRITS = true;

// --- Guild settings ---

export function getHighlightCritsSetting(guildId: string | Guild): boolean {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    const row = getGuildSettings(getDb(), id);
    return row ? row.highlight_crits === 1 : DEFAULT_HIGHLIGHT_CRITS;
}

export async function setHighlightCritsSetting(guildId: string | Guild, enabled: boolean): Promise<void> {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    setHighlightCrits(getDb(), id, enabled);
    console.log(`[GuildSettings] Crit highlighting for guild ${id} set to: ${enabled}`);
}

export function getMusicSearchSource(guildId: string | Guild): SearchableSource {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    const row = getGuildSettings(getDb(), id);
    const stored = row?.music_search_source;
    return stored === 'youtube' || stored === 'soundcloud' ? stored : DEFAULT_SEARCH_SOURCE;
}

export async function setMusicSearchSource(guildId: string | Guild, source: SearchableSource): Promise<void> {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    writeMusicSearchSource(getDb(), id, source);
    console.log(`[GuildSettings] Music search source for guild ${id} set to: ${source}`);
}

// --- User-specific settings ---

export function getUserRollEmbedColor(guildId: string | Guild, userId: string | User): ColorResolvable {
    const gId = typeof guildId === 'string' ? guildId : guildId.id;
    const uId = typeof userId === 'string' ? userId : userId.id;
    const row = getUserSettings(getDb(), gId, uId);
    return (row?.roll_embed_color as ColorResolvable | undefined) ?? DEFAULT_EMBED_COLOR;
}

export async function setUserRollEmbedColor(
    guildId: string | Guild,
    userId: string | User,
    color: ColorResolvable,
): Promise<void> {
    const gId = typeof guildId === 'string' ? guildId : guildId.id;
    const uId = typeof userId === 'string' ? userId : userId.id;

    // The column is TEXT '#RRGGBB'. discord.js colours reach here as either a
    // string or a Colors enum number, and letting both into one STRICT column
    // is exactly the mess the legacy JSON had.
    const stored = typeof color === 'number'
        ? `#${color.toString(16).padStart(6, '0').toUpperCase()}`
        : String(color);

    setRollEmbedColor(getDb(), gId, uId, stored);
    console.log(`[UserSettings] Roll embed color for user ${uId} in guild ${gId} set to: ${stored}`);
}
