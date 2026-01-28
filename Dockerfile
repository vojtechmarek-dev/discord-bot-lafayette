# Stage 1: Builder
FROM node:22-slim AS builder
WORKDIR /usr/src/app

# Install build dependencies (Debian equivalents of apk add build-base...)
# canvas needs: libcairo2-dev, libpango1.0-dev, libjpeg-dev, libgif-dev, librsvg2-dev
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install dependencies (canvas will likely download a prebuild now)
RUN npm ci --verbose

COPY . .

RUN npm run build

# Prune devDependencies
RUN npm prune --omit=dev

# Verify build
RUN ls -la dist/

# Stage 2: Production image
FROM node:22-slim AS production
WORKDIR /usr/src/app

# Install runtime libraries (Debian equivalents)
# ffmpeg, cairo, pango, libsodium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libsodium23 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
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

# Start the bot
CMD ["node", "dist/index.js"]