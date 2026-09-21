# D2 profiles: uncertainty model (Part B, item 3)

Status: PROPOSED. Author: Physics lane (claude-sonnet), 2026-09-21. Baseline physics model 0.1.0; no constants changed. Rule from `science/NEW-PHYSICS-REQUIREMENTS.md`: quantities without evidence stay **unknown**; ranges below are declared model bounds or sampling conventions, not measured distributions, and never imply calibration.

## 1. Quantities of interest (QoI)

Evaluated on the DEFAULT shot at `t = 2, 3, 4.5 s` and on each control set of the D2-VER-FAILSAFE sweep: `T_e(0)/T_e(1)`, `T_i(0)/T_i(1)`, edge values `n(1), T_e(1), T_i(1)` (extrapolation rule fixed in Part A §4, DD-10: linear from the last two cell centres, clipped to `>= 0`), peaking `n(0)/<n>`, `C_br`, `C_ohm`, and the first time at which a run stops with "profile constraint violated". Conserved totals (`N, We, Wi`) carry no profile uncertainty by construction: they equal the 0-D state to `1e-9` (passenger), and the 0-D closure's own uncertainty is **unknown** and outside this document.

## 2. Numerical uncertainty (estimated, checkable)

- **Sources:** spatial (`N_rho`), temporal (`dt`), roundoff, tridiagonal solve.
- **Method:** Richardson/GCI-style estimate on the QoI from runs at `N_rho ∈ {32, 64, 128, 256}` and `dt ∈ {0.004, 0.002, 0.001, 0.0005}` using the observed orders from D2-VER-REFINEMENT (≈ 2 in space, ≈ 1 in time): `e ≈ |Q_h − Q_{h/2}|/(2^p − 1)`, reported with safety factor `1.25`. Roundoff is bounded by the parity/ledger levels (`≤ 1e-10`).
- **Distribution:** none assigned; reported as a bound `± e` on each QoI.
- **Coverage check:** on the analytic fixtures F2, F3, F4 (where truth is known) the estimated bound must contain the true error in at least `95%` of the tested `(N_rho, dt)` pairs. On the default shot no truth exists; only estimated bounds are reported. If a QoI's observed order leaves the D2-VER-REFINEMENT band, its numerical bound is reported as **unknown**, not extrapolated.

## 3. Parameter uncertainty (declared ranges, not measurements)

| Parameter | Nominal | Range (Part A §5–6) | Status |
|---|---|---|---|
| `D` | 0.1 m²/s | 0.03 – 1.0 | illustrative, author-selected; no source read |
| `chi_e`, `chi_i` | 3.0 m²/s | 1.5 – 10 | illustrative, author-selected |
| `rho_N`, `sigma_N` (NBI) | 0.5, 0.2 | 0–0.7, 0.1–0.4 | illustrative; research note only, unread |
| `rho_E`, `sigma_E` (ECH) | 0.3, 0.1 | 0–0.8, 0.05–0.25 | illustrative; centre chosen by Physics |
| `m` (gas, `rho^m`) | 4 | 2 – 8 | illustrative |
| `gamma` (`jt = (1−rho²)^gamma`) | 1 | 0 – 2 | illustrative |
| `N_rho`, `dt` | 64, 0.002 s | 16–256, (0, 0.01] | numerical; handled in §2 |

There is no evidence for a probability distribution on any of these. Two treatments are used and labelled as such:

1. **Bounds (primary).** Report the min/max envelope of each QoI over the box, i.e. a *model-family envelope*, not a confidence interval.
2. **Sampling convention (for sensitivity only).** `chi_e, chi_i, D` log-uniform on their ranges; shape parameters uniform on theirs. This convention exists so variance-based indices are defined; it carries no belief statement, and QoI percentiles from it must not be published as probabilities.

**Correlations: unknown.** `chi_e` and `chi_i` are run in two brackets, independent and fully correlated (`chi_e = chi_i`); both results are reported. Shape parameters are treated as independent for lack of evidence, and this is stated as an assumption. Control inputs (`Ip, Bt`, power, gas, `kappa, delta`) are exact programmed values (no uncertainty assigned).

## 4. Model-form uncertainty

| Item | What is known | How treated |
|---|---|---|
| Scalar uniform `chi`, `D` | Real transport varies with radius and profile; magnitude unknown | not sampled; falsification F-2/F-3 in the validation plan; report the envelope over uniform values only and state that radial structure is missing |
| Constant metric `⟨(grad rho)²⟩ = 1/L²` | equivalent circular torus; the staircase `V` (23.11 m³) differs 4.8% from the analytic ellipse (24.26 m³); the shaped-plasma metric error is **unknown** | profile shape depends on `chi/L²`, so a `±5%` `L²` change is equivalent to `±5%` in `chi` (sensitivity check). A stress multiplier `lambda_g ∈ [0.5, 2]` on `chi/L²` is a **stress bound, not an estimate** |
| Passenger coupling | profiles cannot change confinement, radiation, heating or equilibrium input | lower bound on omission from diagnostics `C_br − 1` and `C_ohm − 1`; the prototype gave `≈ 0.04` and `≈ 0.10` at 3 s (indicative, not evidence). The remainder is **unknown** |
| Renormalised radiation and Ohmic totals | shape follows the M01 formula; totals are 0-D | same diagnostics as above |
| Edge-flux closure | edge values are emergent from an imposed 0-D loss; no reference-code counterpart | no independent error estimate is possible; only F-6 in the validation plan |
| Source shapes | Gaussian/power-law choices with no measured deposition | covered by the shape-parameter bounds in §3, not by any shape-family variation (e.g. non-Gaussian): the family choice is unquantified |
| Flat initial profile | transient of order `tau_diff` (0.029 s at defaults, hand value) | unmeasured; sensitivity to a peaked initial condition deferred (Part A) |

A model-form discrepancy term `delta(rho)` is **not assigned**: no data exist to estimate it. After validation data exist, `delta(rho)` on normalised profiles is defined as data-minus-model residual with a Gaussian-process prior whose hyper-parameters are fit on the calibration partition only; this is a plan, not an existing quantity.

## 5. Measurement uncertainty (future use)

Applies only when experimental data are compared. Component list: diagnostic statistical error, calibration error, spatial resolution/instrument function, `rho` mapping from the equilibrium reconstruction, time-window averaging. All magnitudes are **unknown** until a dataset with provider-stated values is chosen (the `5–15%` figures in the validation plan are placeholders). Propagation: Monte Carlo resampling of data profiles and mapping shifts, then recomputation of the observable metrics.

## 6. Propagation and sensitivity plan

- **Propagation.** Ensembles are run by a **TypeScript** sweep driver (Python profiles are deferred, DD-3). Cost is small (about `2500` steps × `64` cells per run). Outputs: envelope (bounds treatment) and QoI histograms (convention treatment, labelled).
- **Screening.** Morris elementary effects over the 9 parameters of §3 (`D`, `chi_e`, `chi_i`, `rho_N`, `sigma_N`, `rho_E`, `sigma_E`, `m`, `gamma`), 20 trajectories, on the DEFAULT shot.
- **Variance decomposition.** Saltelli first-order and total-effect Sobol indices for the parameters that Morris ranks in the top four, `N = 512` base samples, under the sampling convention of §3. Indices measure the model's response, not physical importance.
- **Bracket runs.** Corner runs of the parameter box, `chi_e` vs `chi_i` correlation brackets, `lambda_g` stress runs at `0.5, 1, 2`, and the `L² ± 5%` check.
- **Outcome check.** Explicitly count runs ending in "profile constraint violated" across the box; a QoI envelope excludes those runs and the count is reported next to it (failures are a result, not noise).

## 7. How uncertainty changes predictions and how coverage is checked

Predictions are reported as nominal value, numerical bound (`± e`), parameter-family envelope, and a flag listing which model-form terms are unquantified. Coverage checks available now: numerical bound coverage on fixtures (§2). Not available until data exist: coverage of parameter or model-form uncertainty against experiment (target: observed residuals lie inside the combined envelope at the pre-registered rate). Until then, no claim of calibrated or predictive uncertainty is made.
