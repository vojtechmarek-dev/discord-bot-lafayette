# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies for native modules if any (e.g., for opus or sodium)
# For Alpine, these are common. For Debian-based (like node:18-slim), it would be python3 make g++
# RUN apk add --no-cache python3 make g++

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
# Using --omit=dev for production builds if your devDependencies aren't needed at runtime.
# If some devDependencies are needed for building (like typescript, esbuild), install all first.
RUN npm install

# Copy the rest of your application source code
COPY . .

# Build your TypeScript application
# This command should match what's in your package.json "build" script
RUN npm run build
# This will create the 'dist' folder with your compiled JavaScript.

# If you had a copy-non-ts script, it would run here or be part of the build.
# Example: RUN npm run copy-non-ts

# Prune development dependencies if they are not needed in the final image
# Only do this if your build step doesn't rely on devDependencies that are removed by --omit=dev earlier.
# If npm install already used --omit=dev or similar, this might not be necessary.
# RUN npm prune --production


# Stage 2: Production image - leaner and includes FFmpeg
FROM node:22-alpine
# You can also use a Debian-based image like `node:18-slim` which might have easier FFmpeg installation
# but Alpine is generally smaller.

WORKDIR /usr/src/app

# Install FFmpeg and runtime dependencies
# For Alpine Linux:
RUN apk add --no-cache ffmpeg opus

# Copy built application from the builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json
# If you have other assets that need to be copied from builder, add them here
# e.g., COPY --from=builder /usr/src/app/assets ./assets

# Copy your .env file template or handle environment variables differently
# It's generally NOT recommended to copy your actual .env file with secrets into the image.
# Instead, provide them at runtime via Docker environment variables.
# You might copy a .env.example for reference:
# COPY .env.example .

# Expose any port if your bot listens on one (unlikely for a standard Discord bot)
# EXPOSE 3000

# Set the command to run your bot
# This should match your package.json "start" script
CMD [ "node", "dist/index.js" ]