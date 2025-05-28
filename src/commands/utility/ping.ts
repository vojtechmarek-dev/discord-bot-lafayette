import { SlashCommandBuilder, ChatInputCommandInteraction, Client } from 'discord.js';
import { Command } from '../../types';

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong! Checks bot latency.'),
  async execute(interaction: ChatInputCommandInteraction, client: Client) {
    await interaction.reply({ content: 'Pinging...' });
    const sent = await interaction.fetchReply();
    await interaction.editReply(`Pong! 🏓\nRoundtrip latency: ${sent.createdTimestamp - interaction.createdTimestamp}ms\nWebSocket heartbeat: ${client.ws.ping}ms`);
  },
};