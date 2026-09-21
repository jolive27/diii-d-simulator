# TeamFlow manual assignment

- unit: ide-workflow
- stage: research
- role: research
- model: claude-sonnet-4.6
- responsibility: cheap domain research subagent, reference comparison pathway

## Task

Document the exact steps a human takes to run TeamFlow role tasks (physics/software/validation) inside Copilot and Cline, including which model to pick in each tool and how to report the handoff back.

## Constraints

- Read `AGENTS.md` and the role contract for `agents/research.md` first.
- Work within these allowed output paths only: `["specs/proposals/","science/proposals/"]`.
- Never accept milestones, alter permissions, or edit validation evidence.
- Return a handoff with: files changed, commands run and outputs, limits, open concerns.

## How to report back

Run this from the repo root, supplying the artifacts and handoff report:

```
node tools/teamflow.mjs complete ide-workflow research research --files <artifact> --report "<handoff text>"
```

After that, direct audited stages need a Jev audit:

```
node tools/teamflow.mjs eval ide-workflow research
```

(Backend: manual — Copilot free tier; IDE-locked)
