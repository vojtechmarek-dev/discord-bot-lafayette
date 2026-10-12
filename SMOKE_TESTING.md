# Smoke Testing Plan

This repository now includes a canary smoke test scaffold for Discord voice + media playback.

## Scope

The canary verifies:

The canary runs the bot's own pipeline - the same extractor registration, query
router, playback watchdog and audio thresholds - rather than a parallel copy. An
earlier version duplicated all of that with its own constants, so it could pass
while production was broken: production accepted 500 ms of audio while the canary
demanded 3000 ms, which meant the two were testing different bots.

It exercises four legs, each of which logs in, joins the voice channel, plays,
and asserts at least 3000 ms of genuinely decoded audio:

| Leg | Gates the build? | Why |
|---|---|---|
| `attachment` | **yes** | A WAV generated in-process. Depends on no network, no CDN and no third party, so a red here is always our bug. |
| `soundcloud` | **yes** | Works from datacenter IPs, needs no PO token. |
| `bridge` | no | Asserts a Spotify link bridges to the **YouTube** extractor, so it inherits YouTube's IP problem. |
| `youtube` | no | GitHub runners are datacenter IPs and YouTube rates them harshly. |

The two informational legs still run and still report - "did YouTube break
again?" is worth asking weekly - they just do not fail the build. A check that
reddens for reasons unrelated to the code is not a gate; it is noise that trains
you to ignore CI.

The bridge wiring is gated offline instead, by `test/extractor-contract.test.ts`,
which asserts YouTube defines its own `bridge()` and outranks SoundCloud. That is
how the regression actually happens, and it fails on every PR rather than weekly.

### Why the audio assertion matters

`playerStart` only means an extractor handed `discord-player` a stream object.
`discord-player-googlevideo` returns its `PassThrough` *before* fetching the first
media segment, so when YouTube answers the segment requests with `403 Forbidden`
the stream is ended with zero bytes: `playerStart` has already fired and no
`playerError` is emitted. A canary that stops at `playerStart` reports green while
the bot sits in the voice channel playing silence — exactly the failure mode seen
in production on 2026-09-08.

The canary therefore polls `queue.node.streamTime` and fails if the queue never
reaches `MIN_AUDIO_MS`, or if it empties/stalls first.

This is designed to catch breakages from frequent dependency updates in:

- `discord.js` / `@discordjs/voice`
- `discord-player` + extractor packages
- YouTube/media integration chain

## Files

- Workflow: `.github/workflows/smoke-canary.yml`
- Script: `scripts/smoke-canary.ts` (run through `tsx`, so it imports from `src/`)
- NPM script: `npm run smoke:canary`

## Required GitHub Secrets

Add these to repository settings:

- `DISCORD_TOKEN_CANARY`: token for dedicated canary bot account
- `CANARY_GUILD_ID`: test guild/server ID
- `CANARY_VOICE_CHANNEL_ID`: voice channel ID used for smoke runs
- `CANARY_TEXT_CHANNEL_ID`: optional text channel ID for pass/fail notifications
- `CANARY_SOUNDCLOUD_QUERY`: optional override for the SoundCloud leg
- `CANARY_SPOTIFY_URL`: optional override for the bridge leg
- `CANARY_YOUTUBE_QUERY`: optional override for the YouTube leg
- `DP_FFMPEG_PATH`: optional, only if your environment requires custom ffmpeg path

## First Run

1. Add secrets listed above.
2. Run workflow manually using `workflow_dispatch`.
3. Confirm logs contain:
   - `[SMOKE] Client ready`
   - `[SMOKE] Playback started`
   - `[SMOKE] SUCCESS`

## Recommended Operating Mode

- Keep schedule enabled (weekly, Mondays 04:30 Europe/Prague).
- Require `Smoke Canary Required` in branch protection.
- Renovate PRs labeled `media` or `major` must pass smoke before merge.
- Use a dedicated canary guild/channel to avoid user-facing disruption.
- Workflow concurrency is enabled to keep only one active canary run per PR/ref.
- Aborted/cancelled runs do not post failure messages to `CANARY_TEXT_CHANNEL_ID`.
- Every run uploads `smoke-report.json` as an artifact: per-leg status, decoded
  audio in ms, which extractor bridged, and any stream diagnosis.

## Known limitation: runner egress IP

YouTube rates datacenter IPs harshly, and GitHub-hosted runners are datacenter IPs.
A canary run can now legitimately fail on segment `403`s that the production host
would not hit (and vice versa). If the YouTube leg turns permanently red on
GitHub-hosted runners, move the `smoke-canary` job to a self-hosted runner on the
same network as the bot so the check reflects production egress.

## Future Hardening (next step)

- Add secondary source test to cover non-YouTube transport path.
- Post failure notifications to Discord webhook or issue tracker.
- Persist small JSON smoke report artifact for trend analysis.
