FROM node:22-alpine AS builder
WORKDIR /usr/src/app

# Copy package files first
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci --verbose

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify build output
RUN ls -la dist/

# Stage 2: Production image
FROM node:22-alpine AS production
WORKDIR /usr/src/app

# Install runtime dependencies
RUN apk add --no-cache ffmpeg opus

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discord-bot -u 1001 -G nodejs

# Copy and validate package.json
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/package-lock.json ./package-lock.json

# Validate package.json syntax
RUN node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" && \
    echo "package.json is valid"

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy built application
COPY --from=builder /usr/src/app/dist ./dist

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