#!/bin/zsh
cd "$(dirname "$0")"
export PATH="/Users/johnoliver/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/johnoliver/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
if ! command -v pnpm >/dev/null; then
  echo 'The Node/pnpm runtime is unavailable. Open this folder in Codex to restore it.'
  read -k 1
  exit 1
fi
mkdir -p work
pnpm dev --port 3133 > work/local-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null' EXIT INT TERM
for attempt in {1..60}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat work/local-server.log
    exit 1
  fi
  if curl -fsS -o /dev/null http://localhost:3133/; then
    open http://localhost:3133/
    echo 'Simulator opened. Keep this window open; press Control-C to stop.'
    wait "$server_pid"
    exit $?
  fi
  sleep 1
done
echo 'Startup took longer than expected. See work/local-server.log.'
exit 1
