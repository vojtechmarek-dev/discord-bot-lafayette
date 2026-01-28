FROM node:22-slim AS builder
WORKDIR /usr/src/app

# System deps to compile native modules
RUN apk add --no-cache --virtual .build-deps \
    build-base python3 pkgconf \
    cairo-dev pango-dev

# Copy package files first
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci --verbose

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Prune devDependencies to keep only production deps for runtime copy
RUN npm prune --omit=dev

# Verify build output
RUN ls -la dist/

# Stage 2: Production image
FROM node:22-slim AS production
WORKDIR /usr/src/app

# Install runtime dependencies (no build toolchain)
RUN apk add --no-cache ffmpeg opus cairo pango libsodium

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discord-bot -u 1001 -G nodejs

# Copy built application and runtime node_modules from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

# Verify dist directory
RUN ls -la dist/ && test -f dist/index.js

# Change ownership
RUN chown -R discord-bot:nodejs /usr/src/app

# Switch to non-root user
USER discord-bot

# Verify everything is accessible
RUN node -e "console.log('Setup complete')"

# Start the bot
CMD ["node", "dist/index.js"]