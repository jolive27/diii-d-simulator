# DIII-D Virtual Shot

A small, educational tokamak simulator loosely modeled on DIII-D. You set the plasma current, toroidal field, neutral beam and ECH heating, gas fueling, and plasma shape, and it runs a 5 second shot in the browser. It tracks the particle inventory, the electron and ion thermal energies, and solves a fixed-boundary equilibrium, then lets you play the shot back and export the results as JSON.

This is not an official DIII-D tool and it has not been checked against real shot data. It should not be used for shot planning, operations, safety decisions, disruption prediction, or any fusion gain claims. The numerical checks in this repo show that the equations are being solved correctly, not that they describe a real plasma.

## Where it stands

Milestone 1 is the working simulator, with a set of frozen regression cases so later changes can be compared against it.

Milestone 2 added the numerical verification: an analytic Solov'ev benchmark for the equilibrium solver, independent particle and energy ledgers with negative controls, time step and grid convergence studies, and the agent workflow described below. The independent reports and the acceptance decision are in `validation/`, and `MILESTONE-02-RESULTS.md` walks through the results and what they do and do not show.

Milestone 3 is in progress. So far it has a Python port of the engine (`python/d3gate/`) that reproduces the TypeScript engine bit for bit, a sweep and regression harness on top of it, and a 1-D radial profile layer (D2) that evolves density and electron and ion temperatures on a volume-normalized radius. The profile layer rides along with the 0-D balances and never feeds back into them, so with profiles off the output is unchanged from 0.1.0. D2 passed independent validation and was accepted on 2026-09-21; the release step that records it in the science registries is still pending, so `science/model_versions.json` still reads physics 0.1.0 and verification 0.2.0 until that lands.

One thing to know about the acceptance records: they are tied to hashes of the source and evidence. A saved PASS is a record of what passed at that commit, not a guarantee about the current checkout. Run the gate commands below to check the state you actually have.

## Running it

You need Git, Node 22.13 or newer, and pnpm. Keep the committed `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL it prints. The validation dashboard is at `/validation`. No API keys, private data, or facility access are needed.

To run the checks:

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
node tools/milestone-status.mjs
node tools/workflow.mjs gate m02
```

`pnpm start` serves the built site through local Wrangler. Some of the fine-grid checks are sensitive to floating-point cancellation and can differ slightly between runtimes. If you see a discrepancy, report it rather than loosening the tolerance.

## What is in the repo

```text
app/                       Simulator UI and validation dashboard
components/, hooks/, lib/  Shared UI components and helpers
physics/                   TypeScript engine, deterministic API, numerical benchmarks
python/                    Python engine port (d3gate), sweep harness and tests
agents/                    Persistent roles, permissions and workflow
science/                   Assumptions, constants, equations, model and validation registries
specs/                     Approved specs, proposals and physics change requests
tests/                     API, physics, regression and policy checks
validation/                Independent executors, evidence, reports and decisions
experiments/baseline/      Frozen synthetic M01 fixtures and provenance
experiments/records/       Assignments, audit trail and execution records
experiments/runs/          Local shot exports (new runs are gitignored)
examples/                  A curated synthetic baseline example
public/                    Static assets and saved dashboard data
tools/                     Gates, verification and export commands; tools/teamflow is the agent workflow runner
vscode-exts/               A small VS Code extension that gates commits on the auditor
docs/                      Architecture, physics, API, history and repo notes
dash/                      Retired local dashboard, kept for history
```

Some of these paths exist to keep imports, launch shortcuts, and the source fingerprints in the acceptance records stable, so please do not move them casually. `START-HERE.md` and `Project Guide.html` are the plain-language map.

## The physics

The engine in `physics/engine.ts` evolves a volume-averaged particle inventory and separate electron and ion thermal energies, driven by prescribed heating, fueling, and current, with simple transport closures. A finite-difference Grad-Shafranov solve gives a fixed-boundary equilibrium, coupled one way from the thermal pressure. The optional D2 layer adds 1-D diffusion of density and the two temperatures with uniform transport coefficients, constrained to match the 0-D totals. There is still no free-boundary or coil solve, no turbulence, no MHD stability, no disruptions, and no fusion yield, and none of it is calibrated to DIII-D data.

`physics/api.ts` exposes `run_shot`, `run_benchmark`, `parameter_sweep`, `get_metrics`, and `export_results`. None of them touch the browser, network, or filesystem. The details are in `docs/API.md`, `docs/PHYSICS.md`, `docs/ARCHITECTURE.md`, and `science/equations.md`.

## How development works

I built this with AI coding agents, and the main lesson was that agent-written code will happily grade its own homework. So the workflow splits the roles and does not let any one of them sign off on itself, and a separate auditor (Jev, a typed evaluation API from outside the model family doing the work) grades each stage's evidence against a rubric before it can advance. The runner for all of this is `tools/teamflow/`. Read `AGENTS.md` and `agents/README.md` before changing anything.

1. The Director assigns scope and records the task in `experiments/records`.
2. Physics writes the governing equations, assumptions, units, boundaries, and quantitative acceptance criteria. It cannot change production code.
3. The Director approves the spec and any explicit physics change request.
4. Software implements the approved spec and tests without quietly changing assumptions.
5. Independent Validation runs the checks against frozen source and records its own evidence hashes. It cannot fix production physics or approve its own work.
6. Only the Director runs acceptance, and only after every required gate passes. A FAIL, an INCONCLUSIVE, missing evidence, or a stale fingerprint blocks it.

New physics has to come with a verification test, an experimental validation plan, an uncertainty model, a domain of validity, and a comparison path to an established reference code where one exists. See `science/NEW-PHYSICS-REQUIREMENTS.md`. A plan is a plan, not a completed validation, and the docs should never say otherwise.

The agents share a filesystem, so the role files and hash gates are a workflow discipline, not a security boundary against a process that wants to cheat. Do not weaken the permission checks or the acceptance gates to get a commit through.

## Verification is not validation

Verification asks whether the code solves the equations it claims to solve. Validation asks whether those equations match measurements. Everything in this repo is the first kind. Small residuals and agreement with a synthetic baseline say nothing about experimental accuracy, and any future comparison to real data needs its held-out observables, measurement uncertainties, and data permissions written down first.

The synthetic fixtures and the compact review evidence are tracked on purpose. One recorded run is kept so its audit links stay valid. Disposable shot outputs, dependencies, builds, caches, secrets, and any raw or restricted experimental data are gitignored. `.gitignore` cannot find every secret or large file, and it does not remove anything already in history, so look over your changes before staging.

## License

MIT, see `LICENSE`. The UI components and dependencies keep their own licenses, listed in `THIRD_PARTY_NOTICES.md`. No rights to DIII-D experimental data are implied and the DIII-D name does not imply endorsement.
