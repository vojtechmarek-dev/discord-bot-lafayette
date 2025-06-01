import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import { Command, ExtendedClient } from '../../types';

export const stopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops the music, clears the queue, and leaves the voice channel.'),
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    if (!interaction.guildId) return;
    const queue = useQueue(interaction.guildId);

    if (!queue) {
      await interaction.reply({ content: '❌ Žádná hudba se nepřehrává k zastavení! Nemohu zastavit to, co neexistuje. Filozofie stranou, není co zastavit.', ephemeral: true });
      return;
    }

    queue.delete(); // Clears the queue and disconnects

    await interaction.reply({ content: '🛑 Hudba zastavena, fronta vymazána a opustil jsem hlasový kanál. Odcházím stejně tiše jako váš čas... Tik, ťak...' });
  },
};