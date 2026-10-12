# Lafayette - Discord Bot

> **Language:** Everything a player sees is Czech; logs and operator-facing output are English.
> See [docs/VOICE.md](docs/VOICE.md) for how Lafayette speaks and why.


**TODO**
- [ ] Configurable deck cleanup interval
- [ ] Character sheets and an encounter tracker
- [x] ~~Bot settings from fs json to a real store~~ — now SQLite via `node:sqlite`
- [x] ~~Consistent Czech player-facing copy~~ — see [docs/VOICE.md](docs/VOICE.md)

Lafayette is a multi-functional Discord bot built with Node.js, TypeScript, and leveraging powerful libraries like `discord.js`,`discord-player` and `rpg-dice-roller`. It features slash commands for various utilities, including dice rolling and music playback.

## Features

*   **Slash Commands:** Modern Discord command interaction.
*   **Music Playback:**
    *   Play songs and playlists from YouTube, Spotify (searches on YouTube), and SoundCloud.
    *   Queue system.
    *   Commands: `/play`, `/skip`, `/stop`, `/queue`, `/resume`, `/pause`.
*   **Dice Rolling:**
    *   Supports standard RPG dice notation (e.g., `2d6+5`, `1d20-2`, `4dF`).
    *   Marks critical successes (max roll) on dice. Critical-failure detection exists but renders
        nothing by default - see `CRIT_FAILURE_MARKER` in `src/commands/fun/roll.ts` to enable it.
    *   Handles multiple rolls in a single command, separated by `;` or `,`.
    *   Examples: `/roll dice:2d6`, `/roll dice:1d20+5, 4dF`.
*   **Utility Commands:**
    *   `/ping`: Checks bot latency.
    *   `/echo`: Owner-only, send a message as the bot.
    *   `/settings`: Manage server and personal bot settings.
*   **Structured Codebase:** TypeScript for type safety, organized command and event handlers.
*   **Dockerized:** Ready for containerized deployment.
*   **CI/CD with GitHub Actions:**
    *   Automated multi-platform Docker image builds (amd64, arm64) and pushes to GHCR on pushes to `main` and `release` branches.
    *   Automated deployment of slash commands on pushes to the `release` branch.
*   **Card Decks (Server State):**
    *   Server-wide poker deck with optional Jokers.
    *   State persists across restarts in `data/guild-state.json`.
    *   Inactive decks are cleaned up automatically (see Background Jobs below).

## Slash Commands

### 🎲 Fun
- `/roll [dice]`  
  Roll dice using RPG notation (e.g., `2d6+3`, `1d20`). Supports multiple rolls separated by `,` or `;`.
 - `/shuffle [jokers]`  
   Shuffle a new poker deck for the server. `jokers` defaults to true.
 - `/draw [count]`  
   Draw 1–52 cards from the current server deck, tracking remaining/drawn cards.
- `/adv [bonus]`  
  Roll 1d20 with advantage (`2d20kh1`). Accepts a bonus such as `+5` or `+1d4`.
- `/dis [bonus]`  
  Roll 1d20 with disadvantage (`2d20kl1`).

### 🎵 Music
- `/play [query]`  
  Play a song or playlist from YouTube, Spotify, or SoundCloud.
- `/skip`  
  Skip the currently playing track.
- `/stop`  
  Stop playback, clear the queue, and leave the voice channel.
- `/queue`  
  Show the current music queue.
- `/resume`  
  Resume paused music.
- `/pause`  
  Pause the currently playing track.
- `/loop <off|track|queue>`  
  Set repeat mode. Required for looping ambience beds.
- `/volume [0-100]`  
  Set playback volume for the server. Persisted; omit the value to read it back.
- `/ambience play|stop|list`  
  Loop a local ambience bed from `data/ambience/`. See Ambience below.

### 🛠️ Utility
- `/ping`  
  Replies with Pong! and shows bot latency.
- `/echo [message] [title] [channel]`  
  (Owner only) Send a message as the bot, optionally as an embed and/or to a specific channel.
- `/settings`  
  Manage server and personal bot settings.
  - `/settings guild dice_explode:<true|false>`  
    Enable/disable exploding dice for all rolls in the server.
  - `/settings me roll_color:<color>`  
    Set your personal dice roll embed color.
  - `/settings view`  
    View current server and personal settings.

## Prerequisites

*   Node.js 24 or newer. Required, not advisory: persistence uses the built-in `node:sqlite`.
*   npm or yarn
*   (optional) Docker - for building and running, or for deployment target
*   A Discord Bot Application:
    *   Create one on the [Discord Developer Portal](https://discord.com/developers/applications).
    *   Enable **Privileged Gateway Intents**:
        *   `Server Members Intent` (if needed for member-specific features)
        *   Presence Intent (if needed)
    *   Note your Bot Token, Client ID.

## Local Development Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/vojtechmarek-dev/discord-bot-lafayette.git
    cd discord-bot-lafayette
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Create an `.env` file:**
    Copy `.env.example` to `.env` and fill in your bot's credentials and configuration:
    ```env
    # .env
    DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
    CLIENT_ID=YOUR_BOT_APPLICATION_CLIENT_ID
    GUILD_ID=YOUR_DEVELOPMENT_SERVER_ID # For instant slash command updates during dev
    BOT_OWNER_ID # for /echo command to work properly

    # Optional: path to an ffmpeg binary. Without it the resolver falls back to
    # `ffmpeg` on PATH, then to the ffmpeg-static dev dependency.
    # DP_FFMPEG_PATH=/usr/bin/ffmpeg

    # Optional: where lafayette.db and the ambience folder live. Defaults to <cwd>/data.
    # LAFAYETTE_DATA_DIR=

    # Optional: set to 1 to log which extractor served each query.
    # LAFAYETTE_PLAYER_DEBUG=0
    ```
    *   `GUILD_ID` is your personal Discord server ID used for rapid testing of slash commands. Get it by enabling Developer Mode in Discord, right-clicking your server icon, and "Copy ID".

4.  **Compile TypeScript (Optional - `tsx` handles this for dev):**
    ```bash
    npm run build
    ```

5.  **Deploy Slash Commands (Run once, or when command definitions change):**
    This registers your slash commands with Discord for your test guild or globally.
    ```bash
    npm run deploy:commands
    ```

6.  **Run the bot in development mode (with auto-reload):**
    ```bash
    npm run dev
    ```
    This uses `tsx` to run TypeScript directly.

7.  **Invite your bot to your development server:**
    *   Go to your bot's application page on the Discord Developer Portal.
    *   Navigate to "OAuth2" -> "URL Generator".
    *   Select scopes: `bot` and `applications.commands`.
    *   Select necessary Bot Permissions:
        *   `View Channels`
        *   `Send Messages`
        *   `Embed Links`
        *   `Connect` (for voice)
        *   `Speak` (for voice)
        *   `Read Message History` (if needed)
        *   `Use External Emojis` (if needed)
    *   Copy the generated URL and use it to invite the bot.

## Scripts

*   `npm run dev`: Starts the bot in development mode using `tsx` with live reloading.
*   `npm run build`: Compiles TypeScript to JavaScript in the `dist/` folder using `esbuild`.
*   `npm run start`: Starts the bot from the compiled JavaScript in `dist/`.
*   `npm run deploy:commands`: Registers slash commands with Discord (uses `tsx deploy-commands.ts`).
*   `npm run lint`: Lints the codebase (if ESLint is configured).
*   `npm run typecheck`: Runs TypeScript compiler for type checking without emitting files.

## Docker

### Building the Image Locally
```bash
docker build -t yourusername/lafayette-bot:dev .
```
## Running with Docker Locally

```bash
see ./docker-compose.yml
```

Then run:

```bash
docker compose up -d
```

## Data Storage

- `data/lafayette.db`: SQLite database holding guild settings, per-user settings and card decks.
  Created and migrated automatically on first start. Legacy `guild-settings.json` and
  `guild-state.json` are imported once and then renamed to `*.imported-<timestamp>`.
- `data/ambience/`: Ambience beds (see below). Operator-managed, never written by the bot.

### Ambience

`/ambience` loops audio files placed in `data/ambience/`. They are read from the mounted
data volume rather than baked into the image, so you can add your own without a rebuild -
the bot rescans the directory on every command, so no restart is needed either.

- Supported: `.opus`, `.ogg`, `.mp3`, `.wav`, `.flac`, `.m4a`, `.webm`. All of them are
  transcoded through ffmpeg on the way out, so pick on file size rather than CPU.
- The file name becomes the preset: `tavern-night.opus` is selectable as `tavern-night`
  and displayed as "Tavern Night".
- Ambience plays on the same voice connection as music, so it cannot layer underneath a
  song. Starting it while music plays is refused rather than silently stopping the music.
- This path touches no extractor, so it keeps working during a YouTube outage.

## Background Jobs

- Card deck cleanup runs on bot ready and then every 6 hours by default.
- Decks with no activity for 7 days are removed from state.
- The 7-day expiry and 6-hour sweep interval are currently constants in the source.

## GitHub Actions CI/CD

The workflow in `.github/workflows/build-and-publish.yml` handles:

1. Building and Pushing Docker Image:
* On pushes to main and release branches.
* Builds multi-platform images (`linux/amd64`, `linux/arm64/v8`).
* Pushes the image to GitHub Container Registry (GHCR) tagged with branch name, commit SHA, and latest (for default branch) or release (for release branch).

2. Deploying Slash Commands:

* On pushes to the release branch only.
* Installs Node.js dependencies.
* Runs the npm run deploy:commands script.
* Uses GitHub Secrets (`DISCORD_TOKEN`, `CLIENT_ID`) for authentication.

### Required GitHub Secrets for Actions

Navigate to your repository settings -> Secrets and variables -> Actions -> New repository secret:

    DISCORD_TOKEN: Your bot's secret token.
    CLIENT_ID: Your bot application's client ID.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.