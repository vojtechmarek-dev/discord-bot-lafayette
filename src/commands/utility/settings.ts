import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ColorResolvable,
  MessageFlags,
} from 'discord.js';
import { Command, ExtendedClient } from '../../types';
import {
    getHighlightCritsSetting,
    setHighlightCritsSetting,
    getMusicSearchSource,
    setMusicSearchSource,
    getUserRollEmbedColor,
    setUserRollEmbedColor,
} from '../../guildSettingsManager';
import { parseColorString, PREDEFINED_COLORS, DEFAULT_EMBED_COLOR } from '../../utils/colorUtils';
import type { SearchableSource } from '../../utils/helpers/queryRouter';
import { strings } from '../../strings/cs';

const SOURCE_LABELS: Record<SearchableSource, string> = {
    soundcloud: 'SoundCloud',
    youtube: 'YouTube',
};

export const settingsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Nastavení serveru a tvoje osobní nastavení.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('guild')
                .setDescription('Nastavení pro celý server. Vyžaduje oprávnění Spravovat server.')
                // Both optional: setting one should not force you to restate the
                // other. With neither given, the current values are shown.
                .addBooleanOption(option =>
                    option.setName('highlight_crits')
                        .setDescription('Zvýrazňovat kritické úspěchy a selhání ve výsledcích hodů.')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('music_search_source')
                        .setDescription('Kde hledat hudbu, když v /play nezadáte odkaz.')
                        .addChoices(
                            { name: 'SoundCloud (recommended)', value: 'soundcloud' },
                            { name: 'YouTube', value: 'youtube' },
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('me')
                .setDescription('Tvoje osobní nastavení na tomto serveru.')
                .addStringOption(option =>
                    option.setName('roll_color')
                        .setDescription('Barva tvých hodů (např. #FF0000, Red, nebo nechte prázdné pro nabídku).')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Zobrazí aktuální nastavení serveru i tvoje osobní.')
        ),

    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: strings.common.guildOnly, flags: MessageFlags.Ephemeral });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const user = interaction.user;

        if (subcommand === 'guild') {

            // Ensure user has ManageGuild permission for this subcommand specifically
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                await interaction.reply({
                    content: strings.settings.needManageGuild,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const highlightCrits = interaction.options.getBoolean('highlight_crits');
            const searchSource = interaction.options.getString('music_search_source') as SearchableSource | null;
            const changes: string[] = [];

            if (highlightCrits !== null) {
                await setHighlightCritsSetting(interaction.guildId, highlightCrits);
                changes.push(highlightCrits
                    ? '🎲 Zvýrazňování kritických hodů **zapnuto**. Nyní uvidíš přesně, kdy ti kostky kriticky přejí (nebude to často).'
                    : '🎲 Zvýrazňování kritických hodů **vypnuto**. Tvoje kritické úspěchy zůstanou diskrétní. Prozatím.');
            }

            if (searchSource !== null) {
                await setMusicSearchSource(interaction.guildId, searchSource);
                changes.push(`🎵 Vyhledávání hudby nyní míří na **${SOURCE_LABELS[searchSource]}**.`);
            }

            if (changes.length === 0) {
                changes.push(
                    '⚙️ Nezměnil jsem nic, protože jsi nic nezadal/a. Aktuálně: zvýrazňování kritických hodů ' +
                    `**${getHighlightCritsSetting(interaction.guildId) ? 'zapnuto' : 'vypnuto'}**, ` +
                    `vyhledávání hudby **${SOURCE_LABELS[getMusicSearchSource(interaction.guildId)]}**.`,
                );
            }

            await interaction.reply({ content: changes.join('\n'), flags: MessageFlags.Ephemeral });
        } else if (subcommand === 'me') {
            const colorInput = interaction.options.getString('roll_color');
            let chosenColor: ColorResolvable | null = null;

            if (colorInput) {
                chosenColor = parseColorString(colorInput);
                if (chosenColor) {
                    await setUserRollEmbedColor(interaction.guildId, user.id, chosenColor);
                    await interaction.reply({
                        content: strings.settings.colorSet(chosenColor.toString()),
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                } else {
                    // Color input provided but not parseable, proceed to offer predefined
                    await interaction.reply({
                        content: strings.settings.colorUnparsed(colorInput),
                        flags: MessageFlags.Ephemeral,
                        components: createColorButtons(interaction.id, 0) // initial set of buttons
                    });
                }
            } else {
                // No color input, directly offer predefined choices
                await interaction.reply({
                    content: strings.settings.colorPrompt,
                    flags: MessageFlags.Ephemeral,
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
                        content: strings.settings.colorSetNamed(selected.name, chosenColor.toString()),
                        components: [], // Remove buttons
                    });
                    collector.stop('colorSet');
                } else {
                    await i.update({ content: strings.settings.colorInvalidChoice, components: []});
                    collector.stop('error');
                }
            });

            collector?.on('end', (collected, reason) => {
                if (reason !== 'colorSet' && reason !== 'error') {
                    interaction.editReply({ content: strings.settings.colorTimedOut, components: [] }).catch(() => {});
                }
            });

        } else if (subcommand === 'view') {
            const guildHighlightCrits = getHighlightCritsSetting(interaction.guildId);
            const userRollColor = getUserRollEmbedColor(interaction.guildId, user.id);

            const settingsEmbed = new EmbedBuilder()
                .setColor(userRollColor || DEFAULT_EMBED_COLOR) // Use user's color or default
                .setTitle(`${interaction.guild?.name} Bot Settings`)
                .setDescription(`Showing settings for **${user.displayName}** on this server.`)
                .addFields(
                    {
                        name: 'Server-Wide Settings',
                        value:
                            `Crit Highlighting: **${guildHighlightCrits ? 'Enabled' : 'Disabled'}**\n` +
                            `Music Search Source: **${SOURCE_LABELS[getMusicSearchSource(interaction.guildId)]}**`,
                    },
                    { name: 'Your Personal Settings', value: `Dice Roll Embed Color: \`${userRollColor.toString()}\`` }
                    // Add more settings as they are implemented
                );

            await interaction.reply({ embeds: [settingsEmbed], flags: MessageFlags.Ephemeral });
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