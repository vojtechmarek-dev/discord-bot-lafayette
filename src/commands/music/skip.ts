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
      await interaction.reply({ content: '❌ Nic se nepřehrává!', ephemeral: true });
      return;
    }

    if (queue.tracks.size === 0 && !queue.currentTrack) {
        await interaction.reply({ content: '❌ Není co přeskočit (fronta je prázdná po současné skladbě)! Dosáhli jste konce své hudební cesty. Jak... antiklimatické.', ephemeral: true });
        return;
    }

    const track = queue.currentTrack;
    queue.node.skip(); // Skips the current song

    await interaction.reply({ content: `⏭️ **${track?.title || 'Současná zvuková sekvence'}** ukončena. Některé skladby si nezaslouží klidný konec. Toto byla jedna z nich.` });
  },
};