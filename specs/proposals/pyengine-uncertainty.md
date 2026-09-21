# Uncertainty model — Python engine reimplementation

The Python engine is a numerical reimplementation of model 0.1.0. This document enumerates numerical, parameter and model-form uncertainty, how each is propagated, and how coverage is checked. Unsupported quantities remain explicitly unknown; no invented precision is assigned.

## Numerical uncertainty

1. **Roundoff (IEEE-754 binary64)**: ~`1e-16` relative per operation. Accumulation is bounded by sum nesting; the engine must preserve the TypeScript ledger and volume/`C`/`D` sum ordering where it matters (normative in `pyengine.md`).
2. **Cross-runtime elementary functions**: `libm`/NumPy `exp`, `pow`, `sqrt`, `log` differ from the TypeScript runtime at the `1e-16` level. This is the smallest irreducible inter-engine difference and justifies the aggregate budget of `1e-9`.
3. **Iterative equilibrium solve**: SOR stops when the normalized residual drops below `1e-8` (or after 12000 sweeps, otherwise throws). The staircase interior mask adds grid-dependent truncation that is not claimed to be second order (M02 shaped-convergence); the budget applies between engines on the same grid and same convergence path.
4. **Time discretization**: explicit Euler is first order, `O(dt)`; default `dt=0.002 s` over a 5 s shot; samples spaced at ~0.02 s. M02's timestep study bounds the self-convergence order in `[0.7, 1.3]`. This uncertainty is model-form, not implementation; it applies identically to both engines.

## Parameter uncertainty

Controls are bounded by `LIMITS` and are exact inputs to the deterministic engine. Constants (geometry, `KEV`, closure coefficients, absorption fractions) are fixed declared values, not fitted, and carry no fitted-parameter uncertainty. Sensitivity is measured by the ordered single-control sweep (`parameter_sweep`) over each control's step grid, reporting peak `Te`, final `tauE` and `beta` per case. No data exists to estimate true parameter covariance; none is invented.

## Model-form uncertainty

Enumerated by the model's own assumptions (A-M01-001 through A-M01-016 in `science/assumptions.yaml`): heuristic closures without calibration, fixed absorbed heating fractions, single-species deuterium, bremsstrahlung-only radiation, no stability/disruption/free-boundary/turbulence/radial transport. These bounds the domain in `pyengine-validity.md`; outside that domain the model is not attempted (it throws) and results are meaningless. The discrepancy between this reduced model and a real plasma is **unknown by design** and is not estimated, because doing so would require experimental data this project does not have.

## Propagation and coverage

- Deterministic engine maps inputs to samples; aggregate metrics are extrema over ~0.02 s samples; reported conservation residuals are exactly the ledger errors.
- Inter-engine discrepancy is the observability target here: it is checked across the default run, the full parameter sweep, and the analytic/shaped fixtures, all of which must sit inside the `1e-9` / `1e-6` relative budgets (`PYENGINE-SWEEP-MATCH`, `PYENGINE-TIMESERIES-MATCH`).
- Coverage states what is covered: numerical equivalence across the declared operating range, on shared grids. Physical calibration coverage: none, pending data.
- Sensitivity and coverage results are recorded per check in the independent report; thresholds are declared in the spec and never changed retroactively.