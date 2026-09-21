# TeamFlow — Copilot + Cline integration proposal

Proposal (research stage deliverable, unit `ide-workflow`). Drafted by the Director
(`big-pickle`); planned execution model was `claude-sonnet-4.6` (manual, Copilot).
Scope: how humans run TeamFlow role tasks inside Copilot and Cline and report back.

## Two execution rails

| Rail | Backend | When | Who runs it |
|---|---|---|---|
| Automated | `ollama` (granite4.1:8b, qwen3.5:4b) | research, reviewer | the engine, directly from the shell |
| Manual | `manual` (DeepSeek V4.1, Claude Sonnet 4.6, GPT-5.6 Terra) | physics, software, validation | a human in Cline, using the Copilot/DeepSeek dropdown |

`manual` is not "manual forever" — it means the model is reachable only inside the
IDE (Cline sidebar: DeepSeek V4.1 free, Copilot models via the VS Code LM provider),
so the workflow hands off a brief and waits for the handoff.

## Which model to pick where

- **physics / software**: `deepseek-v4.1` in Cline (strongest reasoning). Alternates:
  `claude-sonnet-4.6`, `gpt-5.6-terra` (Copilot free). Set via
  `assign ... --model <id>`.
- **research / reviewer**: automatic — `granite4.1:8b` and `qwen3.5:4b` via Ollama;
  no IDE step.
- **validation**: pick a model **different from the implementation model**; the
  independence guard rejects same-model validation at `gate`.

## Round trip for a manual stage

```bash
# 1. Assign: writes a brief to experiments/teamflow/briefs/
node tools/teamflow.mjs assign <unit> <stage> <role> "task..." --model deepseek-v4.1

# 2. Open the brief, run the task in Cline (pick the model in the dropdown).

# 3. Report back with artifacts + handoff
node tools/teamflow.mjs complete <unit> <stage> --files <artifact> --report "handoff text"

# 4. Jev audits the stage in one batched call
node tools/teamflow.mjs eval <unit> <stage>
```

## Handoff report format (required)

Files changed · commands run and their outputs · pass/fail outcomes · limits ·
open concerns. Assertions without runnable evidence are flagged by the `tests_evidence`
noul question in Jev.

## Reference comparison pathway

Established references this workflow builds on (not re-invented):

- Role contracts: `agents/director.md`, `agents/physics.md`, `agents/software.md`,
  `agents/validation.md` — the role boundaries and approval ownership this design
  preserves.
- Gate mechanics: `tools/workflow.mjs` (hash-bound approval/acceptance, capability
  policy, science-lock, fingerprint staleness) — the integrity model TeamFlow's
  `gate` subcommand composes with.
- Isolated dispatch: `tools/dispatch-agent.mjs` (separate workspace, out-of-role
  refusal) — the prior execution rail; dormant because Codex/gpt-6-astra is no
  longer available, replaced by IDE-brief + Ollama rails with the same permission
  checks (`agents/permissions.json`).

Limits of the reference: the legacy rail cannot be executed today (no Codex CLI);
its *permission model* is retained and re-enforced, but its execution isolation is
not. No claim is made that any external implementation of "team workflow for agent
models" was consulted; the reference set is this repository's own audited tooling.

## Guardrails

- `agents/permissions.json` scopes every role; out-of-scope artifacts are rejected
  at `complete` and re-checked at `gate`.
- Jev audits are **batched**: all questions for a stage (or all stages via
  `eval <unit> all`) go in ONE call over ONE state.
- Validation model must differ from software model (independence).
- Milestones are accepted only by the Director (`big-pickle`) on top of a passing
  gate; no worker model signs off.

## Status & persistence

- `node tools/teamflow.mjs status` — live org view of all units.
- `node tools/teamflow.mjs compact <unit>` — Director drafts a compression, Jev
  audits faithfulness/sufficiency/concision, stored in state.
- State: `experiments/teamflow/units/<unit>.json`; decisions in `decisions/`;
  audit trail in `experiments/records/audit.jsonl` and `teamflow.jsonl`.