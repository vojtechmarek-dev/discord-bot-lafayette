import fs from 'node:fs/promises';
import path from 'node:path';
import { Guild } from 'discord.js';
import { Card, DeckType } from './types';

export interface CardDeckState {
    remainingCards: Card[];
    drawnCards: Card[];
    lastActivity: number;
    shuffledBy?: string;
}

interface GuildState {
    decks?: { [deckType in DeckType]?: CardDeckState };
}

interface AllGuildStates {
    [guildId: string]: GuildState;
}

const STATE_FILE_PATH = path.join(__dirname, '..', 'data', 'guild-state.json');
const DECK_EXPIRY_MILLISECONDS = 7 * 24 * 60 * 60 * 1000; // 7 days

let guildStateCache: AllGuildStates = {};

async function ensureDataDirExists(): Promise<void> {
    try {
        await fs.mkdir(path.dirname(STATE_FILE_PATH), { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            console.error('[GuildState] Failed to create data directory:', error);
            throw error;
        }
    }
}

export async function loadGuildState(): Promise<void> {
    await ensureDataDirExists();
    try {
        const data = await fs.readFile(STATE_FILE_PATH, 'utf-8');
        guildStateCache = JSON.parse(data) as AllGuildStates;
        console.log('[GuildState] Guild state loaded successfully.');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log('[GuildState] guild-state.json not found. Initializing with empty state.');
            guildStateCache = {};
        } else {
            console.error('[GuildState] Error loading guild state:', error);
            guildStateCache = {};
        }
    }
}

async function saveGuildState(): Promise<void> {
    await ensureDataDirExists();
    try {
        const data = JSON.stringify(guildStateCache, null, 2);
        await fs.writeFile(STATE_FILE_PATH, data, 'utf-8');
        console.log('[GuildState] Guild state saved successfully.');
    } catch (error) {
        console.error('[GuildState] Error saving guild state:', error);
    }
}

export function getCardDeck(guildId: string | Guild, type: DeckType): CardDeckState | null {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    const state = guildStateCache[id];
    if (state && state.decks && state.decks[type]) {
        return state.decks[type] as CardDeckState;
    }
    return null;
}

export async function setCardDeck(
    guildId: string | Guild,
    type: DeckType,
    deckState: CardDeckState | null
): Promise<void> {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    if (!guildStateCache[id]) {
        guildStateCache[id] = {};
    }
    if (!guildStateCache[id].decks) {
        guildStateCache[id].decks = {};
    }
    if (deckState === null) {
        if (guildStateCache[id].decks && guildStateCache[id].decks[type]) {
            delete guildStateCache[id].decks[type];
        }
    } else {
        guildStateCache[id].decks![type] = deckState;
    }
    await saveGuildState();
}

export async function cleanupExpiredDecks(): Promise<void> {
    let changesMade = false;
    const now = Date.now();
    for (const guildId in guildStateCache) {
        const guild = guildStateCache[guildId];
        if (guild.decks) {
            for (const type of Object.keys(guild.decks) as DeckType[]) {
                const deckState = guild.decks[type];
                if (deckState) {
                    if (now - deckState.lastActivity > DECK_EXPIRY_MILLISECONDS) {
                        console.log(`[DeckCleanup] Expired deck (${type}) found for guild ${guildId}. Last activity: ${new Date(deckState.lastActivity).toISOString()}`);
                        delete guild.decks[type];
                        changesMade = true;
                    }
                }
            }
        }
    }
    if (changesMade) {
        await saveGuildState();
        console.log('[DeckCleanup] Expired decks cleaned up and state saved.');
    } else {
        console.log('[DeckCleanup] No expired decks found.');
    }
}


