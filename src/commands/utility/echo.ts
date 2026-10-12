import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    TextChannel,
    ChannelType,
  MessageFlags,
} from 'discord.js';
import { Command, ExtendedClient } from '../../types';
import { config } from '../../config';
import { strings } from '../../strings/cs'; 
//import { getTranslator } from '../../i18n'; // If you want to use i18n for error messages - todo next

export const echoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('echo')
        .setDescription('Odešle zprávu mým jménem. Pouze pro mého tvůrce.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Obsah zprávy.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Volitelný nadpis.')
                .setRequired(false)
        )
        .addChannelOption(option => // Optional: allow specifying a channel
            option.setName('channel')
                .setDescription('Kam zprávu odeslat. Výchozí je aktuální kanál.')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement) // Allow only text-based channels
                .setRequired(false)
        ) as SlashCommandBuilder, // Type assertion if needed

    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        //const t = getTranslator(interaction); // For potential localized error messages

        // 1. Owner Check — the "is it configured at all" branch must come FIRST,
        // otherwise an unset BOT_OWNER_ID makes every user (owner included) fail
        // the identity check below and the message here becomes unreachable.
        if (!config.BOT_OWNER_ID) {
            console.error("[EchoCommand] BOT_OWNER_ID is not configured. Cannot verify owner.");
            await interaction.reply({
                content: strings.echo.ownerUnset,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (interaction.user.id !== config.BOT_OWNER_ID) {
            await interaction.reply({
                content: strings.echo.notOwner,
                flags: MessageFlags.Ephemeral,
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
                    content: strings.echo.invalidChannelType,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
        }

        if (!targetChannel || !(targetChannel instanceof TextChannel)) {
             // This check helps if interaction.channel itself isn't a TextChannel (e.g. if command somehow runs in a voice channel's text chat directly)
            await interaction.reply({
                content: strings.echo.noTargetChannel,
                flags: MessageFlags.Ephemeral,
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
                content: strings.echo.sent(targetChannel.toString()),
                flags: MessageFlags.Ephemeral, // Acknowledge the command privately
            });

        } catch (error: any) {
            console.error(`Error in /echo command by owner ${interaction.user.id}:`, error);
            await interaction.reply({
                content: strings.echo.failed(error.message),
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

function normalizeNewlines(input: string) {
  if (typeof input !== 'string') return '';

  // Replace literal escaped newlines (\\n) with real newlines
  return input.replace(/\\n/g, '\n');
}