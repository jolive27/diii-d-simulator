# TeamFlow — engineering-team workflow engine

Director-operated engine that runs the DIII-D governance contract as an
engineering team: **Director (big-pickle) brainstorms and signs off; other models
act as agents/subagents; Jev is the evaluator/auditor.**

Overrides nothing in `AGENTS.md`, it executes the contract. The first-phase
dispatcher (`tools/dispatch-agent.mjs`) is retired and kept only for its `allowed()`
helper. All agent lanes run via Claude Code (subscription); no local Ollama.

## Roles → models

| Role | Model | Backend | Stage usage |
|---|---|---|---|
| director | `claude-opus` | claude (Claude Code) | intake, design-review, gate, accept, release, retro |
| physics | `claude-sonnet` | claude (Claude Code) | research, spec |
| software | `claude-sonnet` | claude (Claude Code) | implement |
| validation | `claude-opus` | claude (Claude Code) | validate — must differ from software model (opus vs sonnet) |
| research | `claude-haiku` | claude (Claude Code) | subagent under physics |
| reviewer | `claude-haiku` | claude (Claude Code) | self-review, design-review subagent |
| auditor | `jev-latest` | jev API | every eval gate + compaction audit |

Override any assignment at runtime: `assign ... --model <id>` / `complete ... --model <id>`.
The recorded model is what feeds the validation-independence guard.

## Lifecycle

```
intake → research → spec → design-review → implement → self-review → validate → gate → accept → release → retro
```

- `assign` dispatches reachable backends (claude runs headless immediately; manual writes a
  brief under `experiments/teamflow/briefs/` for the IDE).
- `complete` records artifacts (permission-checked against `agents/permissions.json`)
  and the required handoff report.
- `eval` runs the Jev audit — see batching below.
- `gate` enforces: all prior stages done + audited + PASS, artifacts in-scope,
  validation model ≠ software model.
- `accept` (Director only) records the decision after a passing gate.
- `compact` drafts a context compression that Jev audits for faithfulness,
  sufficiency, and concision.

## Commands

```bash
node tools/teamflow.mjs init <unit> [--title T] [--kind K] [--director M]
node tools/teamflow.mjs assign <unit> <stage> <role> <task...> [--model M]
node tools/teamflow.mjs complete <unit> <stage> --files a,b [--report "..."] [--role R] [--model M]
node tools/teamflow.mjs eval <unit> <stage|all> [--model M]     # batched Jev audit
node tools/teamflow.mjs evals <unit>                            # recorded audits
node tools/teamflow.mjs compact <unit> [--summary "..."] [--draft-by ROLE]
node tools/teamflow.mjs gate <unit>                             # exit 0 = PASS
node tools/teamflow.mjs accept <unit>                           # Director sign-off
node tools/teamflow.mjs release <unit>
node tools/teamflow.mjs retro <unit> --notes "..."
node tools/teamflow.mjs status [unit]
node tools/teamflow.mjs models
node tools/teamflow.mjs selftest                                # offline, 8 checks
```

## Jev contract (non-negotiable)

- **All questions go in ONE call over ONE state.** `eval <unit> all` audits every
  stage in a single `/v1/systemone` request (12 questions across 9 stages).
- Audit payloads embed the actual artifact content (bounded) so verdicts are
  grounded in evidence, not file paths.
- Answers are typed: `noul` → `{ noul: probability }`, `score` → value,
  `choice` → per-option probabilities; `numeric()` normalizes them.
- Jev never acts as a conversational agent — it only evaluates batched calls and
  audits compactions.
- Usage is appended to `~/.local/share/opencode/jev-usage.jsonl` on every call.

## Architecture

- `registries.json` — stages, roles→models, model catalog (backend/reachable/notes),
  eval templates with per-question `min` thresholds.
- `jev.mjs` — batched client, key resolution, ledger.
- `backends.mjs` — `claude` / `opencode` / `manual` executors; brief generation;
  command detection. The retired `codex` backend name returns an error.
- `state.mjs` — unit state in `experiments/teamflow/units/`, decisions, ledger.
- `gates.mjs` — digest, evidence-embedded batched audits, compaction audit,
  structural `gateCheck`.
- `teamflow.mjs` — CLI entry point.
- `agents/permissions.json` — role file scopes enforced at `complete` and `gate`.

## Governance alignment

- Director authority, artiffacts by hash identity (`agentId`: `big-pickle`),
  worker roles never sign off — matching `agents/*.md` and `tools/workflow.mjs`.
- Out-of-lane file writes are rejected mechanically; independence is enforced for
  validation.
- Evidence-bound reports and freshness checks remain the baseline; old
  `workflow.mjs` gate artifacts that hard-require retired first-phase agent identities
  are read-only.