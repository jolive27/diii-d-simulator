# Start here

Your simulator project is saved in the **DIII-D-Simulator** folder on your Desktop.

Use **Launch Simulator.command** for the current Desktop development version. **Open Hosted Simulator.webloc** opens the separately published version, which may be older; this phase updates your local Desktop project.

1. Open `Launch Simulator.command` to start the local simulator. Keep the Terminal window open.
2. Use the sliders to set current, field, heating, fueling, elongation, and triangularity.
3. Click **Run virtual shot**. Changed sliders do not affect an already completed shot until you run again.
4. Move the time slider or click **Play shot** to follow the discharge and its computed equilibrium.
5. Click **Export shot** to save the program, traces, assumptions, and selected equilibrium as JSON.

The baseline begins with an already formed plasma. Heating runs from 1–4 seconds. Shape is held fixed during a shot. You can change shape between runs.

Some combinations leave the reduced model's supported regime. The app displays a clear message; an unsupported equilibrium does not imply that DIII-D itself cannot operate there. No disruption or stability model is included.

The **docs** folder explains the architecture, equations, assumptions, checks, and original project brief. The **examples** folder contains the baseline synthetic result. The **physics** folder contains the independent numerical engine; the **app** folder contains the controls and plots.

## Find your project files

| What you want | Open this folder or file |
|---|---|
| Agent responsibilities | [agents](agents/) — Director, Physics, Software, Validation |
| Equations and assumptions | [science](science/) |
| Approved work and change requests | [specs](specs/) |
| Independent test results and milestone decisions | [validation](validation/) |
| Saved baseline and experiment history | [experiments](experiments/) |
| How another development session should continue | [AGENTS.md](AGENTS.md) |
| Callable simulator operations | [docs/API.md](docs/API.md) |

All of these live inside **Desktop → DIII-D-Simulator**. The development agents are separate from the simulator website. Their role files and records survive after an agent session ends; they are not continuously running background processes.

## Reasoning level

Use **GPT-6 Astra / Medium** for infrastructure, routine implementation and test execution. Consider **High** when deriving or revising physics, investigating unexplained convergence or conservation failures, comparing experimental equilibria, or designing radial transport. A higher setting is not a substitute for independent evidence or acceptance gates. The Director should flag the need before changing the requested setting.

## Open the verification dashboard

After starting **Launch Simulator.command**, click **Physics validation** in the simulator header, or double-click **Open Local Validation.webloc**. The dashboard displays a saved validation snapshot and links to its full report. It does not run development agents from the website.

## Current status

Milestone 02 is accepted. Read **MILESTONE-02-RESULTS.md** for the results, evidence and reasoning-level recommendation. Milestone 03 has not started.

## Requirements for future physics

Read **science/NEW-PHYSICS-REQUIREMENTS.md** for the mandatory verification, experimental validation, uncertainty, validity-domain and reference-comparison package. The report dashboard now groups checks and shows the main numerical results first; technical evidence remains expandable.
