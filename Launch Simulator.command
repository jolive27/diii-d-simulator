#!/bin/zsh
cd "$(dirname "$0")"
export PATH="/Users/johnoliver/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/johnoliver/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
if ! command -v pnpm >/dev/null; then
  echo 'The Node/pnpm runtime is unavailable. Open this folder in Codex to restore it.'
  read -k 1
  exit 1
fi
pnpm dev --open
