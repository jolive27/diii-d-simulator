# DIII-D Virtual Shot

An independent, reduced educational tokamak simulator inspired by DIII-D. Explore a five-second formed-plasma shot using plasma current, toroidal field, neutral-beam heating, electron-cyclotron heating, fueling and shape controls. The browser computes synthetic temperature/density histories, thermal-energy and particle balances, and fixed-boundary equilibrium; playback and JSON export are included.

**This is not an official DIII-D product. It is not experimentally validated, calibrated to facility shots, or suitable for facility operation predictions, shot planning, safety decisions, disruption prediction or fusion-gain claims.** Numerical verification establishes limited properties of the implemented equations, not their predictive accuracy in real plasmas.

## Current status

- Milestone 01: preserved reduced shot simulator and frozen synthetic regression cases.
- Milestone 02: numerical verification and development-agent infrastructure are present. Recorded independent reports and Director decisions are in `validation/`; results and limitations are described in `MILESTONE-02-RESULTS.md`.
- Physics model: **0.1.0**. Verification infrastructure: **0.2.0** (see `science/model_versions.json`). Milestone 03 has not been implemented.
- Acceptance is tied to source/evidence hashes. A saved PASS or dashboard is historical evidence, not proof that the latest checkout passes. Run the status/gate commands below; stale evidence requires fresh independent validation, never a manually substituted hash.

## Run locally

Requirements: Git, Node.js **22.13 or newer**, and pnpm. Retain the committed `pnpm-lock.yaml` for reproducible dependency resolution.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by the server. The validation dashboard is at `/validation`. Stop the server with Ctrl+C. No AI key, private experimental data or facility access is needed to run the simulator. The included `Launch Simulator.command` is a convenience launcher for the original Mac installation; its bundled-runtime path is machine-specific. The commands above are the portable route.

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
node tools/milestone-status.mjs
node tools/workflow.mjs gate m02
```

`pnpm start` serves the completed build through local Wrangler. A numerical test or successful build does not replace independent validation or Director acceptance. The historical infrastructure report may have a stale source hash after M02 changes; inspect the current M02 gate separately. Some fine-grid checks are sensitive to floating-point cancellation across runtimes; preserve approved tolerances and report discrepancies.

## Repository map

```text
app/                       Simulator UI and validation dashboard
components/, hooks/, lib/  Shared UI components and helpers
physics/                   Engine, deterministic API, numerical benchmarks
agents/                    Persistent roles, permissions and workflow
science/                   Assumptions, constants, equations, model/validation registries
specs/                     Approved specs, proposals and physics change requests
tests/                     API, physics, regression and policy checks
validation/                Independent executors, evidence, reports and decisions
experiments/baseline/       Frozen synthetic M01 fixtures and provenance
experiments/records/        Persistent assignments, audit trail and execution records
experiments/runs/           Local shot exports (new runs ignored)
examples/                  Curated synthetic baseline example
public/                    Static assets and saved validation dashboard data
tools/                     Agent dispatch, gates, verification and export commands
docs/                      Architecture, physics, API, history and repository guidance
.codex/                    Project agent settings
.openai/hosting.json        Existing Sites project linkage; not an API credential
package.json               Runtime requirements, commands and dependencies
pnpm-lock.yaml             Pinned dependency resolution
```

The existing paths are retained to preserve imports, launch shortcuts, scientific provenance and machine-checkable source fingerprints. `START-HERE.md`, `Project Guide.html` and the Desktop launch shortcuts remain available.

## Architecture and physics scope

The TypeScript engine in `physics/engine.ts` evolves volume-averaged particle inventory and separate electron/ion thermal energies using prescribed heating, fueling, current and illustrative transport closures. A finite-difference Grad–Shafranov calculation supplies a restricted fixed-boundary equilibrium with one-way coupling from thermal pressure. There is no radial transport evolution, free-boundary coil solve, turbulence, MHD stability, disruption or fusion-yield model.

`physics/api.ts` exposes `run_shot`, `run_benchmark`, `parameter_sweep`, `get_metrics` and `export_results`, without browser, network or filesystem side effects. See [API](docs/API.md), [physics](docs/PHYSICS.md), [architecture](docs/ARCHITECTURE.md) and [equations](science/equations.md). Agent orchestration belongs to development tooling; no agent is embedded as an LLM feature in the simulator UI.

## Agent development and acceptance

Read `AGENTS.md` and [agents/README.md](agents/README.md) before changes. Use distinct real agent sessions with durable repository artifacts:

1. Director assigns scope and records tasks in `experiments/records`.
2. Physics proposes governing equations, assumptions, units, boundaries and quantitative acceptance criteria; it cannot change production code.
3. Director approves the specification and any explicit physics change request.
4. Software implements the approved specification and tests without silently changing assumptions.
5. Independent Validation executes checks against frozen source, records its own identity and evidence hashes, and cannot repair production physics or approve itself.
6. Only the Director runs acceptance after all required gates pass. FAIL, INCONCLUSIVE, missing evidence and stale fingerprints block acceptance.

New physics must include a verification test, experimental validation plan, uncertainty model, domain of validity and comparison pathway to an established reference implementation where available. See `science/NEW-PHYSICS-REQUIREMENTS.md`; plans must never be described as completed experimental validation.

Native agents share a filesystem. Role instructions and hash gates are not OS security isolation or authentication against a hostile same-user process. The alternate dispatcher uses separate working copies and rejects out-of-role changes before Director review/import. Role files persist; they do not create always-on agents. Do not weaken permission boundaries or acceptance checks to facilitate a commit.

## Verification, data and licensing

Retain analytic benchmarks, exact M01 regression fixtures, independent particle/energy ledgers, negative controls, grid/time-step studies and their approved tolerances. Verification asks whether the equations were solved correctly; experimental validation asks whether those equations reproduce measurements. Neither small residuals nor agreement with a synthetic baseline proves experimental accuracy. Document held-out observables, measurement uncertainty and permitted data access before future experimental comparisons.

Synthetic fixtures and compact review evidence are intentionally tracked. One existing recorded run remains tracked to preserve its audit links; future disposable shot outputs, dependencies, builds, caches, secrets and private/restricted/raw experimental data are ignored. `.gitignore` cannot detect arbitrary secrets or large files and does not remove anything already in Git history. Review changes before staging and before publication.

**License decision pending.** No blanket license has been added: original-code ownership and inherited Sites/UI component and dependency notices need review first. No rights to DIII-D experimental data are implied. See [repository preparation and publication checklist](docs/REPOSITORY-PREPARATION.md). Nothing in this preparation publishes or pushes the project.
