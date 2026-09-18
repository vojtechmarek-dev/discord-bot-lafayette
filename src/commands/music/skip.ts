import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';

export const skipCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Přeskočí přehrávanou skladbu.'),
  async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
    if (!interaction.guildId) return;
    const queue = useQueue(interaction.guildId);

    // isPlaying() is false while paused, so guard on actual queue contents instead.
    if (!queue || (!queue.currentTrack && queue.tracks.size === 0)) {
      await interaction.reply({ content: '❌ Nic se nepřehrává! Dosáhli jste konce své hudební cesty. Jak... antiklimatické.', ephemeral: true });
      return;
    }

    const track = queue.currentTrack;
    queue.node.skip(); // Skips the current song

    await interaction.reply({ content: `⏭️ **${track?.title || 'Současná zvuková sekvence'}** ukončena. Některé skladby si nezaslouží klidný konec. Toto byla jedna z nich.` });
  },
};