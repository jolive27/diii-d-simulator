# CONTEXT HANDOFF — as of 2026-09-21 (evening)

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
- Repo: diii-d-simulator (git, branch main). Tree clean at handoff (2026-09-21).

## TeamFlow (`tools/teamflow/`)
`node tools/teamflow/teamflow.mjs init|assign|complete|eval|evals|compact|gate|accept|release|retro|status|models|selftest`
- `eval <unit> all` = ONE Jev call over ONE state. `gate` enforces order, scopes, audits, model independence. `accept` marks gate+accept done, signs as `claude-opus`.
- Fixed 2026-09-21: `status` crash on `*.rubric.json` sidecars; `evals` crash on FAIL rows; choice answers (`{choice:"opt",confidence}`) now parsed in `jev.mjs`. Selftest 8/8.

## ACTIVE UNIT — d2-profiles (M03 D2, 1-D radial transport + profile evolution)
Resume with: `node tools/teamflow/teamflow.mjs status d2-profiles`. Next stage: **design-review** (owner director, role reviewer=claude-haiku).
- intake DONE/PASS; research DONE/PASS (haiku, 5 passes, rubric: provenance/fixtures/scope); spec DONE/PASS (sonnet Part A + Part B + fix-up; 0.94/0.97/0.84/0.85/0.97).
- Artifacts: `specs/proposals/d2-profiles.md` (+ -verification, -validation-plan, -uncertainty, -validity, -reference .md, -reference.json, -change-request-DRAFT.json).
- Director decisions DD-1..DD-11 in `experiments/records/d2-profiles-design-decisions.json` — binding (passenger design; off-path bit-for-bit 0.1.0; TS only, Python parity deferred; AC-5 1e-3 + rate check; physics 0.2.0 / verification 0.3.0; edge-flux closure default).
- Per-unit Jev rubric: `experiments/teamflow/units/d2-profiles.rubric.json` (research + spec). Add a design-review rubric before that stage (criteria_quantified + change-request approval readiness + implementability).
- Design-review to-do: Director approves/amends the change-request DRAFT (moves to specs/change-requests/ as APPROVED with hash binding), haiku reviewer checks spec vs rubric, then `complete` + `eval`. Then implement on claude-sonnet (physics/, tests/, docs/ only; python untouched per DD-3), self-review haiku, validate claude-opus.
- Lane practice that worked: bounded brief naming exact files; require the lane to self-verify with the jev CLI before handoff; Director reads only what Jev flags; rubric questions written for the failure modes seen (provenance honesty was the big one).

## Units
- **c1-sweep-harness** (M03 C1, Python engine benchmark + sweep harness) — ACCEPTED 2026-09-19. Artifacts: `python/d3gate/sweep.py`, `specs/proposals/c1-sweep-harness.md`, `validation/evidence/c1-sweep-harness-falsification.json`.
- **ide-workflow** — CLOSED 2026-09-21 (Copilot/Cline integration no longer needed).
- **dryrun-lane** — throwaway, deleted after proving live dispatch.
- pyengine (`python/d3gate/`) accepted baseline; `dash/` retired — do not resurrect web dashboards or put LLM orchestration in the web app.

## Governance (AGENTS.md)
Director assigns/approves/accepts only; workers never sign off. No silent constant/spec changes (`specs/change-requests`). New physics needs the five-part package. Role scopes in `agents/permissions.json` enforced at `complete`/`gate`.

## Open risks
- Hosted simulator uses `@openai/sites-vite-plugin` + `.openai/hosting.json` (OpenAI Sites). Without an OpenAI account the hosted copy likely cannot be updated; local app unaffected. Separate decision pending.
- All work through commit c0b2b39 (2026-09-21) is committed; tree clean at handoff.

## Tooling facts learned today
- Lane timeout: `TEAMFLOW_LANE_TIMEOUT_MS` (default 30 min); exit 143 = killed by it — split big tasks (Part A/Part B worked).
- `assign`: flags may go anywhere; run transcripts are timestamped under `experiments/teamflow/runs/`.
- Jev size limit ~30–40k input tokens (`400 max_tokens_exceeded`); TeamFlow eval and `jev review` halve-and-retry automatically. `jev review --require approve && git commit` blocks commits on revise/reject.
- Jev spend is NOT to be minimised (user decision): lanes re-checking after each edit is wanted.
- Bash tool 10-min cap: run long lane dispatches with run_in_background.

## Next steps
1. Design-review stage for d2-profiles (see ACTIVE UNIT).
2. Implement on sonnet → self-review haiku → validate opus → `eval d2-profiles all` → gate → accept.
3. Parked: hosting replacement for the OpenAI Sites deployment; Python profile parity unit after D2.
