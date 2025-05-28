// src/commands/music/play.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, EmbedBuilder, ChannelType } from 'discord.js';
import { QueryType, useMainPlayer } from 'discord-player'; // Import from discord-player
import { Command, ExtendedClient, PlayerQueueMetadata } from '../../types'; // Use your PlayerQueueMetadata if defined

export const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song or playlist from YouTube, Spotify, etc.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song name or URL')
        .setRequired(true)) as SlashCommandBuilder,
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.reply({ content: 'You need to be in a voice channel to play music!', ephemeral: true });
      return;
    }

    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
        await interaction.reply({ content: 'I can only join server voice or stage channels!', ephemeral: true });
        return;
    }

    const player = useMainPlayer(); // Get the player instance
    if (!player) {
        await interaction.reply({ content: 'Music player is not available.', ephemeral: true});
        return;
    }

    const query = interaction.options.getString('query', true);
    
    if (!query) {
      await interaction.reply({ content: 'You must provide a song name or URL to play!', ephemeral: true });
      return;
    }

    // let's defer the interaction as things can take time to process
    await interaction.deferReply();

    try {
      //const searchResult = await player.search(query, {
      //  requestedBy: interaction.user,
      //  searchEngine: QueryType.AUTO
      //});
//
      //if (!searchResult || !searchResult.hasTracks()) {
      //  await interaction.editReply({ content: `❌ No tracks found for "${query}"!` });
      //  return;
      //}
//
      //// Metadata to pass to the queue - for sending messages from player events
      //const metadata: PlayerQueueMetadata = {
      //    channel: interaction.channel ?? undefined, // Store the channel where command was run
      //    interaction: interaction // Optionally store interaction for more complex scenarios
      //};

      // Play the track or add to queue
      // The `play` method handles joining the voice channel
      const { track } = await player.play(voiceChannel, query, {
        nodeOptions: { // Options for the GuildQueuePlayerNode
          metadata: interaction,
          //volume: 50, // Default volume (0-100)
          //leaveOnEmpty: true,
          //leaveOnEmptyCooldown: 30000, // 30 seconds
          //leaveOnEnd: true,
          //leaveOnEndCooldown: 30000, // 30 seconds
          //selfDeaf: false,
        },
      });
      await interaction.editReply({ content: `▶️ Playing **${track.cleanTitle}**!`});

      // discord-player's events ('playerStart', 'audioTrackAdd') will handle responses.
      // You might want to send a confirmation if it's a playlist.
      //if (searchResult.playlist) {
      //    await interaction.editReply({
      //        content: `🎶 Playlist **${searchResult.playlist.title}** (${searchResult.tracks.length} songs) added to the queue!`,
      //    });
      //} else if (searchResult.tracks.length > 0) {
      //    // If it's a single track and the queue was empty, 'playerStart' will fire.
      //    // If adding to an existing queue, 'audioTrackAdd' will fire.
      //    // So, a simple confirmation here might be good if not the first song.
      //    const queue = player.nodes.get(interaction.guildId);
      //    if (queue && queue.tracks.size > 0 && !queue.currentTrack) { // If tracks were added but not playing yet
      //      await interaction.editReply({ content: `🎵 **${searchResult.tracks[0].title}** added to the queue!`});
      //    } else if (queue && queue.currentTrack && searchResult.tracks[0].url !== queue.currentTrack.url) {
      //      // If something is playing and we added a new different song
      //      await interaction.editReply({ content: `🎵 **${searchResult.tracks[0].title}** added to the queue!`});
      //    } else if (queue && queue.currentTrack && searchResult.tracks[0].url === queue.currentTrack.url) {
      //      // First song, playerStart will handle message. Edit reply to acknowledge.
      //      await interaction.editReply({ content: `▶️ Playing **${searchResult.tracks[0].title}**!`});
      //    } else {
      //      // Fallback or if it's the very first song, playerStart will handle it.
      //      // To avoid "Thinking..." if playerStart is slightly delayed:
      //      await interaction.editReply({ content: `🔍 Processing your request for **${searchResult.tracks[0].title}**...` });
      //    }
      //}

    } catch (error: any) {
      console.error('Error in /play command:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Oops! Something went wrong: ${error.message}` }).catch(() => {});
      } else {
        await interaction.reply({ content: `❌ Oops! Something went wrong: ${error.message}`, ephemeral: true }).catch(() => {});
      }
    }
  },
};