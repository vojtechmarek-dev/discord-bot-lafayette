import { Card, DeckType, Rank, Suit } from "../types";
import { CardDeckState } from "../guildStateManager";

export const SUITS_STANDARD: Suit[] = ['♠️', '♥️', '♦️', '♣️'];
export const RANKS_STANDARD: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Shuffles an array in place using Fisher-Yates algorithm with NumberGenerator.
 * This modifies the original array and returns the same reference for method chaining.
 * Utilizes the `generator` from @dice-roller/rpg-dice-roller for random number generation - native Math.random() is used in its implementation
 * @param array The array to shuffle
 * @returns The same array reference (for method chaining)
 */
export function shuffleInPlace<T>(array: T[]): T[] {
    if (array.length <= 1) {
        return array;
    }

    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

function createPokerDeck(includeJokers = false): ReadonlyArray<Card> {
    const deck: Card[] = [];
    // Standard 52 cards
    for (const suit of SUITS_STANDARD) {
        for (const rank of RANKS_STANDARD) {
            deck.push({
                rank,
                suit,
                color: (suit === '♥️' || suit === '♦️') ? 'red' : 'black',
                id: `${rank}${suit}` // Simple ID, ensure uniqueness if ranks/suits overlap
            });
        }
    }

    if (includeJokers) {
        deck.push({
            rank: 'Joker',
            suit: '🃏',
            color: 'red',
            id: 'JokerR'
        });
        deck.push({
            rank: 'Joker',
            suit: '🃏',
            color: 'black',
            id: 'JokerB'
        });
    }
    return Object.freeze(deck); // Make it immutable
}

const STANDARD_DECK = createPokerDeck(false);
const DECK_WITH_JOKERS = createPokerDeck(true);

/**
 * Creates a copy of the master poker deck.
 * @param includeJokers Whether to include the two jokers. Defaults to true for this example.
 */
export function getNewPokerDeck(includeJokers: boolean = true): Card[] {
    if (includeJokers) {
        return [...DECK_WITH_JOKERS]; // Return a mutable copy
    } else {
        // Filter out jokers if not needed
        return [...STANDARD_DECK];
    }
}

/**
 * Creates a new, shuffled poker deck state.
 * @param shufflerId User ID of the person shuffling.
 * @param deckOptions Options for creating the deck (e.g., includeJokers).
 */
export function createNewShuffledDeckState(
    shufflerId: string,
    type: DeckType = 'poker',
    deckOptions: { includeJokers?: boolean } = { includeJokers: true } // Default to include Jokers
    ): Map<DeckType,CardDeckState> {
    if (type !== 'poker') {
        throw new Error(`Unsupported deck type: ${type}`);
    }

    const newDeck = getNewPokerDeck(deckOptions.includeJokers); // Get a fresh copy
    shuffleInPlace(newDeck); // Shuffle the copy

    return new Map<DeckType, CardDeckState>([[type, {
        remainingCards: newDeck, // This is now the shuffled copy
        drawnCards: [],
        lastActivity: Date.now(),
        shuffledBy: shufflerId,
    }]]);
}

export function formatCard(card: Card): string {
    if (card.rank === 'Joker') {
        const colorName = card.color === 'red' ? 'Red' : 'Black';
        return `Joker (${colorName}) 🃏`;
    }
    return `${card.rank}${card.suit}`;
}
