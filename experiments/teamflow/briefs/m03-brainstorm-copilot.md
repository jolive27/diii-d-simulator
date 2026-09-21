# TeamFlow brainstorm brief — Copilot (Claude Sonnet 4.6)

- unit: m03-brainstorm
- model: claude-sonnet-4.6 (Copilot / VS Code LM provider)
- role: physics/software brainstorm
- responsibility: independent M03 candidate objectives for the DIII-D Virtual Shot simulator

## Task

Recommend **exactly 3 candidate objectives** for Milestone 3, grounded in the current repo
state. For each: (1) name, (2) one-sentence rationale, (3) biggest scientific/educational
payoff, (4) the single hardest gate/risk, (5) `physics` (physicsCapabilityChange, needs
5-part package) or `engineering`.

## Current state (read these first)

- M01 baseline TypeScript engine (0-D thermal + fixed-boundary Grad-Shafranov), physics
  model 0.1.0, frozen at commit `b075378`; `experiments/baseline/m01-shot.json`.
- M02 numerical verification **ACCEPTED** (analytic Solov'ev rectangle fixture at
  `specs/proposals/m02.md`, conserved ledgers, stability guards, regression).
- **pyengine ACCEPTED**: NumPy port `python/d3gate/engine.py` matches the TS engine within
  1e-9/1e-6 budgets; all 10 `PYENGINE-*` checks PASS; spec `specs/pyengine.json`.
- Domain exclusions today (`specs/proposals/pyengine-validity.md`): profile evolution,
  free-boundary/X-point/divertor, MHD stability/disruptions, impurities, fusion yield,
  two-temperature, facility ops.
- Capability policy (`science/capability-policy.json`): any new physics needs verification
  + experimental validation plan + uncertainty model + validity domain + reference
  comparison; no shorthand.
- Web app displays numerical simulation only (no LLM/agent orchestration inside).
- Governance: Director approves; use `specs/change-requests/` for changes.

## Constraints

- Brainstorm only — produce a proposal document, do not modify production code or specs.
- Prefer objectives that leverage the accepted Python engine.
- Output to `experiments/teamflow/briefs/` or `specs/proposals/m03-brainstorm-*.md`.

## How to report back

Return a handoff with: the 3 candidates, commands run, limits, open concerns. Fits in one
message; no engine `complete` needed for this brainstorm.