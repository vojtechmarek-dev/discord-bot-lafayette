// src/commands/music/play.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, ChannelType, VoiceBasedChannel } from 'discord.js';
import { QueryType, useMainPlayer } from 'discord-player'; // Import from discord-player
import { Command, ExtendedClient } from '../../types';
import { routeQuery, type SearchableSource } from '../../utils/helpers/queryRouter';
import { buildNodeOptions, refreshQueueMetadata, type QueueContext } from '../../utils/helpers/queueFactory';
import { getMusicSearchSource } from '../../guildSettingsManager';

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
    .setDescription('Přehraje skladbu nebo playlist. Odkaz z YouTube, Spotify či SoundCloudu, nebo název k vyhledání.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Název nebo přímý URL odkaz')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('source')
        .setDescription('Kde hledat, pokud nezadáte odkaz. Výchozí: nastavení serveru.')
        .addChoices(
          { name: 'SoundCloud', value: 'soundcloud' },
          { name: 'YouTube', value: 'youtube' },
        )
        .setRequired(false)) as SlashCommandBuilder,
  async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {

    const validationResult = await prePlayValidation(interaction);
    if (!validationResult) {
      return;
    }

    const { voiceChannel, player } = validationResult;

    const rawQuery = interaction.options.getString('query', true);

    if (!rawQuery.trim()) {
      await interaction.reply({ content: 'Musíte zadat název skladby nebo URL k přehrání! Přídavný balíček "čtení myšlenek" nebyl bohužel nainstalován.', ephemeral: true });
      return;
    }

    // Bind the query to a source explicitly. Without this, plain text goes to
    // whichever greedy extractor sorted first, and never to YouTube - whose
    // validate() rejects non-URL queries outright.
    const requestedSource = interaction.options.getString('source') as SearchableSource | null;
    const routed = routeQuery(rawQuery, {
      defaultSearchSource: requestedSource ?? getMusicSearchSource(interaction.guildId!),
    });

    console.log(
      `[PlayCmd] Routed "${rawQuery}" -> "${routed.query}" ` +
      `(source=${routed.source}, search=${routed.isSearch}, userPrefixed=${routed.userPrefixed})`,
    );

    // let's defer the interaction as things can take time to process
    await interaction.deferReply();

    try {
        const searchResult = await player.search(routed.query, {
            requestedBy: interaction.user,
            searchEngine: QueryType.AUTO,
        });

        if (!searchResult || !searchResult.hasTracks()) {
          await interaction.editReply({ content: `❌ Výsledky vyhledávání: nula. Buď "${rawQuery}" neexistuje, nebo přehrávač chrání vaše uši. Podezřívám to druhé.` });
          return;
        }

        const context: QueueContext = {
            channel: interaction.channel ?? undefined,
            interaction,
        };

        // Read before playing: this decides whether the track is starting now or
        // joining a queue. Checking afterwards is what made the old four-branch
        // reply ladder race the player.
        const wasPlaying = Boolean(player.nodes.get(interaction.guildId!)?.currentTrack);

        // The `play` method handles joining the voice channel.
        const { track, queue } = await player.play(voiceChannel, searchResult, {
          nodeOptions: buildNodeOptions(context),
        });

        // nodes.create() ignores options for an existing queue, so announcements
        // would otherwise keep going to whichever channel opened it.
        refreshQueueMetadata(queue, context);

        if (searchResult.playlist) {
          await interaction.editReply({
            content: `🎶 Playlist? Váš vkus bude nyní veřejný. Spuštěno. **${searchResult.playlist.title}** zařazen s ${searchResult.tracks.length} skladbami.`,
          });
          return;
        }

        // `playerStart` owns the "now playing" message, and only once real audio
        // is confirmed - so this stays deliberately provisional.
        await interaction.editReply({
          content: wasPlaying
            ? `🎵 **${track.cleanTitle}** přidána do fronty.`
            : `⏳ Načítám **${track.cleanTitle}**...`,
        });

    } catch (error: any) {
      console.error('Error in /play command:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Ups! Něco se pokazilo: ${error.message}. \n Nastala chyba. Možná vaše chyba. Ale dobře řekněme, že to může být i moje chyba. (...není)` }).catch(() => {});
      } else {
        await interaction.reply({ content: `❌ Neočekávaná porucha: ${error.message}. \n Lafayette je zmaten. To se stává přibližně jednou za... věčnost.`, ephemeral: true }).catch(() => {});
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
    async execute(interaction: ChatInputCommandInteraction, _client: ExtendedClient) {
        const validationResult = await prePlayValidation(interaction);
        if (!validationResult) {
          return;
        }

        const { voiceChannel, player } = validationResult;
        const attachmentInput = interaction.options.getAttachment('file', true);

        console.log(`[PlayCmd] Attachment received: ${attachmentInput.name}, type: ${attachmentInput.contentType}, URL: ${attachmentInput.url}`);

        // Must reject before deferReply(), otherwise reply() throws InteractionAlreadyReplied
        // and the user gets a generic error instead of the reason.
        if (!(attachmentInput.contentType === 'audio/mpeg' || attachmentInput.name.toLowerCase().endsWith('.mp3'))) {
            await interaction.reply({ content: '❌ Tento soubor není MP3. Přijímám výhradně MP3. Ano, je to omezení. Ne, omlouvat se za něj nebudu.', ephemeral: true });
            return;
        }

        await interaction.deferReply();

        try {
            const searchResult = await player.search(attachmentInput.url, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO
            });

            if (!searchResult || !searchResult.hasTracks()) {
                await interaction.editReply({ content: `❌ Soubor **${attachmentInput.name}** se nepodařilo zpracovat. Tvrdí, že je zvuk. Neshodli jsme se.` });
                return;
            }

            const context: QueueContext = {
                channel: interaction.channel ?? undefined,
                interaction,
            };

            const wasPlaying = Boolean(player.nodes.get(interaction.guildId!)?.currentTrack);

            // Same shared options as /play. These used to diverge, which was
            // invisible anyway since only the first command to open a queue got
            // its options applied.
            const { track, queue } = await player.play(voiceChannel, searchResult, {
                nodeOptions: buildNodeOptions(context),
            });

            refreshQueueMetadata(queue, context);

            await interaction.editReply({
                content: wasPlaying
                    ? `🎵 **${track.cleanTitle}** přidána do fronty.`
                    : `⏳ Načítám **${track.cleanTitle}**...`,
            });

        } catch (error: any) {
            console.error(`Error in /playfile command (attachment: ${attachmentInput.name}):`, error);
            const message = `❌ Ups! Přehrání souboru selhalo: ${error.message}`;
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: message }).catch(() => {});
            } else {
                await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
            }
        }
    },
};