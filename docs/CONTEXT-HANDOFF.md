# CONTEXT HANDOFF — as of 2026-09-21 (night; validate Part B in flight)

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
Resume with: `node tools/teamflow/teamflow.mjs status d2-profiles`. Stage: **validate** (claude-opus), Part A done, Part B was running at shutdown (2026-09-21 ~22:00).
- DONE + committed + pushed (GitHub main 5fca848 or later): intake, research, spec, design-review (Jev 8/8), implement (Jev 5/5, code commit d68ed6e), self-review (haiku, zero defects, Jev 2/2). Validation Part A Director review: DD-24..DD-26 recorded, change request re-approved, hashes rebound.
- **Validation Part A (opus)** result: AC-1/2/4/8/9 pass; AC-3 and AC-7(b) failed on measurement definition, ruled by DD-24 (parity normaliser max(X(t),X(0))) and DD-25 (roundoff floor for reconstructed zero flux); marginal: bremsstrahlung mutation ratio 2.12x, F3 edge flux. Transcript `experiments/teamflow/runs/d2-profiles-validate-validation-2026-09-21T21-41-59-518Z.out.txt`. Its files `validation/independent/d2-profiles.mjs`, `validation/evidence/d2-profiles/`, `validation/evidence/d2-profiles-falsification.json` are UNCOMMITTED (Part B was editing them).
- **Validation Part B (opus)**: AC-5 fixtures, AC-6 rates, 3+ adversarial cases, re-verdict AC-3/AC-7 under DD-24/25, finalise falsification.json. The brief is stored in `experiments/teamflow/units/d2-profiles.json` under tasks.validate. If the run was killed: check `ls -t experiments/teamflow/runs/d2-profiles-validate-validation-*.out.txt` for a second transcript; if none or partial, `git status` the validation/ files, then re-dispatch the same brief with nohup (see Tooling facts) and wait with the pgrep loop.
- After Part B: `complete d2-profiles validate --files validation/evidence/d2-profiles-falsification.json,validation/independent/d2-profiles.mjs --model claude-opus --report "..."` → `eval d2-profiles validate` (rubric: ac10_reexecution, adversarial_cases, falsification_honest, model_independence) → `eval d2-profiles all` → `gate` → `accept` → release: Director writes `science/model_versions.json` entries (physics 0.2.0 / verification 0.3.0 capability entry, top-level stays 0.1.0, DD-11/15), refreshes the engine.ts SHA cited in `science/constants.json` (DD-23), considers making the tests stop regenerating `tests/d2/evidence/*.json` timestamps in place (noisy diffs). Commit each stage with the Jev gate (`jev review --require approve`, or `jev eval` over `git diff --cached` when the tree holds in-flight lane work) and push.
- Decisions DD-1..DD-26 in `experiments/records/d2-profiles-design-decisions.json` are binding; change request `specs/change-requests/D2-PROFILES-001.json` APPROVED, hash-bound (re-approvals listed inside).

## Lessons from design-review (2026-09-21)
- Rubric questions must be per-area, not "is EVERY item X" over ~20 items: a calibrated evaluator caps a 20-way conjunction near 0.5 even when each item scores 0.85+. Per-item diagnostic batches via `jev eval --state-file --questions-file` localise failures cheaply.
- TeamFlow eval now allocates the state budget proportionally to file size (`tools/teamflow/gates.mjs`); equal split had hidden the spec's acceptance-criteria section. Ledger `~/.local/share/opencode/jev-usage.jsonl` shows state_chars/input_tokens per call to confirm nothing was halved (~87k chars ≈ 29k tokens is the practical ceiling).
- Jev reads "planned", "assigned by", "Director should confirm", "Open for", "proposed*" keys in an APPROVED document as open markers; grep for them before an approval audit.
- Haiku reviewer lanes report PASS optimistically (missed two open-item markers); keep the Jev stage audit as the gate.

## Units
- **c1-sweep-harness** (M03 C1, Python engine benchmark + sweep harness) — ACCEPTED 2026-09-19. Artifacts: `python/d3gate/sweep.py`, `specs/proposals/c1-sweep-harness.md`, `validation/evidence/c1-sweep-harness-falsification.json`.
- **ide-workflow** — CLOSED 2026-09-21 (Copilot/Cline integration no longer needed).
- **dryrun-lane** — throwaway, deleted after proving live dispatch.
- pyengine (`python/d3gate/`) accepted baseline; `dash/` retired — do not resurrect web dashboards or put LLM orchestration in the web app.

## Governance (AGENTS.md)
Director assigns/approves/accepts only; workers never sign off. No silent constant/spec changes (`specs/change-requests`). New physics needs the five-part package. Role scopes in `agents/permissions.json` enforced at `complete`/`gate`.

## Open risks
- Hosted simulator uses `@openai/sites-vite-plugin` + `.openai/hosting.json` (OpenAI Sites). Without an OpenAI account the hosted copy likely cannot be updated; local app unaffected. Separate decision pending.
- All design-review work committed 2026-09-21 (see git log); tree clean at handoff.

## Tooling facts learned today
- Lane timeout: `TEAMFLOW_LANE_TIMEOUT_MS` (default 30 min); exit 143 = killed by it — split big tasks (Part A/Part B worked). Dispatch long lanes with `nohup node tools/teamflow/teamflow.mjs assign ... > experiments/teamflow/runs/<unit>-<stage>.dispatch.log 2>&1 &` — a lane started inside the Bash tool is killed by the tool's 10-min cap even with run_in_background. Wait with a background `until ! pgrep -f 'claude -p ...'` loop.
- `jev review` audits the whole working diff; to gate a partial commit, audit `git diff --cached` with `jev eval --state-file`.
- `assign`: flags may go anywhere; run transcripts are timestamped under `experiments/teamflow/runs/`.
- Jev size limit ~30–40k input tokens (`400 max_tokens_exceeded`); TeamFlow eval and `jev review` halve-and-retry automatically. `jev review --require approve && git commit` blocks commits on revise/reject.
- Jev spend is NOT to be minimised (user decision): lanes re-checking after each edit is wanted.
- Bash tool 10-min cap: run long lane dispatches with run_in_background.

## Next steps
1. d2-profiles: finish validate Part B (see ACTIVE UNIT) → eval validate → eval all → gate → accept → release.
3. Parked: hosting replacement for the OpenAI Sites deployment; Python profile parity unit after D2.
