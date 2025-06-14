// src/commands/music/play.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, EmbedBuilder, ChannelType } from 'discord.js';
import { QueryResolver, QueryType, SearchResult, useMainPlayer } from 'discord-player'; // Import from discord-player
import { Command, ExtendedClient, PlayerQueueMetadata } from '../../types'; // Use your PlayerQueueMetadata if defined

export const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Přehraje skladbu nebo playlist z YouTube, Spotify, Soundcloud')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Název nebo přímý URL odkaz')
        .setRequired(true))
      .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('An MP3 file to play.')
                .setRequired(false)
      ) as SlashCommandBuilder,
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.reply({ content: 'Hlasový kanál vyžadován pro přenos zvuku. Umím toho hodně, ale ne *až tak* hodně.', ephemeral: true });
      return;
    }

    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
        await interaction.reply({ content: 'Typ kanálu: nepodporovaný. Vyžaduji správné hlasové kanály, ne jakoukoliv digitální říši, do které jste zabloudili.', ephemeral: true });
        return;
    }

    const player = useMainPlayer(); // Get the player instance
    if (!player) {
        await interaction.reply({ content: 'Music player is not available.', ephemeral: true});
        return;
    }

    const query = interaction.options.getString('query', true);
    const attachmentInput = interaction.options.getAttachment('file'); 
    
    if (!query) {
      await interaction.reply({ content: 'Musíte zadat název skladby nebo URL k přehrání! Přídavný balíček "čtení myšlenek" nebyl bohužel nainstalován.', ephemeral: true });
      return;
    }

    // let's defer the interaction as things can take time to process
    await interaction.deferReply();

    // Will hold the result from player.search or a manually created track
    let searchResult: SearchResult; 

    try {
      if (attachmentInput) {
                // Prioritize attachment if provided
                console.log(`[PlayCmd] Attachment received: ${attachmentInput.name}, type: ${attachmentInput.contentType}, URL: ${attachmentInput.url}`);
                if (attachmentInput.contentType === 'audio/mpeg' || attachmentInput.name.toLowerCase().endsWith('.mp3')) {
                    // discord-player's search can take a URL directly.
                    // The attachment.url is a Discord CDN URL that discord-player should be able to handle.
                    searchResult = await player.search(attachmentInput.url, {
                        requestedBy: interaction.user,
                        // searchEngine: QueryType.AUTO // Let discord-player try to figure it out
                                                      // Or you might need to specify a direct file/http extractor if default doesn't pick it up
                                                      // Often QueryType.FILE or let it auto-detect.
                    });

                    if (!searchResult || !searchResult.hasTracks()) {
                         await interaction.editReply({ content: `❌ Could not process the attached file: ${attachmentInput.name}. It might not be a valid MP3 or streamable.` });
                         return;
                    }
                    // Optional: You could create a more descriptive track title if needed
                    // searchResult.tracks[0].title = attachmentInput.name; // discord-player might do this already
                    // searchResult.tracks[0].author = "Uploaded File";

                } else {
                    await interaction.editReply({ content: '❌ The attached file is not an MP3. Please upload an MP3 file.', ephemeral: true });
                    return;
                }
        } else if (query) {

        searchResult = await player.search(query, {
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
        nodeOptions: { // Options for the GuildQueuePlayerNode
          metadata: interaction,
          volume: 50, // Default volume (0-100)
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 30000, // 30 seconds
          leaveOnEnd: true,
          leaveOnEndCooldown: 30000, // 30 seconds
          selfDeaf: false,
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
          const queue = player.nodes.get(interaction.guildId);
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
        } else {
            await interaction.editReply({ content: 'Please provide a search query, a URL, or attach an MP3 file.', ephemeral: true });
            return;
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