# CONTEXT HANDOFF — as of 2026-09-21

Say: "Read docs/CONTEXT-HANDOFF.md and restore my working state."

## Roles
- **Director / lead engineer: Claude Code (Opus)** — brainstorming, scope, design review, sign-off. Delegates bounded work to subagents (haiku: lookups/summaries; sonnet: specified implementation; opus: physics derivation, hard debugging, validation). Never delegates sign-off.
- Lanes (registry `tools/teamflow/registries.json`): physics/software = `claude-sonnet`, validation = `claude-opus` (must differ from software), research/reviewer = `claude-haiku`.
- **Auditor: Jev** (`jev-latest`) — batched typed-evaluation API, never a chat model. Independent of the Claude family; the main independence check now that all lanes are Claude.
- **No OpenAI access** (no Codex / GPT-6 Astra / gpt-5.6-terra). `tools/dispatch-agent.mjs` is dormant; `.codex/`, `.openai/` and old records are historical provenance.
- Copilot and Cline are not in use (registered with Jev, idle). opencode remains available with its own `jev` plugin.

## Jev everywhere (built 2026-09-21)
Single source `~/.config/jev/`:
- `core.mjs` client, `mcp.mjs` MCP server (`jev_evaluate`, `jev_review_diff`, `jev_usage`), `bin/jev` CLI (`jev eval|review|usage|template`, on PATH via `~/.local/bin/jev`).
- `SKILL.md` (skill `jev-verify`) and `AGENT-RULES.md` — symlinked into Claude Code (`~/.claude/CLAUDE.md` imports it), opencode, Copilot, Cline. Re-link after edits: `~/.config/jev/sync.sh`.
- Batching rule enforced in code: single-question calls refused unless `gate=true`. Ledger `~/.local/share/opencode/jev-usage.jsonl` now records `caller`.
- Key: `~/.config/opencode/.secrets/jev.key` or `$JEV_API_KEY`. Never print.
- `claude` on PATH via `~/.local/bin/claude` (wrapper to the VS Code extension binary) so TeamFlow's `claude` backend works from the shell.
- Claude Code permissions: `~/.claude/settings.json` allows Bash/edits without prompts; denies sudo, destructive rm/git, and secret reads.

## Environment
- macOS, zsh, Node 24.20.0, Python 3.12. VS Code with Claude Code 2.1.278, opencode ext, jev-gate ext.
- Repo: diii-d-simulator (git, branch main). Many files untracked since the M02 commit — review before committing.

## TeamFlow (`tools/teamflow/`)
`node tools/teamflow/teamflow.mjs init|assign|complete|eval|evals|compact|gate|accept|release|retro|status|models|selftest`
- `eval <unit> all` = ONE Jev call over ONE state. `gate` enforces order, scopes, audits, model independence. `accept` marks gate+accept done, signs as `claude-opus`.
- Fixed 2026-09-21: `status` crash on `*.rubric.json` sidecars; `evals` crash on FAIL rows; choice answers (`{choice:"opt",confidence}`) now parsed in `jev.mjs`. Selftest 8/8.

## Units
- **c1-sweep-harness** (M03 C1, Python engine benchmark + sweep harness) — ACCEPTED 2026-09-19. Artifacts: `python/d3gate/sweep.py`, `specs/proposals/c1-sweep-harness.md`, `validation/evidence/c1-sweep-harness-falsification.json`.
- **ide-workflow** — CLOSED 2026-09-21 (Copilot/Cline integration no longer needed).
- pyengine (`python/d3gate/`) accepted baseline; `dash/` retired — do not resurrect web dashboards or put LLM orchestration in the web app.

## Governance (AGENTS.md)
Director assigns/approves/accepts only; workers never sign off. No silent constant/spec changes (`specs/change-requests`). New physics needs the five-part package. Role scopes in `agents/permissions.json` enforced at `complete`/`gate`.

## Open risks
- Hosted simulator uses `@openai/sites-vite-plugin` + `.openai/hosting.json` (OpenAI Sites). Without an OpenAI account the hosted copy likely cannot be updated; local app unaffected. Separate decision pending.
- Uncommitted work: everything from the 2026-09-18/19/21 sessions. Commit in reviewed chunks.

## Next steps
1. Commit the governance/tooling changes (after a `jev review`).
2. Next M03 unit: `node tools/teamflow/teamflow.mjs init <unit> --title ... --kind physics|engineering`, then `assign` per stage.
3. Decide the hosting replacement for the OpenAI Sites deployment.
