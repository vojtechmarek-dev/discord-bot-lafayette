import { Guild } from 'discord.js';
import { DeckType } from './types';
import { getDb } from './persistence';
import {
    deleteExpiredDecks,
    drawCards as drawCardsFromDeck,
    getDeck,
    setDeck,
    type CardDeckState,
    type DrawResult,
} from './persistence/deckRepository';

export type { CardDeckState, DrawResult };

const DECK_EXPIRY_MILLISECONDS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Card-deck state, backed by SQLite.
 *
 * Signatures are unchanged from the JSON-backed version so no command file had
 * to move, with one addition: `drawCards`, which exists because the old
 * read-mutate-then-await-write in /draw could deal the same card twice under
 * concurrency. `loadGuildState()` is gone - there is no cache to populate.
 */

export function getCardDeck(guildId: string | Guild, type: DeckType): CardDeckState | null {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    return getDeck(getDb(), id, type);
}

export async function setCardDeck(
    guildId: string | Guild,
    type: DeckType,
    deckState: CardDeckState | null,
): Promise<void> {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    setDeck(getDb(), id, type, deckState);
}

/**
 * Draws cards atomically, returning null when the deck is missing or too small.
 * Prefer this over get/mutate/set: it is the only variant that cannot interleave.
 */
export function drawCards(guildId: string | Guild, type: DeckType, count: number): DrawResult | null {
    const id = typeof guildId === 'string' ? guildId : guildId.id;
    return drawCardsFromDeck(getDb(), id, type, count);
}

export async function cleanupExpiredDecks(): Promise<void> {
    const removed = deleteExpiredDecks(getDb(), DECK_EXPIRY_MILLISECONDS);

    if (removed > 0) {
        console.log(`[DeckCleanup] Removed ${removed} expired deck(s).`);
    } else {
        console.log('[DeckCleanup] No expired decks found.');
    }
}
