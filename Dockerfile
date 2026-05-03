# Multi-arch image so it works on both amd64 (dev/CI) and arm64 (Raspberry Pi 4/5)
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Non-root user for better security on the Pi
RUN addgroup -S agentloop && adduser -S agentloop -G agentloop

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || npm install --production

COPY --from=builder /app/dist ./dist

# State file lives in a mounted volume so it survives container restarts
VOLUME ["/data"]
ENV STATE_FILE=/data/.agent-state.json

USER agentloop

CMD ["node", "dist/index.js"]
