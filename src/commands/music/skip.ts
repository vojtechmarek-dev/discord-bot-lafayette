import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';

export const skipCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skips the current song.'),
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    if (!interaction.guildId) return;
    const queue = useQueue(interaction.guildId);

    if (!queue || !queue.isPlaying()) {
      await interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
      return;
    }

    if (queue.tracks.size === 0 && !queue.currentTrack) {
        await interaction.reply({ content: '❌ Nothing to skip (queue is empty after current song)!', ephemeral: true });
        return;
    }

    const track = queue.currentTrack;
    queue.node.skip(); // Skips the current song

    await interaction.reply({ content: `⏭️ Skipped **${track?.title || 'the current song'}**!` });
  },
};