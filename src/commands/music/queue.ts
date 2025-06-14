import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';

export const queueCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Zobrazí aktuální hudební frontu.'),
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    if (!interaction.guildId) return;
    const queue = useQueue(interaction.guildId);

    if (!queue || (!queue.isPlaying() && queue.tracks.size === 0)) {
      await interaction.reply({ content: '❌ Fronta je prázdná a nic se nepřehrává!', ephemeral: true });
      return;
    }

    const currentTrack = queue.currentTrack;
    const tracks = queue.tracks.toArray(); // Upcoming tracks

    let description = '';
    if (currentTrack) {
        description += `**Nyní hraje:**\n[${currentTrack.title}](${currentTrack.url}) - ${currentTrack.duration} | Požadavek od ${currentTrack.requestedBy?.tag}\n\n`;
    }

    if (tracks.length > 0) {
        description += '**Dále:**\n';
        tracks.slice(0, 10).forEach((track, index) => { // Display up to 10 tracks
            description += `${index + 1}. [${track.title}](${track.url}) - ${track.duration} | Req by ${track.requestedBy?.tag}\n`;
        });
        if (tracks.length > 10) {
            description += `\n...a ${tracks.length - 10} dalších skladeb.`;
        }
    } else if (!currentTrack) {
        description = "Fronta je prázdná!";
    }


    const queueEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎶 Fronta')
        .setDescription(description || "No songs in queue.")
        .setTimestamp();

    await interaction.reply({ embeds: [queueEmbed] });
  },
};