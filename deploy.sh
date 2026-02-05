#!/usr/bin/env bash
set -e

# Configuration via environment variables
: "${PROJECT_ROOT:?PROJECT_ROOT environment variable required}"
: "${FILE_OWNER:?FILE_OWNER environment variable required}"
FILE_GROUP="${FILE_GROUP:-$FILE_OWNER}"

ENV_FILE="${PROJECT_ROOT}/.env"

echo "Starting deployment for VectoBeat..."

# Ensure we are running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root." >&2
    exit 1
fi

# Ensure project root exists
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "Directory $PROJECT_ROOT does not exist. Something went wrong with the upload." >&2
    exit 1
fi

# Switch to project directory explicitly
cd "$PROJECT_ROOT"

# Check for .env file
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Environment file not found at $ENV_FILE" >&2
  exit 1
fi

# Determine docker compose command
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose is required but not found." >&2
  exit 1
fi

# Pull latest changes if git is available
if [ -d ".git" ]; then
    echo "Pulling latest code..."
    # Pull as the file owner to avoid permission issues with .git
    sudo -u "$FILE_OWNER" git pull || echo "Git pull failed, continuing..."
fi

# Fix permissions ensuring vectode owns the files, but we run as root
echo "Fixing permissions for $PROJECT_ROOT..."
chown -R "$FILE_OWNER:$FILE_GROUP" "$PROJECT_ROOT"

# Build and start services
echo "Building and starting services..."
"${COMPOSE[@]}" down --remove-orphans
"${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d

echo "Deployment finished successfully."
