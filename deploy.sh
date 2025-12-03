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

ENV_SOURCE=${ENV_SOURCE:-/home/vectode/vectobeat_env/.env.production}

if [ ! -f "$ENV_SOURCE" ]; then
  echo "Missing env source file: $ENV_SOURCE" >&2
  exit 1
fi

copy_env() {
  local target=$1
  local dir
  dir=$(dirname "$target")
  mkdir -p "$dir"
  cp "$ENV_SOURCE" "$target"
  chmod 600 "$target"
  echo "Placed env at $target"
}

copy_env "$PROJECT_ROOT/frontend/.env"
copy_env "$PROJECT_ROOT/bot/.env"

"${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d --remove-orphans
"${COMPOSE[@]}" ps
