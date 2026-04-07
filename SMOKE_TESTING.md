# Smoke Testing Plan

This repository now includes a canary smoke test scaffold for Discord voice + media playback.

## Scope

The canary verifies:

- canary bot can log in
- canary bot can resolve a playback query
- canary bot can join the configured voice channel
- `discord-player` emits `playerStart`

This is designed to catch breakages from frequent dependency updates in:

- `discord.js` / `@discordjs/voice`
- `discord-player` + extractor packages
- YouTube/media integration chain

## Files

- Workflow: `.github/workflows/smoke-canary.yml`
- Script: `scripts/smoke-canary.mjs`
- NPM script: `npm run smoke:canary`

## Required GitHub Secrets

Add these to repository settings:

- `DISCORD_TOKEN_CANARY`: token for dedicated canary bot account
- `CANARY_GUILD_ID`: test guild/server ID
- `CANARY_VOICE_CHANNEL_ID`: voice channel ID used for smoke runs
- `CANARY_TEXT_CHANNEL_ID`: optional text channel ID for pass/fail notifications
- `CANARY_QUERY`: media query/URL for playback (optional, defaults in script)
- `DP_FFMPEG_PATH`: optional, only if your environment requires custom ffmpeg path
- `YOUTUBE_OAUTH_TOKENS`: optional; full OAuth string from `npx --no discord-player-youtubei` (same value as local `.env` `YOUTUBE_OAUTH_TOKENS`) for signed-in YouTube / InnerTube

## First Run

1. Add secrets listed above.
2. Run workflow manually using `workflow_dispatch`.
3. Confirm logs contain:
   - `[SMOKE] Client ready`
   - `[SMOKE] Playback started`
   - `[SMOKE] SUCCESS`

## Recommended Operating Mode

- Keep schedule enabled (daily).
- Require `Smoke Canary Required` in branch protection.
- Renovate PRs labeled `media` or `major` must pass smoke before merge.
- Use a dedicated canary guild/channel to avoid user-facing disruption.
- Workflow concurrency is enabled to keep only one active canary run per PR/ref.
- Aborted/cancelled runs do not post failure messages to `CANARY_TEXT_CHANNEL_ID`.

## Future Hardening (next step)

- Add secondary source test to cover non-YouTube transport path.
- Post failure notifications to Discord webhook or issue tracker.
- Persist small JSON smoke report artifact for trend analysis.
