# Milestone 2: accepted

The Director accepted Milestone 2 after all 16 independent checks passed.

## Look at it yourself

1. Run `pnpm dev` and open the URL it prints.
2. Click **Physics validation** in the header, or go to `/validation`.
3. Expand a check to see its measurements and limits. The full report is downloadable from the dashboard.

## What was verified

Four real development roles: a Director plus separate Physics, Software, and Independent Validation lanes, each with persistent role files, task records, approvals, and evidence.

The original Milestone 1 geometry, basis arrays, iterations, shot output, and equilibrium checkpoints match six frozen baseline cases exactly.

An analytic Solov'ev benchmark at 33x33, 65x65, and 129x129, run through the same production solver. Maximum normalized flux error on the fine grid: 2.69e-6. Observed convergence is roughly second order. Separate shaped-grid studies document the slower accuracy of the existing staircase boundary.

Independent per-step and cumulative ledgers for particles, electron energy, ion energy, and total thermal energy. Worst normalized ledger error: 3.21e-15. Deliberately corrupted trace copies were rejected, including equal-and-opposite electron and ion errors that a total-only check would miss.

Time-step convergence, held-out controls, invalid inputs, and a deliberately stiff test closure. Fine time-step differences were at most 0.0665% on the specified tests.

All 26 implementation tests passed, and independent type checking and a production build passed.

## The evidence

- [Independent report](validation/m02-report.json)
- [Director acceptance](validation/m02-decision.json)
- [Detailed check evidence](validation/evidence/)
- [Approved specification](specs/proposals/m02.md)
- [Physics review](specs/proposals/m02-physics-review.md)
- [Agent workflow](agents/README.md)
- [Development history](experiments/records/)

Physics stayed at 0.1.0 and verification infrastructure moved to 0.2.0. No physical assumptions or default shot outputs changed. The analytic rectangle is a test domain, not a new plasma boundary. Numerical verification does not establish experimental accuracy, MHD stability, disruption prediction, fusion gain, or hardware feasibility. The fine-grid stencil identity check is sensitive to floating-point cancellation; its tolerance passed on the recorded runtime and was not loosened.

## On model choice

Medium reasoning was enough for this milestone. Use a stronger setting before any experimental equilibrium comparison, radial transport work, or substantial new derivations, and any time a convergence or conservation failure cannot be explained. Keep independent validation and the acceptance gates in place regardless.

The agent lanes share a filesystem, so role restrictions and hash checks are workflow discipline, not OS isolation. Role files and records persist between sessions; nothing runs in the background.
