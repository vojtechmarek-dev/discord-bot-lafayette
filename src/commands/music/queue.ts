import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';

export const queueCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Displays the current music queue.'),
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    if (!interaction.guildId) return;
    const queue = useQueue(interaction.guildId);

    if (!queue || (!queue.isPlaying() && queue.tracks.size === 0)) {
      await interaction.reply({ content: '❌ The queue is empty and nothing is playing!', ephemeral: true });
      return;
    }

    const currentTrack = queue.currentTrack;
    const tracks = queue.tracks.toArray(); // Upcoming tracks

    let description = '';
    if (currentTrack) {
        description += `**Now Playing:**\n[${currentTrack.title}](${currentTrack.url}) - ${currentTrack.duration} | Requested by ${currentTrack.requestedBy?.tag}\n\n`;
    }

    if (tracks.length > 0) {
        description += '**Up Next:**\n';
        tracks.slice(0, 10).forEach((track, index) => { // Display up to 10 tracks
            description += `${index + 1}. [${track.title}](${track.url}) - ${track.duration} | Req by ${track.requestedBy?.tag}\n`;
        });
        if (tracks.length > 10) {
            description += `\n...and ${tracks.length - 10} more song(s).`;
        }
    } else if (!currentTrack) {
        description = "The queue is empty!";
    }


    const queueEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎶 Music Queue')
        .setDescription(description || "No songs in queue.")
        .setTimestamp();

    await interaction.reply({ embeds: [queueEmbed] });
  },
};