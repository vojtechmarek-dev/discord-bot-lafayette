// src/commands/utility/settings.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ColorResolvable, // Import
} from 'discord.js';
import { Command, ExtendedClient } from '../../types';
import {
    getDiceExplodeSetting,
    setDiceExplodeSetting,
    getUserRollEmbedColor,  // New import
    setUserRollEmbedColor, // New import
    DEFAULT_USER_ROLL_EMBED_COLOR // New import
} from '../../guildSettingsManager';
import { parseColorString, PREDEFINED_COLORS } from '../../utils/colorUtils'; // New import

export const settingsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Manage server-specific and personal bot settings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // For guild-wide settings
        .addSubcommand(subcommand =>
            subcommand
                .setName('guild') // Renamed 'dice' to 'guild' for clarity if more guild settings come
                .setDescription('Configure server-wide settings (requires Manage Guild permission).')
                .addBooleanOption(option =>
                    option.setName('dice_explode')
                        .setDescription('Enable/disable exploding dice for all rolls in this server.')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('me') // User-specific settings
                .setDescription('Manage your personal settings for this server.')
                .addStringOption(option =>
                    option.setName('roll_color')
                        .setDescription('Set embed color for your dice rolls (e.g., #FF0000, Red, or leave blank for options).')
                        .setRequired(false) // Make it optional to trigger button flow
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current server and your personal settings.')
        ),

    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const user = interaction.user;

        if (subcommand === 'guild') {
            // Ensure user has ManageGuild permission for this subcommand specifically
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                await interaction.reply({ content: 'You need the "Manage Guild" permission to change server-wide settings.', ephemeral: true});
                return;
            }
            const explode = interaction.options.getBoolean('dice_explode', true);
            await setDiceExplodeSetting(interaction.guildId, explode);
            await interaction.reply({
                content: `🎲 Server-wide dice explosion has been **${explode ? 'ENABLED' : 'DISABLED'}**.`,
                ephemeral: true,
            });
        } else if (subcommand === 'me') {
            const colorInput = interaction.options.getString('roll_color');
            let chosenColor: ColorResolvable | null = null;

            if (colorInput) {
                chosenColor = parseColorString(colorInput);
                if (chosenColor) {
                    await setUserRollEmbedColor(interaction.guildId, user.id, chosenColor);
                    await interaction.reply({
                        content: `🎨 Your dice roll embed color has been set to \`${chosenColor.toString()}\`.`,
                        ephemeral: true,
                    });
                    return;
                } else {
                    // Color input provided but not parseable, proceed to offer predefined
                    await interaction.reply({
                        content: `🤔 I couldn't understand "${colorInput}" as a color. Choose from the options below or try a hex code (e.g., #RRGGBB) or a basic color name.`,
                        ephemeral: true,
                        components: createColorButtons(interaction.id, 0) // initial set of buttons
                    });
                }
            } else {
                // No color input, directly offer predefined choices
                await interaction.reply({
                    content: '🎨 Choose a color for your dice roll embeds:',
                    ephemeral: true,
                    components: createColorButtons(interaction.id, 0) // initial set of buttons
                });
            }

            // Collector for button interactions
            const filter = (i: any) => i.customId.startsWith(`set_roll_color_${interaction.id}_`) && i.user.id === user.id;
            const collector = interaction.channel?.createMessageComponentCollector({
                filter,
                componentType: ComponentType.Button,
                time: 60000, // 60 seconds
            });

            collector?.on('collect', async i => {
                if (!i.isButton()) return;
                const action = i.customId.split('_')[4]; // page_0, page_1, or color index

                if (action.startsWith('page')) {
                    const page = parseInt(action.split('-')[1], 10);
                    await i.update({ components: createColorButtons(interaction.id, page) });
                    return;
                }

                const colorIndex = parseInt(action, 10);
                if (colorIndex >= 0 && colorIndex < PREDEFINED_COLORS.length) {
                    const selected = PREDEFINED_COLORS[colorIndex];
                    chosenColor = selected.value;
                    await setUserRollEmbedColor(interaction.guildId!, user.id, chosenColor);
                    await i.update({ // Update the original ephemeral message
                        content: `✅ Your dice roll embed color has been set to **${selected.name}** (\`${chosenColor.toString()}\`).`,
                        components: [], // Remove buttons
                    });
                    collector.stop('colorSet');
                } else {
                    await i.update({ content: 'Invalid selection. Please try again.', components: []});
                    collector.stop('error');
                }
            });

            collector?.on('end', (collected, reason) => {
                if (reason !== 'colorSet' && reason !== 'error') {
                    interaction.editReply({ content: '🎨 Color selection timed out. No changes made.', components: [] }).catch(() => {});
                }
            });

        } else if (subcommand === 'view') {
            const guildDiceExplode = getDiceExplodeSetting(interaction.guildId);
            const userRollColor = getUserRollEmbedColor(interaction.guildId, user.id);

            const settingsEmbed = new EmbedBuilder()
                .setColor(userRollColor || DEFAULT_USER_ROLL_EMBED_COLOR) // Use user's color or default
                .setTitle(`${interaction.guild?.name} Bot Settings`)
                .setDescription(`Showing settings for **${user.displayName}** on this server.`)
                .addFields(
                    { name: 'Server-Wide Settings', value: `Dice Explode: **${guildDiceExplode ? 'Enabled' : 'Disabled'}**` },
                    { name: 'Your Personal Settings', value: `Dice Roll Embed Color: \`${userRollColor.toString()}\`` }
                    // Add more settings as they are implemented
                );

            await interaction.reply({ embeds: [settingsEmbed], ephemeral: true });
        }
    },
};

// Helper function to create rows of color buttons with pagination
function createColorButtons(interactionId: string, page: number): ActionRowBuilder<ButtonBuilder>[] {
    const colorsPerPage = 4; // Max 5 buttons per row, keep one for pagination potentially
    const startIndex = page * colorsPerPage;
    const endIndex = startIndex + colorsPerPage;
    const currentColors = PREDEFINED_COLORS.slice(startIndex, endIndex);

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const colorButtonsRow = new ActionRowBuilder<ButtonBuilder>();

    currentColors.forEach((color, indexInPage) => {
        colorButtonsRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`set_roll_color_${interactionId}_${startIndex + indexInPage}`)
                .setLabel(color.name)
                .setStyle(ButtonStyle.Primary) // Could vary style based on color, but Primary is safe
        );
    });
    if (colorButtonsRow.components.length > 0) {
        rows.push(colorButtonsRow);
    }

    // Pagination buttons
    const paginationRow = new ActionRowBuilder<ButtonBuilder>();
    if (page > 0) {
        paginationRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`set_roll_color_${interactionId}_page-${page - 1}`)
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    if (endIndex < PREDEFINED_COLORS.length) {
        paginationRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`set_roll_color_${interactionId}_page-${page + 1}`)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    if (paginationRow.components.length > 0) {
        rows.push(paginationRow);
    }

    return rows;
}