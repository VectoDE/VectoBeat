#!/usr/bin/env bash
set -euo pipefail

# Absolute paths as requested
PROJECT_ROOT="/home/vectode/vectobeat"
ENV_DIR="/home/vectode/vectobeat_env"
ENV_FILE="${ENV_DIR}/.env"
USER="vectode"
GROUP="vectode"

echo "Starting deployment for VectoBeat..."

# Ensure target directory exists
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "Creating project root: $PROJECT_ROOT"
    mkdir -p "$PROJECT_ROOT"
fi

# Switch to project directory
cd "$PROJECT_ROOT"

# Check for .env file in the environment directory
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Environment file not found at $ENV_FILE" >&2
  exit 1
fi

copy_env() {
  local target=$1
  local dir
  dir=$(dirname "$target")
  mkdir -p "$dir"
  cp "$ENV_FILE" "$target"
  # Ensure permissions are correct
  chmod 600 "$target"
  if [ "$(id -u)" -eq 0 ]; then
      chown "$USER:$GROUP" "$target"
  fi
  echo "Placed env at $target"
}

# Copy .env to required locations
copy_env "$PROJECT_ROOT/frontend/.env"
copy_env "$PROJECT_ROOT/bot/.env"
copy_env "$PROJECT_ROOT/.env"

# Determine docker compose command
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose is required" >&2
  exit 1
fi

# Pull latest changes (assuming git is initialized)
echo "Pulling latest code..."
git pull || echo "Git pull failed or not a git repo, continuing..."

# Fix permissions if running as root
if [ "$(id -u)" -eq 0 ]; then
    echo "Fixing permissions for $PROJECT_ROOT..."
    chown -R "$USER:$GROUP" "$PROJECT_ROOT"
fi

# Build and start services
echo "Building and starting services..."
"${COMPOSE[@]}" down --remove-orphans
"${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d

echo "Deployment finished successfully."
