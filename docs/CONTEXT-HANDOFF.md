# CONTEXT HANDOFF — as of 2026-09-18

## Prompt to paste into the new session
See the block at the bottom of this file; or just say:
"Read docs/CONTEXT-HANDOFF.md and restore my working state."

## Environment / stack
- macOS, zsh. Repo: diii-d-simulator (git). JS/Node 24.20.0. opencode CLI 1.18.31.
- opencode = session host. **big-pickle = Director**: brainstorming model + sole sign-off authority.
- **No Codex/gpt-6-astra anymore** (dropped). Formal role seats run on other models:
  - Physics / Software: **DeepSeek V4.1** (Cline sidebar, free; `manual` backend — runs via IDE brief)
  - Validation: **granite4.1:8b** (Ollama) or Copilot model — **must differ from software's model**
  - Research / reviewer subagents: **granite4.1:8b** / **qwen3.5:4b** (Ollama, auto-run from shell)
  - Copilot free (manual): claude-sonnet-4.6, gpt-5.6-terra, claude-haiku-4.5
  - Auditor: **Jev** (`jev-latest`) — evaluation API, never a conversational agent
- Jev key: `~/.config/opencode/.secrets/jev.key` (also `$JEV_API_KEY`). Ledger: `~/.local/share/opencode/jev-usage.jsonl`.
- Ollama 0.33.3, models installed: granite4.1:8b, qwen3.5:4b.
- VS Code 1.138.0, extensions: Cline 4.1.19, official sst-dev.opencode 0.0.13, varro 0.29.3, jev-gate 0.1.0, bierner.markdown-mermaid 1.32.1 (needs reload to render), multi-command, runonsave, sqlite-viewer.

## This session (2026-09-18): TeamFlow engine built and live-proven
`tools/teamflow/`:
- `registries.json` — stages, roles→models, model catalog, Jev eval templates with `min` thresholds
- `jev.mjs` — batched client (single call / one state), ledger appends
- `backends.mjs` — ollama (auto) / opencode / manual (IDE brief); codex → dormant error
- `state.mjs` — unit state `experiments/teamflow/units/`, decisions, ledger
- `gates.mjs` — digest + **artifact-content-embedded batched audits**, compaction audit, `gateCheck`
- `teamflow.mjs` — CLI (init/assign/complete/eval/evals/compact/gate/accept/release/retro/status/models/selftest)
- `README.md`, `workflow.md` (simple mermaid flow), `workflow.mmd`

Proven live (real Jev):
- `eval <unit> all` = ONE Jev call over ONE state, 12 questions across 9 stages, partitioned verdicts (the batching rule).
- Jev answer shape: `{ type:"noul", noul: 0.37 }` → normalized by `numeric()`.
- Audits embed artifact content (bounded) so verdicts judge evidence; research verdict flipped 0.1→0.95 after grounding.
- `node tools/teamflow.mjs selftest` → 8/8 pass (mock, offline).

Live unit: **ide-workflow** ("Copilot + Cline integration into TeamFlow")
- research stage DONE + audited PASS (Jev 0.95). Artifact: `specs/proposals/teamflow-integration.md` (role→model map, round-trip, guardrails, reference pathway).
- Remaining stages pending: spec → design-review → implement → self-review → validate → gate → accept.
- Status anytime: `node tools/teamflow/teamflow.mjs status` (or `status ide-workflow`).

## Prior session recap (governance setup)
- pyengine (python/d3gate/) accepted baseline; Jev governance, disk cleanup (~40GiB freed), used jev-gate extension + batched `jev` tool in opencode.
- Retired the Streamlit dashboard (`dash/`); **do not build web dashboards or resurrect dash**; no LLM orchestration in any web app.
- opencode-stats-engine plugin configured (~/.config/opencode/opencode.jsonc), dashboard http://127.0.0.1:11133 after desktop restart.
- VS Code stack installed (Cline, official opencode ext, varro, jev-gate, tooling extensions).

## Governance (honor, from AGENTS.md)
- Director (big-pickle) assigns, approves, integrates, accepts only. Workers never sign off.
- No silent constant/spec changes; `specs/change-requests` with old/new/model/Director approval.
- New physics: five-part package (verification, validation plan, uncertainty, domain, reference pathway); capability classification; hashes; independent review. Plans ≠ completed validation.
- `agents/permissions.json` scopes every role; enforced at `complete` + `gate`.
- Only Director import/approve; Jev independent (batched only).

## Snapshot daemon
- `~/.local/share/opencode/session-snapshot.mjs` running (every 2 min) → `~/.local/share/opencode/session-snapshots/{latest.md, <session>-*.md}`. Restart it after reboot if needed:
  `nohup node ~/.local/share/opencode/session-snapshot.mjs >> ~/.local/share/opencode/session-snapshots-daemon.log 2>&1 &`

## Next steps (nominal)
1. Reload window after restart so markdown-mermaid renders workflow.md (⌘⇧V) — the thing that started this restart.
2. Continue ide-workflow: run physics spec on it via a real brief (DeepSeek V4.1 in Cline) or migrate to a real milestone task.
3. Optionally: wall-clock `while` status view next to the terminal.
4. Keep everything batched through Jev; never per-call.