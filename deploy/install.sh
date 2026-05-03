#!/usr/bin/env bash
# Deploy the Cursor PR Agent as a systemd service on Raspberry Pi / Linux.
# Run as root: sudo bash deploy/install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_FILE="$REPO_DIR/deploy/cursor-pr-agent.service"
TARGET="/etc/systemd/system/cursor-pr-agent.service"

echo "[install] repo: $REPO_DIR"

# Install Node.js 22 if not present
if ! command -v node &>/dev/null; then
  echo "[install] installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "[install] node $(node --version), npm $(npm --version)"

# Install dependencies
cd "$REPO_DIR"
npm install --production=false

# Copy .env if not present
if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  echo "[install] .env created from .env.example — fill in CURSOR_API_KEY, GITHUB_TOKEN, GITHUB_REPOS"
fi

# Install systemd service
sed "s|/home/pi/cursor-universal-template|$REPO_DIR|g" "$SERVICE_FILE" > "$TARGET"
systemctl daemon-reload
systemctl enable cursor-pr-agent
systemctl restart cursor-pr-agent

echo "[install] done. Check status: systemctl status cursor-pr-agent"
echo "          Logs: journalctl -u cursor-pr-agent -f"
