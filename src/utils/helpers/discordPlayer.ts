import { Player } from "discord-player";
import { ExtendedClient } from "../../types";
import { SoundcloudExtractor } from "discord-player-soundcloud";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { SpotifyExtractor } from "discord-player-spotify";
import { config } from "../../config";

/**
 * Initializes a new Player instance
 *
 * @param {Client} client
 * @returns
 */
export async function initPlayer(client: ExtendedClient): Promise<Player> {
    return new Player(client, {
        //skipFFmpeg: discordPlayerConfig?.skipFFmpeg,
        //ffmpegPath: discordPlayerConfig?.ffmpegPath,
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
        generateWithPoToken: true,
        streamOptions: {
            useClient: "WEB",
        },
        authentication: config.YT_CREDENTIALS, // Ensure you have a valid cookie set in your config
    });
    
    if (!youtubeExt) {
        console.error("[EXTRACTORS] Failed to register Youtube Extractor.");
    } else {
        console.log("[EXTRACTORS] Youtube Extractor registered successfully.");
    }
}
