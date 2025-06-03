// src/commands/utility/settings.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { Command, ExtendedClient } from '../../types';
import { getDiceExplodeSetting, setDiceExplodeSetting, GuildSettings } from '../../guildSettingsManager';

export const settingsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Manage server-specific bot settings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Only users who can manage guild
        .addSubcommand(subcommand =>
            subcommand
                .setName('dice')
                .setDescription('Configure dice rolling settings.')
                .addBooleanOption(option =>
                    option.setName('explode')
                        .setDescription('Enable or disable exploding dice (max roll gets an extra die).')
                        .setRequired(true)
                )
        )
        // Add more subcommands for other settings categories
        // .addSubcommand(subcommand =>
        //     subcommand
        //         .setName('music')
        //         .setDescription('Configure music settings.')
        //         // ... music options
        // )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current server settings.')
        ),

    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dice') {
            const explode = interaction.options.getBoolean('explode', true);
            await setDiceExplodeSetting(interaction.guildId, explode);
            await interaction.reply({
                content: `🎲 Dice explosion has been **${explode ? 'ENABLED' : 'DISABLED'}** for this server.`,
                ephemeral: true,
            });
        } else if (subcommand === 'view') {
            const diceExplode = getDiceExplodeSetting(interaction.guildId);
            // Add other settings here when you have them
            // const someOtherSetting = getAnotherSetting(interaction.guildId);

            await interaction.reply({
                content: `**Current Server Settings:**\n- Dice Explode: **${diceExplode ? 'Enabled' : 'Disabled'}**`,
                // \n- Other Setting: ${someOtherSetting}
                ephemeral: true,
            });
        }
        // Handle other subcommands
    },
};