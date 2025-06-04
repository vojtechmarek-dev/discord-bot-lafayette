import { Player } from "discord-player";
import { ExtendedClient } from "../../types";
import { SoundcloudExtractor } from "discord-player-soundcloud";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { SpotifyExtractor } from "discord-player-spotify";
import { config } from "../../config";
import ytdl from "@distube/ytdl-core";
import { Readable } from "stream";

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

    const youtubeExtTemp = await player.extractors.register(YoutubeiExtractor, {
        generateWithPoToken: true,
        streamOptions: {    
            useClient: "WEB_EMBEDDED",
            highWaterMark: 1024 * 1024 // 1MB buffer size

        }
    });

    const originalStream = youtubeExtTemp!.stream.bind(youtubeExtTemp);

    await player.extractors.unregister(YoutubeiExtractor.identifier);

    let ytExt = null;
        try {
            ytExt = await player.extractors.register(YoutubeiExtractor, {
                createStream: async (track, ext) => {
                    try {
                        const result = await originalStream(track);
                        // If result is null or undefined, throw to trigger fallback
                        if (result == null) throw new Error("originalStream returned null");
                        return result as unknown as string | Readable;
                    } catch (err: any) {
                        console.warn(`Original stream failed for ${track.url}, falling back to ytdl-core. Error: ${err?.message}`);
                        try {
                            const info = await ytdl.getInfo(track.url);
                            if (!info.formats?.length) throw new Error("No formats found");
                            const format = info.formats
                                .filter(f => f.hasAudio && (!track.live || f.isHLS))
                                .sort((a, b) => Number(b.audioBitrate) - Number(a.audioBitrate) || Number(a.bitrate) - Number(b.bitrate))[0];
                            if (!format) throw new Error("No suitable format found");
                            return format.url;
                        } catch (ytdlErr) {
                            console.error("ytdl-core also failed:", ytdlErr);
                            // Return a dummy empty readable stream to satisfy type, or throw error
                            const { Readable } = await import("stream");
                            return Readable.from([]);
                        }
                    }
                },
            });



    
    if (!ytExt) {
        console.error("[EXTRACTORS] Failed to register Youtube Extractor.");
    } else {
        console.log("[EXTRACTORS] Youtube Extractor registered successfully.");
    }

    }
    catch (e) {
            console.error("Failed to register YoutubeiExtractor:", e);
     }

    }
