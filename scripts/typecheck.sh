#!/usr/bin/env bash
set -euo pipefail
if ! command -v pyright >/dev/null 2>&1; then
  echo "pyright executable not found. Please npm install -g pyright or add it to PATH." >&2
  exit 127
fi
pyright "${@:-src}"
