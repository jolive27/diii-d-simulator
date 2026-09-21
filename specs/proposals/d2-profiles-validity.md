# D2 profiles: domain of validity (Part B, item 4)

Status: PROPOSED. Author: Physics lane (claude-sonnet), 2026-09-21. Baseline physics model 0.1.0; nothing here changes a 0.1.0 constant or assumption. "Assumed" means declared design space; "verified" means covered by executed evidence. **At this stage nothing is verified**: the D2 kernel does not exist, so every range below is assumed until `d2-profiles-verification.md` evidence is produced. Coefficients are illustrative, author-selected values with ranges.

## 1. Geometry

- Radial label `rho = sqrt(V(rho)/V)` on `[0, 1]`, `V'(rho) = 2 V rho`, `V = Geometry.volume` of the 0.1.0 49×49 staircase mask (A-M01-002). It is a volume label, not `rho_tor` or `psi_N`.
- Metric closure `⟨(grad rho)²⟩ = 1/L²`, `L² = V/(2 pi² R0)`, `R0 = 1.66 m`: the operator is the cylindrical one in `r = L rho`. Default `L² = 0.7053 m²` (`L = 0.840 m`). If `V` spans about 14.5–28 m³ across the elongation range (Part A prototype substitutions, not real `geometry()` calls), `L²` spans about `0.44–0.85 m²`; Software recomputes this over the `LIMITS` grid.
- Shape limits are the 0.1.0 `LIMITS`: `kappa` 1–1.95, `delta` −0.3–0.6. Elongation and triangularity act only through `V`; their effect on `⟨(grad rho)²⟩`, surface areas and deposition location is **unresolved** (declared model-form limit). The plasma boundary is fixed; the equilibrium `psi` is not used by the profile layer.

## 2. Species and physical assumptions

Quasi-neutral deuterium, `n_e = n_i = n`, `Z_eff = 1` (A-M01-001), Maxwellian-like species described by `T_e` and `T_i`. Energy densities `w_e = (3/2) n T_e KEV`, `w_i` likewise. Only conductive heat flux appears (no separate advective loss, A-M01-009). A formed plasma exists from `t = 0`: no breakdown, no extinction.

## 3. Parameter ranges (assumed)

| Quantity | Unit | Default | Enforced range |
|---|---|---|---|
| `Ip` | MA | 1.2 | 0.6 – 2.0 |
| `Bt` | T | 2.0 | 1.0 – 2.1 |
| NBI power | MW | 4 | 0 – 12 |
| ECH power | MW | 1 | 0 – 3 |
| Gas | 0.3×10²¹ s^-1 per unit | 2.5 | 0 – 8 |
| `kappa`, `delta` | 1 | 1.7, 0.35 | 1 – 1.95, −0.3 – 0.6 |
| `D` | m²/s | 0.1 (illustrative) | 0.03 – 1.0 |
| `chi_e`, `chi_i` | m²/s | 3.0 (illustrative) | 1.5 – 10 |
| `rho_N`, `sigma_N` | 1 | 0.5, 0.2 (illustrative) | 0–0.7, 0.1–0.4 |
| `rho_E`, `sigma_E` | 1 | 0.3, 0.1 (illustrative) | 0–0.8, 0.05–0.25 |
| `m`, `gamma` | 1 | 4, 1 (illustrative) | 2–8, 0–2 |
| `N_rho` | cells | 64 | 16 – 256 (integer) |
| `dt` | s | 0.002 | (0, 0.01]; `5/dt` rounded to an integer step count |

Control defaults are the 0.1.0 `DEFAULT` and the ranges are the 0.1.0 `validate` limits, unchanged. Shot duration is the programmed 5 s (ramp 0–1 s, heating 1–4 s, ramp-down 4–5 s). Transport coefficients are constant in `rho` and `t`, including across the heating switch-on and ramp-down. The ranges are enforced because behaviour outside them is untested, not because they are physically bounded.

## 4. Dimensionless regime and resolution

- **Diffusive-to-confinement ratio** `tau_diff/tauE`, with `tau_diff = L²/(8 chi)` (uniform-source steady state, exact for the cylinder; hand derivation). Default `0.0294/0.12 = 0.245` at `tauE = 0.12 s`. Prototype indication (Part A, not reproducible from the repository): completion needs roughly `tau_diff ≲ 0.65 tauE_min`, i.e. `chi ≳ 1.13 m²/s` at `L² = 0.7053`; the prototype found completion for `chi ≥ 1.25` and a failure at `chi = 1`. The enforced lower limit 1.5 keeps that margin but is a declared, not verified, bound.
- **Grid Fourier number** `chi dt/(L² Δrho²)`: default `34.8` (`chi = 3`, `dt = 0.002`, `N_rho = 64`); up to about `1.5e4` at `chi = 10`, `dt = 0.01`, `N_rho = 256`, `L² = 0.44`. Backward Euler is unconditionally stable for the diffusion part; this number tells how far into the implicit regime the scheme operates, not accuracy.
- **Time resolution:** explicit sources and edge fluxes are first order; the only time-step bound is the 0-D one (`dt ≤ 0.01`). Spatial resolution: second order, 64 cells default. The step-function heating switch at 1 s and 4 s is resolved only to `dt`.

## 5. Initial and boundary conditions

- Initial: uniform `n = 3e19 m^-3`, `T_e = T_i = 0.5 keV` (C-M01-initial_ne, C-M01-initial_Te_Ti). Peaked starts are unsupported. The flat start conflicts with the 0-D `tauE`; a transient of order `tau_diff` is part of the model, with duration not yet measured.
- Axis: zero flux (exact, `V'(0) = 0`).
- Edge (production): prescribed outward flux equal to the 0-D loss, `N/tauP`, `We/tauE`, `Wi/tauE` evaluated on the pre-step 0-D state with the same closure call. No edge `n` or `T` value is imposed; edge values are emergent.
- Edge (verification only): Dirichlet, second-order closure. Not available in production runs.

## 6. Excluded phenomena

Free-boundary or time-varying equilibrium, MHD and stability, sawteeth, ELMs, pedestal and H-mode, impurities and `Z_eff > 1`, fast-ion slowing-down and orbit physics (beam deposition is a prescribed shape), derived (neoclassical or turbulent) transport, pinch and convective velocities, current diffusion and the `q` profile, rotation and momentum, neutral transport (gas is a prescribed edge shape), radial dependence of `chi` or `D`, profile feedback on 0-D confinement or radiation (DD-1), Python parity (DD-3), the web-app display, any LLM use. ECH resonance location does not follow `Bt` here.

## 7. Breakdown criteria and behaviour outside the domain

- **Explicit throw, never clipped.** After each step any cell with `n ≤ 0`, `T_e ≤ 0`, `T_i ≤ 0` or a nonfinite value stops the run with "profile constraint violated" (time and cell), distinct from the 0-D valid-regime error. Profile-on can therefore fail where profile-off succeeds. Known instance: the all-zero-auxiliary corner (`nbi = ech = gas = 0`) at defaults fails near 4.9 s in the prototype and completes for `chi ≥ 5`. The list of failing controls is to be produced by the sweep (D2-VER-FAILSAFE), not assumed.
- **Invalid options** (nonfinite, outside the ranges, non-integer `N_rho`, partial coefficient sets) throw before any stepping when `enabled: true`. When disabled, no other field is read.
- **Invalid controls:** the unchanged 0.1.0 `validate` error.
- **Interpretation limits (no runtime detector):** edge `T_e` below `0.02 keV` (C-M01-Te_floor) is outside where the M01 resistivity closure is defined and the Ohmic shape uses its floor; profile and equilibrium pressure are two unreconciled realisations of the same mean pressure and must not be presented as one; "equilibrium unsupported" and "profile constraint violated" are independent statuses. Physical regimes excluded above (for example H-mode conditions) are **not detected**: the model would still run and produce a profile, with no scientific standing.

## 8. Assumed versus verified

| Item | Status now |
|---|---|
| Control ranges | assumed = 0.1.0 `LIMITS`; sweep evidence pending |
| Coefficient and shape ranges | assumed, declared; only `D ∈ {0.05, 0.1, 0.3}`, `chi ∈ [0.5, 30]` at limited controls were touched by the throwaway prototype (not evidence) |
| `N_rho`, `dt` ranges | assumed; fixtures verify only the ranges named in the verification spec |
| Geometry at `kappa`/`delta` extremes | assumed; the prototype used substituted volumes |
| Analytic fixtures | to be verified by Software and Validation |

## 9. Edge-flux closure: no reference-code counterpart

The production edge treatment, a prescribed flux equal to the 0-D loss terms with no edge value, **has no counterpart in any reference transport code identified in this stage** (TORAX-style codes impose boundary values or gradients; see `d2-profiles-reference.md`). It exists to keep integral parity with the 0-D balances (DD-5). Consequently the edge behaviour of the profile layer cannot be benchmarked against a reference code, and can be tested experimentally only through the plan's F-6. Emergent edge values (Part A prototype: `T_e ≈ 0.10 keV`, `T_i ≈ 0.05 keV`) are model artefacts of an imposed loss, not predictions.
