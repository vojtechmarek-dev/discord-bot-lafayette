import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    TextChannel,
    ChannelType,
} from 'discord.js';
import { Command, ExtendedClient } from '../../types';
import { config } from '../../config'; 
//import { getTranslator } from '../../i18n'; // If you want to use i18n for error messages - todo next

export const echoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('echo')
        .setDescription('Sends a message as the bot (Owner only).')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message content to send.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Optional title for the embed.')
                .setRequired(false)
        )
        .addChannelOption(option => // Optional: allow specifying a channel
            option.setName('channel')
                .setDescription('The channel to send the message to (defaults to current channel).')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement) // Allow only text-based channels
                .setRequired(false)
        ) as SlashCommandBuilder, // Type assertion if needed

    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        //const t = getTranslator(interaction); // For potential localized error messages

        // 1. Owner Check
        if (interaction.user.id !== config.BOT_OWNER_ID) {
            await interaction.reply({
                content: "Oprávnění odepřeno. Nejste má matka. Ani můj kodér.",
                ephemeral: true,
            });
            return;
        }

        if (!config.BOT_OWNER_ID) { // Defensive check if owner ID wasn't set up
            console.error("[EchoCommand] BOT_OWNER_ID is not configured. Cannot verify owner.");
            await interaction.reply({
                content: "Bez jasné identifikace mého tvůrce nemohu tento příkaz provést. Zavádím dočasný režim `Syn bez otce`.",
                ephemeral: true,
            });
            return;
        }

        const rawMessage = interaction.options.getString('message', true);
        
        const messageContent = normalizeNewlines(rawMessage);
        const embedTitle = interaction.options.getString('title');
        const targetChannelOption = interaction.options.getChannel('channel');

        let targetChannel = interaction.channel;

        if (targetChannelOption) {
            if (targetChannelOption.type === ChannelType.GuildText || targetChannelOption.type === ChannelType.GuildAnnouncement) {
                targetChannel = targetChannelOption as TextChannel; // Type assertion after check
            } else {
                await interaction.reply({
                    content: "⚠️ Invalid channel type. Please select a text or announcement channel.",
                    ephemeral: true,
                });
                return;
            }
        }

        if (!targetChannel || !(targetChannel instanceof TextChannel)) {
             // This check helps if interaction.channel itself isn't a TextChannel (e.g. if command somehow runs in a voice channel's text chat directly)
            await interaction.reply({
                content: "⚠️ Cannot determine a valid text channel to send the message to.",
                ephemeral: true,
            });
            return;
        }


        try {
            const echoEmbed = new EmbedBuilder()
                .setColor('#B6713F') // You can make this configurable later
                .setDescription(messageContent);

            if (embedTitle) {
                echoEmbed.setTitle(embedTitle);
            }

            await targetChannel.send({ embeds: [echoEmbed] });

            await interaction.reply({
                content: `✅ Message sent to ${targetChannel.toString()}.`,
                ephemeral: true, // Acknowledge the command privately
            });

        } catch (error: any) {
            console.error(`Error in /echo command by owner ${interaction.user.id}:`, error);
            await interaction.reply({
                content: `❌ An error occurred while trying to send the message: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};

function normalizeNewlines(input: string) {
  if (typeof input !== 'string') return '';

  // Replace literal escaped newlines (\\n) with real newlines
  return input.replace(/\\n/g, '\n');
}