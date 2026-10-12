import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';
import { getMusicVolume, setMusicVolume } from '../../guildSettingsManager';

export const volumeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Nastaví hlasitost přehrávání pro tento server.')
        .addIntegerOption(option =>
            option.setName('procenta')
                .setDescription('0 až 100. Bez zadání pouze zobrazím současnou hodnotu.')
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(false)) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Tento příkaz lze použít pouze na serveru.', ephemeral: true });
            return;
        }

        const requested = interaction.options.getInteger('procenta');

        if (requested === null) {
            await interaction.reply({
                content: `🔉 Hlasitost je nastavena na **${getMusicVolume(interaction.guildId)} %**.`,
                ephemeral: true,
            });
            return;
        }

        // Persisted so it survives a restart and applies to the next queue, and
        // applied live if something is playing right now. The stored value is
        // what `buildNodeOptions` reads when a queue is created - the hardcoded
        // 50 used to be the only volume this bot had.
        await setMusicVolume(interaction.guildId, requested);

        const queue = useQueue(interaction.guildId);
        const appliedNow = queue && !queue.deleted ? queue.node.setVolume(requested) : false;

        await interaction.reply({
            content: appliedNow
                ? `🔉 Hlasitost nastavena na **${requested} %**. Uši jsou vaše. Odpovědnost rovněž.`
                : `🔉 Hlasitost uložena na **${requested} %**. Použiji ji, až bude co přehrávat.`,
        });
    },
};
