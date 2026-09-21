# dash/ — SUPERSEDED

This Streamlit experiment is retired. The workspace now uses opencode-native surfaces instead:

- **Prompting / work** — the OpenCode Desktop app (the TUI/web UI you already run). CLI also available: `opencode`, `opencode web`, `opencode run "..."`
- **Dashboard / telemetry** — the `opencode-stats-engine` plugin: local SQLite, Vue dashboard at `http://127.0.0.1:11133`
- **Built-in usage stats** — `opencode stats` (token/cost), `opencode session`, `opencode export`
- **Your governance layer (keep)** — `tools/dispatch-agent.mjs`, `tools/workflow.mjs`, Jev (`jev` tool / `python/d3gate/jev.py`) stay as terminal-facing tooling. No LLM/agent orchestration lives inside any web app.

## Files kept for reference

- `app.py` — generalized dashboard: Sessions/Models/Usage, Jev usage ledger, watch roots, Console tab (harnessed agent / workflow gate / shell)
- `console.py` — background-run manager for the Console tab (process groups, killpg, JSONL ledger)
- `config.json` — data source pointers (opencode.db, jev-usage.jsonl, console.jsonl)

## Uninstall (optional)

```bash
cd /Users/johnoliver/Documents/Default Project/diii-d-simulator
rm -rf .venv-dash                       # python env used to run it
# keep config.json / ledgers? they also live at ~/.local/share/opencode/*.jsonl
```

## Scale-up path (if you ever need hosted dashboards)

opencode has built-in OpenTelemetry export (no plugin needed — `opencode-plugin-otel` was unpublished from npm). Simply set the OTLP env vars in `~/.config/opencode/opencode.jsonc`:

```jsonc
"env": {
  "OTEL_EXPORTER_OTLP_ENDPOINT": "<your-otlp-endpoint>",
  "OTEL_EXPORTER_OTLP_HEADERS": "<auth>"
}
```

Point that at Grafana Cloud / SigNoz / Datadog and use their prebuilt "OpenCode"-style dashboards.