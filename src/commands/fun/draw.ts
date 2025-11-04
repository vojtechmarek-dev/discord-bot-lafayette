import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ColorResolvable } from 'discord.js';
import { Card, Command, ExtendedClient } from '../../types';
import { formatCard, getNewPokerDeck } from '../../utils/deckUtils';
import { CardDeckState, getCardDeck, setCardDeck } from '../../guildStateManager';
import { getUserRollEmbedColor } from '../../guildSettingsManager';
import { PREDEFINED_COLORS } from '../../utils/colorUtils';
import { getDisplayName } from '../../utils/interactionUtils';

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
    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        const displayName = getDisplayName(interaction);

        const deckState = interaction.guildId ? getCardDeck(interaction.guildId, 'poker') : getTempDeckState();

        if (!deckState || deckState.remainingCards.length === 0) {
            await interaction.reply({
                content: 'Balíček je prázdný. Věřte mi, zkoušel jsem i kouzla – nefungují',
                ephemeral: true,
            });
            return;
        }

        const countToDraw = interaction.options.getInteger('count') || 1;

        if (countToDraw > deckState.remainingCards.length) {
            await interaction.reply({
                content: `Chcete ${countToDraw} karet, ale jen ${deckState.remainingCards.length} zbývá? No tedy! Doporučuji kariéru v účetnictví řádu.`,
                ephemeral: true,
            });
            return;
        }

        const drawnCardsThisTurn: Card[] = [];
        for (let i = 0; i < countToDraw; i++) {
            const card = deckState.remainingCards.shift();
            if (card) {
                drawnCardsThisTurn.push(card);
                deckState.drawnCards.push(card);
            }
        }

        deckState.lastActivity = Date.now();
        if (interaction.guildId) {
            await setCardDeck(interaction.guildId, 'poker' , deckState);
        }

        const drawnCardsString = drawnCardsThisTurn.map(card => formatCard(card)).join(', ');

        let embedColor: ColorResolvable = PREDEFINED_COLORS[0].value;
        
        if (interaction.guildId) {
            embedColor = getUserRollEmbedColor(interaction.guildId!, interaction.user.id);
        }

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`${displayName} vytáhl/a kart${countToDraw > 1 ? 'y' : 'u'}`)
            .setDescription(`Karty: **${drawnCardsString}**`)

        if (deckState.shuffledBy) {
            embed.setFooter({ text: `Balíček promíchal/a ${deckState.shuffledBy || 'Unknown User'}.\nTaženo bylo ${deckState.drawnCards.length} karet. Zbývá ${deckState.remainingCards.length}.` });
        } else {
            embed.setFooter({ text: `${deckState.drawnCards.length} karet bylo vytáhnuto z tohoto balíčku.` });
        }


        await interaction.reply({ embeds: [embed] });
    },
};

const getTempDeckState = (): CardDeckState => ({
    remainingCards: getNewPokerDeck(true),
    drawnCards: [],
    lastActivity: Date.now(),
    shuffledBy: "Lafayette",
});