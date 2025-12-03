#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose is required (install Docker with Compose v2 or docker-compose)" >&2
  exit 1
fi

if [ ! -f .env ] && [ -f .env.production ]; then
  cp .env.production .env
  echo "Created .env from .env.production"
fi

if [ ! -f .env ]; then
  echo "Missing .env file in ${PROJECT_ROOT}. Provide one or add .env.production to auto-copy." >&2
  exit 1
fi

"${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d --remove-orphans
"${COMPOSE[@]}" ps
