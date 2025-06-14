// src/commands/music/play.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, EmbedBuilder, ChannelType, VoiceBasedChannel } from 'discord.js';
import { QueryResolver, QueryType, useMainPlayer } from 'discord-player'; // Import from discord-player
import { Command, ExtendedClient, PlayerQueueMetadata } from '../../types'; // Use your PlayerQueueMetadata if defined

async function prePlayValidation(
    interaction: ChatInputCommandInteraction
): Promise<{ member: GuildMember; voiceChannel: VoiceBasedChannel; player: ReturnType<typeof useMainPlayer> } | null> {
    if (!interaction.guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return null;
    }

    const member = interaction.member as GuildMember; // Already in a guild, so member should exist
    if (!member) { // Should technically not happen if guildId is present and it's a guild command
        await interaction.reply({ content: 'Could not identify you as a member of this server.', ephemeral: true });
        return null;
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
        await interaction.reply({ content: 'You need to be in a voice channel to play music!', ephemeral: true });
        return null;
    }

    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
        await interaction.reply({ content: 'I can only join server voice or stage channels!', ephemeral: true });
        return null;
    }

    const player = useMainPlayer();
    if (!player) {
        await interaction.reply({ content: 'Music player is not available at the moment. Please try again later.', ephemeral: true });
        return null;
    }

    return { member, voiceChannel, player };
}

export const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Přehraje skladbu nebo playlist z YouTube, Spotify, Soundcloud')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Název nebo přímý URL odkaz')
        .setRequired(true)) as SlashCommandBuilder,
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {

    const validationResult = await prePlayValidation(interaction);
    if (!validationResult) {
      return;
    }

    const { voiceChannel, player } = validationResult;

    const query = interaction.options.getString('query', true);
    
    if (!query) {
      await interaction.reply({ content: 'Musíte zadat název skladby nebo URL k přehrání! Přídavný balíček "čtení myšlenek" nebyl bohužel nainstalován.', ephemeral: true });
      return;
    }

    // let's defer the interaction as things can take time to process
    await interaction.deferReply();

    try {

        const searchResult = await player.search(query, {
            requestedBy: interaction.user,
            searchEngine: QueryType.AUTO, 
        });

        if (!searchResult || !searchResult.hasTracks()) {
          await interaction.editReply({ content: `❌ Výsledky vyhledávání: nula. Buď "${query}" neexistuje, nebo přehrávač chrání vaše uši. Podezřívám to druhé.` });
          return;
        }

        // Metadata to pass to the queue - for sending messages from player events
        const metadata: PlayerQueueMetadata = {
            channel: interaction.channel ?? undefined, // Store the channel where command was run
            interaction: interaction // Optionally store interaction for more complex scenarios
        };

      // Play the track or add to queue
      // The `play` method handles joining the voice channel
      const { track } = await player.play(voiceChannel, searchResult, {
        nodeOptions: {
          metadata: interaction,
          volume: 50, 
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 30000, // 30 seconds
          leaveOnEnd: true,
          leaveOnEndCooldown: 30000, // 30 seconds
          selfDeaf: true,
        },
      });
      await interaction.editReply({ content: `▶️ Přehrávám **${track.cleanTitle}**!.`});

      // discord-player's events ('playerStart', 'audioTrackAdd') will handle responses.
      // You might want to send a confirmation if it's a playlist.
      if (searchResult.playlist) {
          await interaction.editReply({
              content: `🎶 Playlist? Váš vkus bude nyní veřejný. Spuštěno. **${searchResult.playlist.title}** zařazen s ${searchResult.tracks.length} skladbami.`,
          });
      } else if (searchResult.tracks.length > 0) {
          // If it's a single track and the queue was empty, 'playerStart' will fire.
          // If adding to an existing queue, 'audioTrackAdd' will fire.
          // So, a simple confirmation here might be good if not the first song.
          const queue = player.nodes.get(interaction.guildId!);
          if (queue && queue.tracks.size > 0 && !queue.currentTrack) { // If tracks were added but not playing yet
            await interaction.editReply({ content: `🎵 **${searchResult.tracks[0].title}** přidána do fronty!`});
          } else if (queue && queue.currentTrack && searchResult.tracks[0].url !== queue.currentTrack.url) {
            // If something is playing and we added a new different song
            await interaction.editReply({ content: `🎵 **${searchResult.tracks[0].title}** přidána do fronty!`});
          } else if (queue && queue.currentTrack && searchResult.tracks[0].url === queue.currentTrack.url) {
            // First song, playerStart will handle message. Edit reply to acknowledge.
            await interaction.editReply({ content: `▶️ Přehrávám **${searchResult.tracks[0].title}**!`});
          } else {
            // Fallback or if it's the very first song, playerStart will handle it.
            // To avoid "Thinking..." if playerStart is slightly delayed:
            await interaction.editReply({ content: ` Analyzuji zvukový požadavek na **${searchResult.tracks[0].title}**... Můj výpočetní výkon je obrovský, přesto to nějakým způsobem trvá.` });
          }
      }

    } catch (error: any) {
      console.error('Error in /play command:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Ups! Něco se pokazilo: ${error.message}. Nastala chyba. Možná vaše chyba. Ale řekněme, že systémová chyba.` }).catch(() => {});
      } else {
        await interaction.reply({ content: `❌ Neočekávaná porucha: ${error.message}. Lafayette je zmaten. To se stává přibližně jednou za věčnost.`, ephemeral: true }).catch(() => {});
      }
    }
  },
};


export const playFileCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('playfile')
        .setDescription('Plays an attached MP3 file.')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('The MP3 file to play.')
                .setRequired(true)
        ) as SlashCommandBuilder,
    async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
        const validationResult = await prePlayValidation(interaction);
        if (!validationResult) {
          return;
        }

        const { voiceChannel, player } = validationResult;
        const attachmentInput = interaction.options.getAttachment('file', true);

        await interaction.deferReply();

        try {

            console.log(`[PlayCmd] Attachment received: ${attachmentInput.name}, type: ${attachmentInput.contentType}, URL: ${attachmentInput.url}`);
            if (!(attachmentInput.contentType === 'audio/mpeg' || attachmentInput.name.toLowerCase().endsWith('.mp3'))) {
                await interaction.reply({ content: '❌ The attached file is not an MP3. Please upload an MP3 file.', ephemeral: true });
                return;
            }

            const searchResult = await player.search(attachmentInput.url, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO
            });

            if (!searchResult || !searchResult.hasTracks()) {
                await interaction.editReply({ content: `❌ Could not process the attached file: ${attachmentInput.name}.` });
                return;
            }

            const metadata: PlayerQueueMetadata = {
                channel: interaction.channel ?? undefined,
                interaction: interaction,
            };

            const {track} = await player.play(voiceChannel, searchResult, {
                nodeOptions: { 
                  metadata: interaction, 
                  volume: 50, 
                  leaveOnEmpty: true, 
                  leaveOnEmptyCooldown: 300000, 
                  leaveOnEnd: true, 
                  leaveOnEndCooldown: 
                  300000, 
                  selfDeaf: true
                },
            });

            let replyMessage = `🔍 Processing your request...`;
            const queue = player.nodes.get(interaction.guildId!); // guildId is checked in prePlayValidation
            if (queue && queue.currentTrack) {
                replyMessage = `🎵 **${track.cleanTitle}** added to the queue!`;
            } else {
                replyMessage = `▶️ Playing **${track.cleanTitle}**!`;
            }
            await interaction.editReply({ content: replyMessage });

        } catch (error: any) {
            console.error(`Error in /playfile command (attachment: ${attachmentInput.name}):`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: `❌ Oops! Something went wrong while playing the file: ${error.message}` }).catch(() => {});
            } else {
                await interaction.reply({ content: `❌ Oops! Something went wrong while playing the file: ${error.message}`, ephemeral: true }).catch(() => {});
            }
        }
    },
};