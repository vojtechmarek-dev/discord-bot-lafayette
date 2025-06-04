// src/guildSettingsManager.ts
import fs from 'node:fs/promises'; // Use promise-based fs for async operations
import path from 'node:path';
import { ColorResolvable, Guild, User } from 'discord.js';

// Define the structure for a single guild's settings
export interface GuildSettings {
    diceExplode?: boolean; // Optional: will use default if not set
    // language todo
    userSettings?: { // New: Nested object for user-specific settings
        [userId: string]: UserSpecificSettings;
    };
}

export interface UserSpecificSettings {
    rollEmbedColor?: ColorResolvable; // Store as ColorResolvable (string hex, number, or keyword)
}

// Define the structure for the entire settings file
interface AllGuildSettings {
    [guildId: string]: GuildSettings;
}

const SETTINGS_FILE_PATH = path.join(__dirname, '..', 'data', 'guild-settings.json'); // Store in a 'data' folder at project root
const DEFAULT_DICE_EXPLODE = true; // Default setting for dice explosion
export const DEFAULT_USER_ROLL_EMBED_COLOR: ColorResolvable = '#ffffff';

let guildSettingsCache: AllGuildSettings = {};



/**
 * Ensures the data directory exists.
 */
async function ensureDataDirExists(): Promise<void> {
    try {
        await fs.mkdir(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') { // Ignore if directory already exists
            console.error('Failed to create data directory for guild settings:', error);
            throw error; // Re-throw if it's a critical error
        }
    }
}

/**
 * Loads guild settings from the JSON file into the cache.
 * Call this once when the bot starts.
 */
export async function loadGuildSettings(): Promise<void> {
    await ensureDataDirExists();
    try {
        const data = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
        guildSettingsCache = JSON.parse(data) as AllGuildSettings;
        console.log('[GuildSettings] Guild settings loaded successfully.');
    } catch (error: any) {
        if (error.code === 'ENOENT') { // File not found
            console.log('[GuildSettings] guild-settings.json not found. Initializing with empty settings.');
            guildSettingsCache = {};
            // Optionally save an empty file immediately
            // await saveGuildSettings();
        } else {
            console.error('[GuildSettings] Error loading guild settings:', error);
            // Decide how to handle: throw, or proceed with empty/default settings?
            // For robustness, proceeding with empty cache might be okay for some bots.
            guildSettingsCache = {};
        }
    }
}

/**
 * Saves the current state of guildSettingsCache to the JSON file.
 * Call this after any setting modification.
 */
async function saveGuildSettings(): Promise<void> {
    await ensureDataDirExists();
    try {
        const data = JSON.stringify(guildSettingsCache, null, 2); // Pretty print JSON
        await fs.writeFile(SETTINGS_FILE_PATH, data, 'utf-8');
        console.log('[GuildSettings] Guild settings saved successfully.');
    } catch (error) {
        console.error('[GuildSettings] Error saving guild settings:', error);
    }
}

/**
 * Gets a specific setting for a guild, or a default value.
 * @param guildId The ID of the guild.
 * @param key The setting key (e.g., 'diceExplode').
 * @param defaultValue The default value if the setting is not found.
 */
function getSetting<K extends keyof GuildSettings, T extends GuildSettings[K]>(
    guildId: string,
    key: K,
    defaultValue: NonNullable<T> // Ensure defaultValue is not undefined/null if T can be
): NonNullable<T> {
    const settings = guildSettingsCache[guildId];
    if (settings && typeof settings[key] !== 'undefined') {
        return settings[key] as NonNullable<T>;
    }
    return defaultValue;
}

/**
 * Sets a specific setting for a guild and saves all settings.
 * @param guildId The ID of the guild.
 * @param key The setting key.
 * @param value The new value for the setting.
 */
async function setSetting<K extends keyof GuildSettings>(
    guildId: string,
    key: K,
    value: GuildSettings[K]
): Promise<void> {
    if (!guildSettingsCache[guildId]) {
        guildSettingsCache[guildId] = {};
    }
    guildSettingsCache[guildId][key] = value;
    await saveGuildSettings();
}

/**
 * Gets a specific setting for a user within a guild.
 */
function getUserSetting<K extends keyof UserSpecificSettings, T extends UserSpecificSettings[K]>(
    guildId: string,
    userId: string,
    key: K,
    defaultValue: NonNullable<T>
): NonNullable<T> {
    const guild = guildSettingsCache[guildId];
    if (guild && guild.userSettings && guild.userSettings[userId] && typeof guild.userSettings[userId][key] !== 'undefined') {
        return guild.userSettings[userId][key] as NonNullable<T>;
    }
    return defaultValue;
}

/**
 * Sets a specific setting for a user within a guild and saves.
 */
async function setUserSetting<K extends keyof UserSpecificSettings>(
    guildId: string,
    userId: string,
    key: K,
    value: UserSpecificSettings[K]
): Promise<void> {
    if (!guildSettingsCache[guildId]) {
        guildSettingsCache[guildId] = {};
    }
    if (!guildSettingsCache[guildId].userSettings) {
        guildSettingsCache[guildId].userSettings = {};
    }
    if (!guildSettingsCache[guildId].userSettings![userId]) { // Use non-null assertion after check
        guildSettingsCache[guildId].userSettings![userId] = {};
    }
    guildSettingsCache[guildId].userSettings![userId][key] = value;
    await saveGuildSettings();
}

// --- Specific Setting Accessors ---

export function getDiceExplodeSetting(guildId: string | Guild): boolean {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    return getSetting(id, 'diceExplode', DEFAULT_DICE_EXPLODE);
}

export async function setDiceExplodeSetting(guildId: string | Guild, enabled: boolean): Promise<void> {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    await setSetting(id, 'diceExplode', enabled);
    console.log(`[GuildSettings] Dice explosion for guild ${id} set to: ${enabled}`);
}

// --- User-Specific Setting Accessors ---

export function getUserRollEmbedColor(guildId: string | Guild, userId: string | User): ColorResolvable {
    const gId = typeof guildId === 'string' ? guildId : guildId.id;
    const uId = typeof userId === 'string' ? userId : userId.id;
    return getUserSetting(gId, uId, 'rollEmbedColor', DEFAULT_USER_ROLL_EMBED_COLOR);
}

export async function setUserRollEmbedColor(guildId: string | Guild, userId: string | User, color: ColorResolvable): Promise<void> {
    const gId = typeof guildId === 'string' ? guildId : guildId.id;
    const uId = typeof userId === 'string' ? userId : userId.id;
    await setUserSetting(gId, uId, 'rollEmbedColor', color);
    console.log(`[UserSettings] Roll embed color for user ${uId} in guild ${gId} set to: ${color}`);
}

// Add more getters/setters for other settings here
// export function getAnotherSetting(guildId: string): string {
//     return getSetting(guildId, 'anotherSetting', 'defaultStringValue');
// }
// export async function setAnotherSetting(guildId: string, value: string): Promise<void> {
//     await setSetting(guildId, 'anotherSetting', value);
// }