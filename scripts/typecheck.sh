#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd -- "${SCRIPT_DIR}/../bot" && pwd)"

if ! command -v pyright >/dev/null 2>&1; then
  echo "pyright executable not found. Please npm install -g pyright or add it to PATH." >&2
  exit 127
fi

pyright "${@:-${BOT_DIR}/src}"
