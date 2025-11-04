import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command, ExtendedClient } from '../../types';
import { setCardDeck } from '../../guildStateManager';
import { createNewShuffledDeckState } from '../../utils/deckUtils';
import { getDisplayName } from '../../utils/interactionUtils';
import { getUserRollEmbedColor } from '../../guildSettingsManager';

export const shuffleCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Promíchá nový balíček o 52 kartách (s žolíky nebo bez) pro server.')
        .addBooleanOption(option => 
            option.setName('jokers')
                .setDescription('Zahrnout žolíky do balíčku? (Výchozí: Ano)')
                .setRequired(false)
        ) as SlashCommandBuilder,
    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        const displayName = getDisplayName(interaction);

        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        const includeJokers = interaction.options.getBoolean('jokers') ?? true;
        const deckType = 'poker';

        const newDeckState = createNewShuffledDeckState(displayName, deckType, { includeJokers });
        await setCardDeck(interaction.guildId, newDeckState.keys().next().value!, newDeckState.values().next().value!);

        const deckDescription = includeJokers
            ? "nový balíček o 52 kartách s žolíky"
            : "nový balíček o 52 kartách bez žolíků";

        const embed = new EmbedBuilder()
            .setColor(getUserRollEmbedColor(interaction.guildId, interaction.user.id))
            .setTitle('🃏 Balíček byl promíchán!')
            .setDescription(`${displayName} promíchal/a ${deckDescription}.\n**${newDeckState.get(deckType)?.remainingCards.length}** karet připraveno. Balíček bude dostupný po dobu 7 dní.`)
            .setFooter({ text: 'Použij /draw k vytáhnutí karty.' });

        await interaction.reply({ embeds: [embed] });
    },
};