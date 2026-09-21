# CONTEXT HANDOFF — as of 2026-09-21 (night; d2-profiles ACCEPTED, release pending)

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

## ACTIVE UNIT — d2-profiles (M03 D2, 1-D radial transport + profile evolution) — ACCEPTED 2026-09-21
Resume with: `node tools/teamflow/teamflow.mjs status d2-profiles`. Stages intake..accept all done, every stage Jev PASS; DECISION ACCEPTED (Director claude-opus, `accept --formal`). Next: **release** then **retro**.
- Release (Director, science/ is Director-only at release per DD-15): append to `science/model_versions.json` the capability entries {physics 0.2.0, spec specs/proposals/d2-profiles.md, changeRequest specs/change-requests/D2-PROFILES-001.json} and {verification 0.3.0, spec specs/proposals/d2-profiles-verification.md}; top-level physicsModelVersion stays 0.1.0 (DD-11); refresh the engine.ts SHA cited in `science/constants.json` (DD-23); register A-D2-001..008 and C-D2-* IDs in the science registries (change request approvedNewAssumptionIds / approvedNewConstants); consider stopping tests from rewriting `tests/d2/evidence/*.json` timestamps in place; then `node tools/teamflow/teamflow.mjs release d2-profiles`, `retro d2-profiles --notes "..."`, commit with the Jev gate, push.
- Evidence summary: TS engine profile-off bit-for-bit 0.1.0 (0 differences, 179886 fields); parity 9.6e-11 floored / 1.1e-9 un-floored worst (DD-24); ledger 7.6e-13, 8 mutations rejected (bremsstrahlung 2.12x marginal); fixtures 3.3e-13 / 7.57e-5 / 3.82e-4 / 2.15e-5; 31 rates in band; sweep 138 runs, 31 corner stops with exact grammar, shown a model limit (ADV-3). Capability remains experimentally unvalidated (plan only).
- Decisions DD-1..DD-27 in `experiments/records/d2-profiles-design-decisions.json`; change request APPROVED with three re-approvals (hash-bound). Validation harness `validation/independent/d2-profiles.mjs`, evidence `validation/evidence/d2-profiles-falsification.json`.
- Follow-up units parked: Python profile parity (DD-3); app display of the profiles block (spec s10 item 5); hosting replacement for OpenAI Sites.

## Lessons from design-review (2026-09-21)
- Rubric questions must be per-area, not "is EVERY item X" over ~20 items: a calibrated evaluator caps a 20-way conjunction near 0.5 even when each item scores 0.85+. Per-item diagnostic batches via `jev eval --state-file --questions-file` localise failures cheaply.
- TeamFlow eval now allocates the state budget proportionally to file size (`tools/teamflow/gates.mjs`); equal split had hidden the spec's acceptance-criteria section. Ledger `~/.local/share/opencode/jev-usage.jsonl` shows state_chars/input_tokens per call to confirm nothing was halved (~87k chars ≈ 29k tokens is the practical ceiling).
- Jev reads "planned", "assigned by", "Director should confirm", "Open for", "proposed*" keys in an APPROVED document as open markers; grep for them before an approval audit.
- Haiku reviewer lanes report PASS optimistically (missed two open-item markers); keep the Jev stage audit as the gate.
- `eval <unit> all` now audits only done stages (was overwriting full-context PASS records with a truncated nine-stage batch and auditing pending gate/accept). A past stage's record certifies its artifacts at handoff; later Director amendments are gated at their own stage (DD-27).

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
1. d2-profiles release + retro (see ACTIVE UNIT).
3. Parked: hosting replacement for the OpenAI Sites deployment; Python profile parity unit after D2.
