# Lafayette - Discord Bot

Lafayette is a multi-functional Discord bot built with Node.js, TypeScript, and leveraging powerful libraries like `discord.js`,`discord-player` and `rpg-dice-roller`. It features slash commands for various utilities, including dice rolling and music playback.

## Features

*   **Slash Commands:** Modern Discord command interaction.
*   **Music Playback:**
    *   Play songs and playlists from YouTube, Spotify (searches on YouTube), and SoundCloud.
    *   Queue system.
    *   Commands: `/play`, `/skip`, `/stop`, `/queue`.
*   **Dice Rolling:**
    *   Supports standard RPG dice notation (e.g., `2d6+5`, `1d20-2`, `4dF`).
    *   Highlights critical successes (max roll) and critical failures (min roll) on dice.
    *   Handles multiple rolls in a single command, separated by `;` or `,`.
    *   Examples: `/roll dice:2d6`, `/roll dice:1d20+5, 4dF`.
*   **Utility Commands:**
    *   `/ping`: Checks bot latency.
*   **Structured Codebase:** TypeScript for type safety, organized command and event handlers.
*   **Dockerized:** Ready for containerized deployment.
*   **CI/CD with GitHub Actions:**
    *   Automated multi-platform Docker image builds (amd64, arm64) and pushes to GHCR on pushes to `main` and `release` branches.
    *   Automated deployment of slash commands on pushes to the `release` branch.

## Prerequisites

*   Node.js (v18.x or later recommended, check `package.json` engines)
*   npm or yarn
*   Docker (for building and running, or for deployment target)
*   Ansible (for automated deployment using the provided playbook)
*   A Discord Bot Application:
    *   Create one on the [Discord Developer Portal](https://discord.com/developers/applications).
    *   Enable **Privileged Gateway Intents**:
        *   `Server Members Intent` (if needed for member-specific features)
        *   `Message Content Intent` (if you plan to add prefix commands or read message content for other reasons)
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

    # Optional: Path to FFmpeg if not in system PATH and needed by discord-player
    # FFMPEG_PATH=/usr/bin/ffmpeg
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

## GitHub Actions CI/CD

The workflow in .github/workflows/docker-publish-and-deploy-commands.yml handles:

1. Building and Pushing Docker Image:
* On pushes to main and release branches.
* Builds multi-platform images (`linux/amd64`, `linux/arm64/v8`).
* Pushes the image to GitHub Container Registry (GHCR) tagged with branch name, commit SHA, and latest (for default branch) or release (for release branch).

2. Deploying Slash Commands:

* On pushes to the release branch only.
* Installs Node.js dependencies.
* Runs the npm run deploy:commands script.
* Uses GitHub Secrets (DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID) for authentication.

### Required GitHub Secrets for Actions

Navigate to your repository settings -> Secrets and variables -> Actions -> New repository secret:

    DISCORD_TOKEN: Your bot's secret token.
    CLIENT_ID: Your bot application's client ID.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.