# D2 profiles: experimental validation plan (Part B, item 2)

Status: **PLAN ONLY. No data identified, requested, obtained or compared. Execution status: not started.** Until evidence exists, the D2 profile capability is labelled **experimentally unvalidated**; verification (see `d2-profiles-verification.md`) and the reference comparison (`d2-profiles-reference.md`) do not substitute for it. Author: Physics lane (claude-sonnet), 2026-09-21. Baseline: physics model 0.1.0; this plan changes no constants. Everything about DIII-D diagnostics below is known-of from general knowledge; no source was read for this document.

## 1. What is being validated, and what is not

The profile layer (Part A) is a **passenger**: the 0-D balances fix `N, We, Wi`, confinement times and radiation/heating totals, and the profiles are consequences of illustrative closures (`D`, `chi_e`, `chi_i` scalar and uniform, prescribed source shapes, edge flux equal to the 0-D loss). The 0-D closure is itself uncalibrated (A-M01, `C-M01-tauE_ref` illustrative). Consequently:

- **In scope:** the *normalised shape* of `n_e(rho)`, `T_e(rho)`, `T_i(rho)`: peaking factors, edge-to-average ratios, radial location of steepest gradient, and the assumptions that scalar uniform `chi`/`D` and the passenger construction can represent them.
- **Out of scope:** absolute stored energy, `tauE`, radiated power totals and fusion or equilibrium quantities. These belong to the 0-D model and would confound shape validation. No absolute-level agreement is claimed or sought.

## 2. Observables

| Observable | Definition (model side) | Candidate measurement (known-of, unread) |
|---|---|---|
| `n_e(rho)/<n_e>` | cell values over volume average | Thomson scattering; interferometry with profile inversion; reflectometry (edge) |
| `T_e(rho)/<T_e>` | as above, `<T_e> = We/((3/2)N KEV)` | Thomson scattering; ECE |
| `T_i(rho)/<T_i>` | as above | charge-exchange recombination spectroscopy (CER) |
| Core peaking `X(0)/<X>`, edge ratio `X(1)/<X>`, `rho` of max gradient | scalar metrics from the above | derived from fitted profiles |
| Peaking-weighted radiation and Ohmic corrections `C_br`, `C_ohm` | Part A §6 diagnostics | bolometry (radiated power), loop voltage and current profile (needs reconstruction) |

## 3. Candidate dataset types and acquisition (all unconfirmed)

1. **L-mode-like quasi-steady flat-tops** with NBI and/or ECH, no ELMs or sawtooth-dominated windows: closest to the model's prescribed-diffusion, no-pedestal domain.
2. **Gas-puff scans** at fixed heating: tests the edge-localised source shape and the density-profile response.
3. **Heating power or deposition scans** (NBI power steps, ECH deposition-radius scans): tests the source-shape parameters `rho_N, sigma_N, rho_E, sigma_E` (Part A §6) and, from transient response, scalar versus radial `chi`.

**Access dependencies (unresolved).** Any DIII-D shot data requires an access route (collaboration status, data-use agreement, data-server credentials or a curated export) that this project has not established; nothing here claims facility or dataset accessibility. If DIII-D data prove inaccessible, the plan falls back to published, tabulated profile studies of comparable L-mode plasmas, whose selection needs a documented literature search (not done). The Director decides the acquisition route; Physics does not.

## 4. Coordinate mapping and parameter matching

- **Coordinate mismatch.** The model uses `rho = sqrt(V(rho)/V)`, a volume label from the 0.1.0 staircase mask (Part A §3), not `rho_tor` or `psi_N`. Measurements map to flux coordinates through an equilibrium reconstruction that 0.1.0 does not have. Plan: map data to normalised toroidal-flux or volume coordinates using the reconstruction supplied with the dataset, then convert to `rho_V` with the reconstruction's `V(rho)`; report the mapping uncertainty as a separate term.
- **Matching.** Controls `Ip, Bt, P_NBI, P_ECH, gas, kappa, delta` are set to the shot's flat-top values within the `LIMITS` ranges; shots outside the ranges are excluded. Real waveforms differ from the 0.1.0 programmed shape (1 s ramp, 1–4 s flat-top): compare only inside a quasi-steady window (`>= 3 tau_diff`, and stationary to within the diagnostic uncertainty).
- **Unmatchable.** The model has no impurities, pedestal, rotation or current-profile evolution; shots dominated by them are excluded, not corrected.

## 5. Calibration and validation separation

Model coefficients are illustrative. If a fit of `chi_e, chi_i, D` (or shape parameters) to data is ever performed it is a **calibration** and must satisfy: (i) a Director-approved change request and new specification hash before any coefficient in the production model changes; (ii) shot-level partition fixed *before* looking at data (by shot number or campaign, e.g. one experimental campaign for calibration and a different one held out); (iii) validation metrics computed only on held-out shots; (iv) the coefficient bounds of Part A §5 stay the prior range, and any best fit outside them is a finding, not a licence to widen the range. Until then, ranges are not tuned.

## 6. Metrics and acceptance (illustrative, to be pre-registered)

Thresholds below are **illustrative placeholders** for Director and Validation review; they must be fixed and recorded before any data are examined, and replaced by values derived from the dataset's stated diagnostic uncertainties.

- Normalised-shape residual per profile: `L2rel` of `X(rho)/<X>` over `rho ∈ [0.1, 0.9]`; criterion: within `max(0.15, 2 sigma_meas)` (placeholder; the range 0.10–0.25 is admissible).
- Peaking factors `X(0)/<X>` and `X(0.9)/<X>`: within `2 sigma_meas` of data for at least `80%` of held-out shots (placeholder).
- Diagnostic measurement uncertainty: order-of-magnitude placeholders `5–15%` (statistical) for Thomson, CER and ECE profile points, plus separate mapping uncertainty in `rho`; these are **unverified** and must be replaced by the provider's stated values. Model-form and parameter uncertainty enter through `d2-profiles-uncertainty.md`; a metric passes only when the data-minus-model residual is compared against the combined uncertainty, not the bare model.

## 7. Falsification criteria

The model (as a shape predictor) is falsified, for the stated domain, if in matched quasi-steady L-mode-like shots:

- **F-1:** the measured `T_e(0)/T_e(0.9)` or `T_i(0)/T_i(0.9)` lies outside the envelope produced by the whole Part A parameter box (`chi ∈ [1.5, 10]`, `D ∈ [0.03, 1]`, source-shape ranges) plus stated uncertainty, in more than `20%` of shots (placeholder).
- **F-2:** no scalar uniform `chi` within its range reproduces the normalised shape within uncertainty, while a radially varying `chi` does: falsifies the scalar-closure assumption.
- **F-3:** the best-fit `chi` depends systematically on `Ip`, `Bt` or heating power beyond what the model allows (none): falsifies constant-`chi` at fixed controls.
- **F-4:** measured density peaking is inconsistent with the edge-localised gas shape (`rho^m`, `m ∈ [2, 8]`) and prescribed `D` for gas-dominated shots.
- **F-5:** the measured radiation or Ohmic peaking effect differs from `C_br`, `C_ohm` by more than combined uncertainty, falsifying the "profiles do not change 0-D totals" (passenger) assumption for that regime.
- **F-6:** the emergent edge `T_e`, `T_i` (about `0.10` and `0.05 keV` at defaults in the Part A prototype, indicative only) are contradicted by edge measurements, falsifying the edge-flux closure as an edge-shape model (the closure has no reference-code counterpart, so this test is the only external check available for it).

## 8. Execution status and dependencies

Status: **pending, no data**. Dependencies: (1) Director decision on acquisition route; (2) an equilibrium-reconstruction mapping supplied with the data; (3) a Software export of profiles in stated units (`1e19 m^-3`, keV) versus `rho_V`; (4) Validation lane review of the pre-registration; (5) uncertainty model in `d2-profiles-uncertainty.md` implemented. No result may be reported as validation until (1)–(5) exist and independent Validation confirms.
