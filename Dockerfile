# Stage 1: Builder
FROM node:24-slim AS builder
WORKDIR /usr/src/app

# No build toolchain needed. The whole cairo/pango/librsvg stack was here only
# for `canvas`, which was a direct dependency imported nowhere in the codebase -
# and it dominated the emulated linux/arm64 build. esbuild ships a prebuilt
# binary, so nothing left in the tree needs node-gyp.

COPY package*.json ./

RUN npm ci --verbose

COPY . .

RUN npm run build

# Prune devDependencies
RUN npm prune --omit=dev

# Verify build
RUN ls -la dist/

# Stage 2: Production image
FROM node:24-slim AS production
WORKDIR /usr/src/app

# Runtime libraries. ffmpeg is required by discord-player for transcoding.
# libsodium23 is kept for one release as a safety net for voice encryption:
# sodium-native@5 ships its own prebuilt libsodium, so this is probably
# redundant - drop it only after confirming voice still works without it.
# The cairo/pango/jpeg/gif/rsvg runtime libs went with `canvas`.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsodium23 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (Debian syntax)
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m -s /bin/bash discord-bot

# Copy built application and dependencies
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

# Verify dist
RUN ls -la dist/ && test -f dist/index.js

# Change ownership
RUN chown -R discord-bot:nodejs /usr/src/app

# Switch to non-root user
USER discord-bot

# Healthcheck: bot rewrites /tmp/lafayette-healthy every 60s while Discord WS is READY.
# Fail if file missing or older than 2 minutes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD find /tmp/lafayette-healthy -mmin -2 | grep -q . || exit 1

# Start the bot
CMD ["node", "dist/index.js"]