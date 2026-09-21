# TeamFlow manual assignment

- unit: c1-sweep-harness
- stage: research
- role: physics
- model: claude-sonnet-4.6
- responsibility: spec proposals, change requests, five-part scientific package

## Task

Produce specs/proposals/c1-sweep-harness.md (M03 C1): Python-engine benchmark + sweep harness operationalizing the accepted pyengine (python/d3gate) as the authoritative regression + sweep tool on frozen 0.1.0 physics. SHORT spec only (research+spec in one pass) — inspect python/d3gate/engine.py, python/tests/test_pyengine.py, specs/pyengine.json, specs/pyengine-validity.md, tools/run-shot.mjs. Define: (1) sweep driver CLI varying control/config inputs, running run_shot, writing per-shot DIGESTS (metrics + modelVersion + fingerprint) not full shots; (2) regression compare vs the TypeScript reference on the existing 1e-6 pointwise budget; (3) batched Jev gate at the end of every run — ONE API call over N digested shots using tools/teamflow/registries.json eval templates, never per-call; (4) --limit dry-run mode; (5) storage policy: full shots only when flagged. Physics stays frozen — no new assumptions, no constant changes. Include the embedded Jev noul/choice question set the harness will batch. Work only under specs/proposals/.

## Constraints

- Read `AGENTS.md` and the role contract for `agents/physics.md` first.
- Work within these allowed output paths only: `["specs/proposals/","science/proposals/"]`.
- Never accept milestones, alter permissions, or edit validation evidence.
- Return a handoff with: files changed, commands run and outputs, limits, open concerns.

## How to report back

Run this from the repo root, supplying the artifacts and handoff report:

```
node tools/teamflow.mjs complete c1-sweep-harness research physics --files <artifact> --report "<handoff text>"
```

After that, direct audited stages need a Jev audit:

```
node tools/teamflow.mjs eval c1-sweep-harness research
```

(Backend: manual — Copilot free tier; Director runs headless via tools/copilot-agent.mjs)
