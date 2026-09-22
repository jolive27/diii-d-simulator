# Start here

This is the quickest way to get the simulator running and find your way around the repo.

## Run it

You need Node 22.13 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL it prints, then:

1. Use the sliders to set current, field, heating, fueling, elongation, and triangularity.
2. Click **Run virtual shot**. Changing a slider does not change a finished shot, you have to run again.
3. Drag the time slider or click **Play shot** to follow the discharge and its equilibrium.
4. Click **Export shot** to save the program, traces, assumptions, and the selected equilibrium as JSON.

The baseline starts with an already formed plasma. Heating runs from 1 to 4 seconds. Shape is held fixed during a shot but you can change it between runs.

Some slider combinations fall outside what the reduced model supports. The app tells you when that happens. It means the model gave up, not that DIII-D could not run there. There is no disruption or stability model.

## The verification dashboard

Click **Physics validation** in the header, or go to `/validation`. It shows a saved validation snapshot and links to the full report. It does not run any development agents and there is nothing AI-driven in the site.

## Finding things

| What you want | Where it is |
|---|---|
| Agent roles and what each one is allowed to touch | [agents](agents/) |
| Equations, constants, and assumptions | [science](science/) |
| Approved specs and change requests | [specs](specs/) |
| Independent test results and milestone decisions | [validation](validation/) |
| Frozen baselines and the development record | [experiments](experiments/) |
| The rules for any development session | [AGENTS.md](AGENTS.md) |
| The callable simulator API | [docs/API.md](docs/API.md) |

The development agents are separate from the website. Their role files and records stay in the repo between sessions, but nothing runs in the background.

## Which model for what

Sonnet for infrastructure, routine implementation, and running tests. Opus for deriving or revising physics, chasing an unexplained convergence or conservation failure, comparing equilibria, designing radial transport, independent validation, and Director sign-off. Haiku for cheap research and review passes. A bigger model is not a substitute for independent evidence or the acceptance gates, and the Director should say why before changing the lane.

## Where things stand

Milestone 2 is accepted; **MILESTONE-02-RESULTS.md** has the results and what they do and do not show. Milestone 3 is in progress through TeamFlow, one unit at a time. The C1 sweep harness and the D2 1-D profiles are accepted, with the D2 release step pending. `docs/CONTEXT-HANDOFF.md` is the current working state.

## Adding physics

Read **science/NEW-PHYSICS-REQUIREMENTS.md** first. Every new capability needs a verification test, an experimental validation plan, an uncertainty model, a domain of validity, and a comparison against a reference implementation where one exists. The dashboard groups checks and shows the main numbers first, with the detailed evidence expandable underneath.
