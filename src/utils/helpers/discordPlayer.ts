import { Player } from "discord-player";
import { ExtendedClient } from "../../types";
import { SoundcloudExtractor } from "discord-player-soundcloud";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { SpotifyExtractor } from "discord-player-spotify";
import { config } from "../../config";
import { DefaultExtractors, VimeoExtractor } from "@discord-player/extractor";

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



    const spotifyExt =  await player.extractors.register(SpotifyExtractor, {});

    if (!spotifyExt) {
        console.error("[EXTRACTORS] Failed to register Spotify Extractor.");
    } else {
        console.log("[EXTRACTORS] Spotify Extractor registered successfully.");
    }

    const youtubeExt = await player.extractors.register(YoutubeiExtractor, {
        //generateWithPoToken: true,
        streamOptions: {    
            useClient: "IOS",
            highWaterMark: 1024 * 1024 // 1MB buffer size

        }
    });
    
    if (!youtubeExt) {
        console.error("[EXTRACTORS] Failed to register Youtube Extractor.");
    } else {
        console.log("[EXTRACTORS] Youtube Extractor registered successfully.");
    }

}
