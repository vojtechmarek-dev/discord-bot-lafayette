/**
 * Shared YoutubeiExtractor options for smoke scripts and tooling.
 * OAuth string: run `npx --no discord-player-youtubei` and paste the full line into YOUTUBE_OAUTH_TOKENS.
 */
export function buildYoutubeiExtractorOptions() {
	const authentication = process.env.YOUTUBE_OAUTH_TOKENS?.trim();
	const options = {
		generateWithPoToken: true,
		disablePlayer: true,
		streamOptions: { useClient: "WEB" },
	};
	if (authentication) {
		options.authentication = authentication;
	}
	return options;
}
