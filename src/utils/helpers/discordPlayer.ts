import { Player } from "discord-player";
import { ExtendedClient } from "../../types";
import { SoundcloudExtractor } from "discord-player-soundcloud";
import { config } from "../../config";
import { AttachmentExtractor } from "@discord-player/extractor";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { SpotifyExtractor } from "discord-player-spotify";


/**
 * Initializes a new Player instance
 *
 * @param {Client} client
 * @returns
 */
export async function initPlayer(client: ExtendedClient): Promise<Player> {
    return new Player(client, {
        ffmpegPath: config.DP_FFMPEG_PATH,
    });
}

export async function registerExtractors(player: Player): Promise<void> {

    const soundcloudExt = await player.extractors.register(SoundcloudExtractor,{});
    if (!soundcloudExt) {
        console.error("[EXTRACTORS] Failed to register Soundcloud Extractor.");
    } else {
        console.log("[EXTRACTORS] Soundcloud Extractor registered successfully.");
    }



    const spotifyExt =  await player.extractors.register(SpotifyExtractor, {
        market: 'CZ',
    });

    if (!spotifyExt) {
        console.error("[EXTRACTORS] Failed to register Spotify Extractor.");
    } else {
        console.log("[EXTRACTORS] Spotify Extractor registered successfully.");
    }

    const ytExt = await player.extractors.register(YoutubeiExtractor, {
        generateWithPoToken: true,
        // WEB streams go through format.decipher() and break when YouTube's base.js
        // cannot be parsed (common in CI and after player updates). ANDROID + no player
        // uses direct URLs and matches discord-player-youtubei guidance for disablePlayer.
        disablePlayer: true,
        streamOptions: {
            useClient: "IOS",
        },
    });
    

    if (!ytExt) {
        console.error("[EXTRACTORS] Failed to register Youtube Extractor.");
    } else {
        console.log("[EXTRACTORS] Youtube Extractor registered successfully.");
    }

    const attachmentExtractor = player.extractors.register(AttachmentExtractor, {});


    if (!attachmentExtractor) {
        console.error("[EXTRACTORS] Failed to register Attachment Extractor.");
    } else {
        console.log("[EXTRACTORS] Attachment Extractor registered successfully.");
    }

  
}
