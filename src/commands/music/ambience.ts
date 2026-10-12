import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    GuildMember,
    ChannelType,
} from 'discord.js';
import { QueryType, QueueRepeatMode, useMainPlayer, useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';
import {
    findAmbiencePreset,
    listAmbiencePresets,
    suggestAmbiencePresets,
    ambienceDir,
} from '../../utils/helpers/ambience';
import {
    AMBIENCE_VOLUME,
    buildNodeOptions,
    getAmbienceState,
    refreshQueueMetadata,
    type QueueContext,
} from '../../utils/helpers/queueFactory';
import { DEFAULT_EMBED_COLOR } from '../../utils/colorUtils';

export const ambienceCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('ambience')
        .setDescription('Zvukové kulisy ze souborů na serveru. Atmosféru si musíte odehrát sám/sama.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Spustí kulisu ve smyčce.')
                .addStringOption(option =>
                    option.setName('scéna')
                        .setDescription('Která kulisa. Nabídku doplním sám.')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Zastaví kulisy a opustí kanál.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Vypíše dostupné kulisy.')),

    async autocomplete(interaction: AutocompleteInteraction, _client: ExtendedClient) {
        const focused = interaction.options.getFocused();
        const suggestions = suggestAmbiencePresets(focused, listAmbiencePresets());

        await interaction.respond(
            suggestions.map(preset => ({ name: preset.label, value: preset.slug })),
        );
    },

    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Tento příkaz lze použít pouze na serveru.', ephemeral: true });
            return;
        }

        switch (interaction.options.getSubcommand()) {
            case 'list':
                return handleList(interaction);
            case 'stop':
                return handleStop(interaction);
            default:
                return handlePlay(interaction);
        }
    },
};

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
    const presets = listAmbiencePresets();

    if (presets.length === 0) {
        await interaction.reply({ content: emptyLibraryMessage(), ephemeral: true });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle('🔊 Dostupné kulisy')
        .setDescription(presets.map(preset => `• **${preset.label}** — \`${preset.slug}\``).join('\n'))
        .setFooter({ text: 'Soubory přidává správce do data/ambience. Restart nepotřebuji.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
    const queue = useQueue(interaction.guildId!);
    const ambience = getAmbienceState(queue);

    if (!queue || queue.deleted || !ambience) {
        await interaction.reply({
            content: '❌ Žádné kulisy neběží. Ticho, které slyšíte, je původní.',
            ephemeral: true,
        });
        return;
    }

    queue.setRepeatMode(QueueRepeatMode.OFF);
    queue.delete();

    await interaction.reply({ content: `🔇 Kulisy **${ambience.label}** ukončeny. Vracím vám ticho.` });
}

async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.member as GuildMember | null;
    const voiceChannel = member?.voice?.channel ?? null;

    if (!voiceChannel) {
        await interaction.reply({
            content: 'Musíte být v hlasovém kanálu. Nemohu vytvářet atmosféru v prázdném prostoru.',
            ephemeral: true,
        });
        return;
    }

    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
        await interaction.reply({ content: 'Umím se připojit jen do hlasového nebo stage kanálu.', ephemeral: true });
        return;
    }

    const presets = listAmbiencePresets();
    if (presets.length === 0) {
        await interaction.reply({ content: emptyLibraryMessage(), ephemeral: true });
        return;
    }

    const requested = interaction.options.getString('scéna', true);
    const preset = findAmbiencePreset(requested, presets);

    if (!preset) {
        await interaction.reply({
            content:
                `❌ Kulisu "${requested}" neznám. K dispozici mám: ` +
                presets.map(entry => `\`${entry.slug}\``).join(', ') + '.',
            ephemeral: true,
        });
        return;
    }

    const existingQueue = useQueue(interaction.guildId!);
    const existingAmbience = getAmbienceState(existingQueue);

    /**
     * One GuildQueue and one voice connection per guild, so ambience underneath
     * a song is not possible without a second bot account or a mixing filter
     * graph. Refusing outright is honest; quietly stopping the music would not be.
     */
    if (existingQueue && !existingQueue.deleted && existingQueue.currentTrack && !existingAmbience) {
        await interaction.reply({
            content: '❌ Právě hraje hudba. Kulisy a hudba se o jediný hlasový kanál dělit nedokážou. Vyberte si. Jako dospělí.',
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply();

    try {
        const player = useMainPlayer();

        // QueryType.FILE is explicit on purpose: AttachmentExtractor's validate()
        // only accepts ARBITRARY and FILE, so leaving it to AUTO would depend on
        // how QueryResolver happens to classify a local path.
        const searchResult = await player.search(preset.absolutePath, {
            requestedBy: interaction.user,
            searchEngine: QueryType.FILE,
        });

        if (!searchResult || !searchResult.hasTracks()) {
            await interaction.editReply({
                content: `❌ Soubor pro **${preset.label}** se nepodařilo načíst. Existuje, ale za zvuk se nevydává přesvědčivě.`,
            });
            return;
        }

        const context: QueueContext = {
            channel: interaction.channel ?? undefined,
            interaction,
            ambience: { slug: preset.slug, label: preset.label },
        };

        const { queue } = await player.play(voiceChannel, searchResult, {
            nodeOptions: buildNodeOptions(context, AMBIENCE_VOLUME),
        });

        // An existing queue keeps its original options, so mark it explicitly.
        refreshQueueMetadata(queue, context);
        queue.setRepeatMode(QueueRepeatMode.TRACK);
        queue.node.setVolume(AMBIENCE_VOLUME);

        await interaction.editReply({
            content: `🔊 Kulisy: **${preset.label}**. Smyčka běží, dokud neřeknete \`/ambience stop\`.`,
        });
    } catch (error: any) {
        console.error(`Error in /ambience play (${preset.slug}):`, error);
        const message = `❌ Kulisy se nepodařilo spustit: ${error.message}`;
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: message }).catch(() => {});
        } else {
            await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
        }
    }
}

function emptyLibraryMessage(): string {
    return (
        'Nemám žádné kulisy. Správce je přidává jako zvukové soubory do `' +
        ambienceDir() +
        '`. Bez nich jsem pouze velmi drahé ticho.'
    );
}
