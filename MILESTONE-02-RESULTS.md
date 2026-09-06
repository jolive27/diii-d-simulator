# Milestone 02 — accepted

The Experiment Director accepted Milestone 02 after all **16 independent checks passed**. Milestone 03 has not started.

## Open and explore

1. Double-click **Launch Simulator.command** in this Desktop folder.
2. Click **Physics validation** in the simulator header, or open **Open Local Validation.webloc**.
3. Expand a check to inspect its measurements and limits. Download the report from the dashboard.

**Project Guide.html** maps the folders in plain language. Everything is inside **Desktop → DIII-D-Simulator**. The hosted shortcut opens the separately published version; use the local launcher for this updated project.

## What was verified

- Four real development roles: Director plus separate Physics, Software, and Independent Validation agent sessions, with persistent role files, task records, approvals and evidence.
- Original Milestone 01 geometry, basis arrays, iterations, shot output and equilibrium checkpoints match six frozen baseline cases exactly.
- Analytic Solov’ev verification at 33×33, 65×65 and 129×129, using the same production solver. Fine-grid maximum normalized flux error: **2.69×10⁻⁶**. Observed flux convergence is approximately second order.
- Separate shaped-grid studies document the slower accuracy of the existing staircase boundary.
- Independent per-step and cumulative particle, electron-energy, ion-energy and total thermal balances. Worst normalized independent ledger error: **3.21×10⁻¹⁵**.
- Deliberately corrupted trace copies were rejected, including equal/opposite electron/ion errors invisible to a total-only check.
- Time-step convergence, held-out controls, invalid inputs and a deliberately stiff test closure were checked. Fine time-step differences were at most **0.0665%** in the specified tests.
- All 26 implementation tests passed. Independent type checking and production build passed.

## Read the evidence

- [Independent report](validation/m02-report.json)
- [Director acceptance](validation/m02-decision.json)
- [Detailed check evidence](validation/evidence/)
- [Approved specification](specs/proposals/m02.md)
- [Physics review](specs/proposals/m02-physics-review.md)
- [Agent workflow](agents/README.md)
- [Development history](experiments/records/)

Physics remains **0.1.0**; verification infrastructure is **0.2.0**. No physical assumptions or default shot outputs changed. The analytic rectangle is a test domain, not a new plasma boundary. Numerical verification does not establish experimental accuracy, MHD stability, disruption prediction, fusion gain or hardware feasibility. The fine-grid stencil-identity check is sensitive to floating-point cancellation; its original tolerance passed on the recorded runtime and was not relaxed.

## Reasoning level

The specialist agents used **GPT-6 Astra / Medium**. Medium was sufficient for this milestone. Consider **High before experimental equilibrium comparison, radial transport, or substantial new physics derivations**, and if an unexplained convergence or conservation failure appears. Keep independent validation and acceptance gates at either setting.

The native agent sessions share a filesystem; role restrictions and hash checks are not OS security isolation. The alternate dispatcher stages separate working copies and rejects out-of-role changes before review; its executor integration was tested with a mock. The work in this milestone used actual separate native agent instances. Role definitions and records persist; the agents are not always-on background processes.
