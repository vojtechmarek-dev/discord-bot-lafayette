import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ColorResolvable } from 'discord.js';
import { Card, Command, ExtendedClient } from '../../types';
import { formatCard, getNewPokerDeck } from '../../utils/deckUtils';
import { drawCards, getCardDeck } from '../../guildStateManager';
import { getUserRollEmbedColor } from '../../guildSettingsManager';
import { DEFAULT_EMBED_COLOR } from '../../utils/colorUtils';
import { getDisplayName } from '../../utils/interactionUtils';

interface DrawOutcome {
    drawn: Card[];
    remaining: number;
    totalDrawn: number;
    shuffledBy: string | null;
}

export const drawCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('draw')
        .setDescription('Táhne karty z balíčku pro server.')
        .addIntegerOption(option => // Optional: allow drawing multiple cards
            option.setName('count')
                .setDescription('Počet karet k vytáhnutí (výchozí: 1, max: 52).')
                .setMinValue(1)
                .setMaxValue(52)
                .setRequired(false)
        ) as SlashCommandBuilder,
    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        const displayName = getDisplayName(interaction);
        const countToDraw = interaction.options.getInteger('count') || 1;

        const outcome = interaction.guildId
            ? drawFromGuildDeck(interaction.guildId, countToDraw)
            : drawFromTemporaryDeck(countToDraw);

        if (outcome.kind === 'empty') {
            await interaction.reply({
                content: 'Balíček je prázdný. Věřte mi, zkoušel jsem i kouzla – nefungují',
                ephemeral: true,
            });
            return;
        }

        if (outcome.kind === 'tooMany') {
            await interaction.reply({
                content: `Chcete ${countToDraw} karet, ale jen ${outcome.remaining} zbývá? No tedy! Doporučuji kariéru v účetnictví řádu.`,
                ephemeral: true,
            });
            return;
        }

        const { drawn, remaining, totalDrawn, shuffledBy } = outcome.result;
        const drawnCardsString = drawn.map(card => formatCard(card)).join(', ');

        let embedColor: ColorResolvable = DEFAULT_EMBED_COLOR;

        if (interaction.guildId) {
            embedColor = getUserRollEmbedColor(interaction.guildId, interaction.user.id);
        }

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`${displayName} vytáhl/a kart${drawn.length > 1 ? 'y' : 'u'}`)
            .setDescription(`Karty: **${drawnCardsString}**`);

        if (shuffledBy) {
            embed.setFooter({ text: `Balíček promíchal/a ${shuffledBy}.\nTaženo bylo ${totalDrawn} karet. Zbývá ${remaining}.` });
        } else {
            embed.setFooter({ text: `${totalDrawn} karet bylo vytáhnuto z tohoto balíčku.` });
        }

        await interaction.reply({ embeds: [embed] });
    },
};

type DrawAttempt =
    | { kind: 'ok'; result: DrawOutcome }
    | { kind: 'empty' }
    | { kind: 'tooMany'; remaining: number };

/**
 * The peek is only used to pick which refusal message to show. The draw itself
 * goes through `drawCards`, which does the read, the shift and the write inside
 * one transaction - so two people drawing at the same moment can never be dealt
 * the same card, which the old read-mutate-then-await-write allowed.
 *
 * A null result means someone drew in the gap between the peek and the draw.
 */
function drawFromGuildDeck(guildId: string, count: number): DrawAttempt {
    const deck = getCardDeck(guildId, 'poker');
    if (!deck || deck.remainingCards.length === 0) {
        return { kind: 'empty' };
    }
    if (count > deck.remainingCards.length) {
        return { kind: 'tooMany', remaining: deck.remainingCards.length };
    }

    const result = drawCards(guildId, 'poker', count);
    if (!result) {
        return { kind: 'tooMany', remaining: getCardDeck(guildId, 'poker')?.remainingCards.length ?? 0 };
    }

    return { kind: 'ok', result };
}

/** DMs have no guild deck, so they get a throwaway one that is never persisted. */
function drawFromTemporaryDeck(count: number): DrawAttempt {
    const remainingCards = getNewPokerDeck(true);
    if (count > remainingCards.length) {
        return { kind: 'tooMany', remaining: remainingCards.length };
    }

    const drawn = remainingCards.splice(0, count);
    return {
        kind: 'ok',
        result: {
            drawn,
            remaining: remainingCards.length,
            totalDrawn: drawn.length,
            shuffledBy: 'Lafayette',
        },
    };
}
