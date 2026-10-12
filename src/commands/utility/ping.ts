import { SlashCommandBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { Command } from '../../types';

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Ověří, že žiji, a změří odezvu.'),
  async execute(interaction: ChatInputCommandInteraction, client: Client) {
    await interaction.reply({ content: 'Měřím...' });
    const sent = await interaction.fetchReply();
    await interaction.editReply(`Pong! 🏓
Odezva: ${sent.createdTimestamp - interaction.createdTimestamp} ms
Tep WebSocketu: ${client.ws.ping} ms`);
  },
};