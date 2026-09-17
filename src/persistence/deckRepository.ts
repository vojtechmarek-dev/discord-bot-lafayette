import type { Database } from './db';
import type { Card, DeckType } from '../types';
import { cardFromId } from '../utils/deckUtils';

export interface CardDeckState {
    remainingCards: Card[];
    drawnCards: Card[];
    lastActivity: number;
    shuffledBy?: string;
}

interface CardDeckRow {
    guild_id: string;
    deck_type: string;
    remaining_cards: string;
    drawn_cards: string;
    shuffled_by: string | null;
    last_activity: number;
}

/**
 * Decks are stored as JSON arrays of card ids rather than whole Card objects.
 * A Card is fully derivable from its id, so this keeps a row short and makes
 * the read-modify-write in `drawCards` cheap.
 */
function encodeCards(cards: Card[]): string {
    return JSON.stringify(cards.map((card) => card.id));
}

function decodeCards(encoded: string, context: string): Card[] {
    let ids: unknown;
    try {
        ids = JSON.parse(encoded);
    } catch {
        console.error(`[DeckRepo] Corrupt card list for ${context}; treating as empty.`);
        return [];
    }
    if (!Array.isArray(ids)) {
        return [];
    }

    const cards: Card[] = [];
    for (const id of ids) {
        const card = typeof id === 'string' ? cardFromId(id) : null;
        if (card) {
            cards.push(card);
        } else {
            console.warn(`[DeckRepo] Unknown card id ${JSON.stringify(id)} in ${context}; dropping it.`);
        }
    }
    return cards;
}

function rowToState(row: CardDeckRow): CardDeckState {
    const context = `${row.guild_id}/${row.deck_type}`;
    return {
        remainingCards: decodeCards(row.remaining_cards, `${context} remaining`),
        drawnCards: decodeCards(row.drawn_cards, `${context} drawn`),
        lastActivity: row.last_activity,
        shuffledBy: row.shuffled_by ?? undefined,
    };
}

export function getDeck(db: Database, guildId: string, deckType: DeckType): CardDeckState | null {
    const row = db.get<CardDeckRow>(
        'SELECT * FROM card_decks WHERE guild_id = :guildId AND deck_type = :deckType',
        { guildId, deckType },
    );
    return row ? rowToState(row) : null;
}

export function setDeck(db: Database, guildId: string, deckType: DeckType, state: CardDeckState | null): void {
    if (state === null) {
        db.run('DELETE FROM card_decks WHERE guild_id = :guildId AND deck_type = :deckType', { guildId, deckType });
        return;
    }

    db.run(
        `INSERT INTO card_decks (guild_id, deck_type, remaining_cards, drawn_cards, shuffled_by, last_activity)
         VALUES (:guildId, :deckType, :remaining, :drawn, :shuffledBy, :lastActivity)
         ON CONFLICT (guild_id, deck_type) DO UPDATE SET
             remaining_cards = :remaining,
             drawn_cards     = :drawn,
             shuffled_by     = :shuffledBy,
             last_activity   = :lastActivity`,
        {
            guildId,
            deckType,
            remaining: encodeCards(state.remainingCards),
            drawn: encodeCards(state.drawnCards),
            shuffledBy: state.shuffledBy ?? null,
            lastActivity: state.lastActivity,
        },
    );
}

export interface DrawResult {
    drawn: Card[];
    remaining: number;
    totalDrawn: number;
    shuffledBy: string | null;
}

/**
 * Draws `count` cards atomically.
 *
 * This is the headline fix of the storage rewrite. The old `/draw` read the
 * deck, mutated `remainingCards` in place, and only then awaited a full-file
 * JSON write - so two overlapping draws both read the same deck and the second
 * write clobbered the first, dealing the same cards twice.
 *
 * Here the read, the shift and the write all happen inside one synchronous
 * transaction with no `await` between them, so they cannot interleave.
 *
 * Returns null when the deck is missing or has too few cards, leaving it
 * untouched.
 */
export function drawCards(db: Database, guildId: string, deckType: DeckType, count: number): DrawResult | null {
    return db.transaction(() => {
        const state = getDeck(db, guildId, deckType);
        if (!state || state.remainingCards.length < count || count < 1) {
            return null;
        }

        const drawn = state.remainingCards.splice(0, count);
        state.drawnCards.push(...drawn);
        state.lastActivity = Date.now();

        setDeck(db, guildId, deckType, state);

        return {
            drawn,
            remaining: state.remainingCards.length,
            totalDrawn: state.drawnCards.length,
            shuffledBy: state.shuffledBy ?? null,
        };
    });
}

/** Deletes decks idle for longer than `maxIdleMs`. Returns how many went. */
export function deleteExpiredDecks(db: Database, maxIdleMs: number, now: number = Date.now()): number {
    const result = db.run('DELETE FROM card_decks WHERE last_activity < :cutoff', { cutoff: now - maxIdleMs });
    return result.changes;
}
