import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { QueueRepeatMode, useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';

const MODE_VALUES = {
    off: QueueRepeatMode.OFF,
    track: QueueRepeatMode.TRACK,
    queue: QueueRepeatMode.QUEUE,
} as const;

type ModeKey = keyof typeof MODE_VALUES;

const MODE_REPLIES: Record<ModeKey, string> = {
    off: '🔁 Opakování **vypnuto**. Fronta doběhne a skončí, jako všechno ostatní.',
    track: '🔁 Opakuji **současnou skladbu**. Doufám, že ji máte opravdu rádi.',
    queue: '🔁 Opakuji **celou frontu**. Donekonečna. Nebo dokud vás to nepřestane bavit – což nastane dřív.',
};

export const loopCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Nastaví opakování přehrávání.')
        .addStringOption(option =>
            option.setName('režim')
                .setDescription('Co se má opakovat.')
                .addChoices(
                    { name: 'Vypnuto', value: 'off' },
                    { name: 'Skladba', value: 'track' },
                    { name: 'Fronta', value: 'queue' },
                )
                .setRequired(true)) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Tento příkaz lze použít pouze na serveru.', ephemeral: true });
            return;
        }

        const queue = useQueue(interaction.guildId);

        // isPlaying() is false while paused, so guard on actual queue contents.
        if (!queue || (!queue.currentTrack && queue.tracks.size === 0)) {
            await interaction.reply({
                content: '❌ Není co opakovat. Ticho se opakuje samo, bez mé pomoci.',
                ephemeral: true,
            });
            return;
        }

        const mode = interaction.options.getString('režim', true) as ModeKey;
        queue.setRepeatMode(MODE_VALUES[mode]);

        await interaction.reply({ content: MODE_REPLIES[mode] });
    },
};
