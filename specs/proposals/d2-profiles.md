# D2 profiles specification: 1-D radial transport constrained by the 0-D shot balances

Status: PROPOSED (Part A of the physics stage; the five-part package is Part B). Requires Director approval before any implementation. Author: Physics lane (claude-sonnet), TeamFlow unit `d2-profiles`, 2026-09-21. Baseline: physics model **0.1.0**, `physics/engine.ts` (SHA-256 recorded in `science/constants.json`). Every 0.1.0 constant and assumption A-M01-001…016 is unchanged on the profile-off path. Nothing here is calibrated to DIII-D data.

## 1. Decisions at a glance

| Topic | Decision | Section |
|---|---|---|
| Radial coordinate | `rho = sqrt(V(rho)/V)`, volume-normalised radius; `V'(rho)=2 V rho`, `V` = `Geometry.volume` of the 0.1.0 equilibrium mask | 3 |
| Metric factor | closure: `<|grad rho|²> = 1/L²`, `L² = V/(2 pi² R0)` (equivalent circular torus) | 3 |
| Unknowns | `n(rho,t)`, `w_e(rho,t)`, `w_i(rho,t)` (energy densities); totals `N, We, Wi` | 4 |
| Transport | scalar `D, chi_e, chi_i`, uniform in rho and t; heat flux `-(3/2) KEV n chi grad T` | 4, 5 |
| Coupling | **0-D constrained "passenger"**: the 0-D loop is unchanged and authoritative; the 1-D layer reads it, never writes to it | 9 |
| Sources | each 0-D source total is distributed by a prescribed normalised shape | 6 |
| Axis / edge | zero flux at axis (exact, `V'(0)=0`); **prescribed edge flux equal to the 0-D loss** (`N/tauP`, `We/tauE`, `Wi/tauE`); no Dirichlet value | 7 |
| Numerics | 64 volume-uniform-in-rho cells, backward-Euler transport, left-endpoint explicit sources, same dt as 0-D | 8 |
| Parity tolerance | integral parity **1e-9** relative every step; per-step ledger **1e-10** | 9, 12 |
| Opt-in | separate optional options object; off path bit-for-bit 0.1.0 | 10 |
| Capability | `physicsCapabilityChange: true`; version 0.1.0 -> 0.2.0 | 11 |

## 2. Scope

In: flux-surface-averaged diffusion of electron density and electron/ion thermal energy on `rho in [0,1]`, driven by the 0.1.0 sources distributed radially; profile observables (`n, T_e, T_i` versus `rho`) plus diagnostics, verified per Section 12.

Out (unchanged from the intake): free boundary, MHD/stability, impurities, fusion yield, sawteeth, pedestal/H-mode, derived (neoclassical/turbulent) transport, current diffusion, rotation, web-app display, any LLM/orchestration. Profile feedback on the 0-D balance is also out (Section 9).

## 3. Coordinate and geometry

The 0.1.0 equilibrium supplies exactly one geometric input: the toroidal volume `V` (`geometry().volume`, staircase mask sum of `2 pi R dR dZ`; A-M01-002). The same `V` is used by `runShot`, so 0-D and 1-D share it by construction.

Define `rho` by `V(rho) = V rho²`. Then `V'(rho) = dV/drho = 2 V rho` exactly, for any shape. This is a volume label, **not** toroidal-flux `rho_tor` and not `psi_N`: toroidal flux needs `F(psi)` and a q-profile, which 0.1.0 does not evolve, and reconstructing flux surfaces from the 49x49 staircase mask would import mask noise the accepted model never claimed to resolve. Consequence: the equilibrium's `psi` is not used, so the profile grid is independent of equilibrium solver validity.

The flux-surface-averaged gradient metric `<|grad rho|²>` is a closure: `1/L²` with `L² = V/(2 pi² R0)`, `R0 = 1.66 m` (C-M01-R0). This is the minor radius squared of the circular torus with volume `V` (default controls: `V = 23.11 m³` from `geometry(DEFAULT,49)`, `L² = 0.7053 m²`, `L = 0.840 m`; the analytic ellipse `2 pi² R0 a² kappa = 24.26 m³` differs by 4.8% because of the staircase mask, which is inherited, not corrected). Effect: the operator is exactly the cylindrical one in `r = L rho`. Elongation/triangularity enter only through `V`; their effect on `<|grad rho|²>`, on deposition location and on surface areas is **not resolved** and is a declared model-form limit.

## 4. Governing equations

SI internally. `KEV = 1.602176634e-16 J/keV` (C-M01-KEV). Quasineutral deuterium, `n_e = n_i = n` (A-M01-001). Energy densities `w_e = (3/2) n T_e KEV`, `w_i = (3/2) n T_i KEV` [J m^-3], so `T = 2 w /(3 n KEV)` [keV]. Lower-case are densities; `N = ∫ n V' drho`, `We = ∫ w_e V' drho`, `Wi = ∫ w_i V' drho` are the 0-D state variables.

```
dn/dt   = (1/V') d/drho [ V' (D/L²) dn/drho ]                          + S_n
dw_e/dt = (1/V') d/drho [ V' (3/2) KEV n (chi_e/L²) dT_e/drho ]        + S_e − Q_ei
dw_i/dt = (1/V') d/drho [ V' (3/2) KEV n (chi_i/L²) dT_i/drho ]        + S_i + Q_ei
```

Fluxes (per unit `V'`, in rho-space): `Gamma = −(D/L²) dn/drho`; `q = −(3/2) KEV n (chi/L²) dT/drho`. Only the conductive term appears in the energy equations: 0.1.0 states that `W/tauE` already includes particle-associated loss and that no separate advective term is added (A-M01-009), and that is preserved. For uniform `n` the temperature equation reduces to `dT/dt = chi ∇²T`. The energy-density form of the research note (`d e/dt = χ ∇² e`) was rejected: with peaked `n` it drives `T` up where `n` is low. Research fixture 2c's `T n` energy identity omitted the factor `3/2 KEV`; this spec uses `w = (3/2) n T KEV`.

## 5. Prescribed transport coefficients (illustrative, uncalibrated)

Form decided: **scalar**, uniform in `rho` and `t`, three independent numbers, carried in a separate options object (not added to `Controls`; `LIMITS`/`validate` unchanged). Radial or state-dependent closures are excluded (out of scope; would be a new capability).

| Coefficient | Default | Enforced input range | Basis |
|---|---|---|---|
| `D` | 0.1 m²/s | 0.03 – 1.0 | author-selected; typical order for a tokamak particle diffusivity, not read from a source |
| `chi_e` | 3.0 m²/s | 1.5 – 10 | author-selected; L-mode-like order, not read from a source |
| `chi_i` | 3.0 m²/s | 1.5 – 10 | same |

These are **illustrative author-selected closures** (same status as C-M01-tauE_ref), not fits, not predictions. They set profile *shape*, not confinement: total confinement is fixed by the 0-D closure (Section 9). Ranges are enforced because behaviour outside them is untested.

Selection guide, from a throwaway Physics-side prototype (Python/numpy in the scratchpad, not in the repo, not verification evidence, not reproducible from repository files; Software and Validation must re-derive): for the uniform-source steady state the diffusive confinement time is `tau_diff = L²/(8 chi)` (hand derivation, exact for the cylinder). With `D = 0.1`, the DEFAULT 0-D shot completed for `chi_e = chi_i >= 1.25` and failed near `t = 1.04 s` at `chi = 1.0`; the empirical requirement was roughly `tau_diff <~ 0.65 tauE_min`, with 0-D `tauE` between 0.12 and 0.30 s along the default shot. `chi = 3` was chosen for margin (`tau_diff = 0.029 s`); at that value the prototype's edge `T_e` minimum was about 95 eV and `T_i` about 47 eV. The prototype also showed that the all-zero corner (`nbi=ech=gas=0`) fails at `t ≈ 4.9 s` for `chi = 3` and passes for `chi >= 5`. Those are expected explicit failures at default coefficients, to be enumerated by the sweep (AC-9), not defects.

## 6. Radial source and sink distributions

Every 0.1.0 source total is computed by the unchanged 0-D code on the 0-D state, then distributed by a shape `h(rho)` normalised so `∫ h V' drho = 1` (units m^-3; in the discrete scheme `Σ h_i ΔV_i = 1` to roundoff, using the discrete cell volumes, which is what makes parity exact). Totals and efficiencies are the unchanged 0.1.0 values (A-M01-006/007/008: 0.8 NBI absorption, 0.35/0.65 electron/ion split, 0.9 ECH, 80 keV beam, 0.3 gas efficiency, 13.6 eV ionization).

| Source | Total (0-D, unchanged) | Shape `h` | Default (range) | Provenance |
|---|---|---|---|---|
| Beam particles and NBI heat (`P_e,NBI = 0.28 Pnbi`, `P_i,NBI = 0.52 Pnbi`) | `Sbeam`, `Pnbi` terms | Gaussian `exp(−((rho−rho_N)/sigma_N)²)`, same shape for particles and both channels | `rho_N` = 0.5 (0–0.7), `sigma_N` = 0.2 (0.1–0.4) | research note only; **no primary source identified, unread**; illustrative |
| ECH (`0.9 Pech`) | `Pech` term | Gaussian, narrow | `rho_E` = 0.3 (0–0.8), `sigma_E` = 0.1 (0.05–0.25) | research gave width only, no centre; centre chosen by Physics; illustrative. Resonance location does not follow `Bt` here (excluded) |
| Gas particles and ionization cost `Pion` | `Sgas`, `Pion = 13.6 eV·Sgas` | edge-localised `rho^m` | `m` = 4 (2–8) | research proposed `(1−rho)^n`; see correction below; illustrative |
| Bremsstrahlung `Pbr` (sink) | 0-D `Pbr` | local `n² sqrt(T_e)`, re-evaluated and renormalised each step | none | shape follows M01 formula; total is the 0-D total |
| Ohmic `Pohm` | 0-D `Pohm` | `jt(rho)² eta(T_e)` renormalised each step, `jt = (1−rho²)^gamma`, `eta = 2.8e-8 max(T_e,0.02)^−1.5` | `gamma` = 1 (0–2) | `jt` prescribed illustrative (A-M01-003: current programmed, no diffusion); `eta` constants are C-M01-eta_ref, C-M01-Te_floor |
| Electron–ion exchange | `(We−Wi)/0.25 s` | none: applied locally as `(w_e−w_i)/0.25 s` | C-M01-tau_exchange | linear, so its integral equals the 0-D term exactly |

**Correction to the research note:** `(1−rho)^n` is largest at `rho = 0`; it is centre-peaked, not edge-peaked. The spec adopts `rho^m`. All shape defaults and ranges are **illustrative/uncalibrated**; none has been compared with a measured DIII-D deposition.

Because bremsstrahlung and Ohmic power are renormalised to the 0-D totals, the profiles cannot change radiation or heating totals. Two diagnostics quantify what that hides: `C_br = ∫ n² sqrt(T_e) V' drho / (V (N/V)² sqrt(T_e,avg))` and `C_ohm = <jt² eta(T_e)>_V / (<jt>_V² eta(T_e,avg))` (`<.>_V` volume average). At `t = 3 s` in the prototype run (`chi = 3`), `C_br ≈ 1.04` and `C_ohm ≈ 1.10` (prototype, indicative only).

## 7. Boundary and initial conditions; equilibrium interaction

**Axis.** `V'(0) = 0`, so the axis face carries zero flux exactly; regularity `d/drho = 0` follows.

**Edge (decision).** A prescribed outward flux through `rho = 1` equal to the 0.1.0 loss terms evaluated on the pre-step 0-D state: particle rate `N/tauP`, electron heat `We/tauE`, ion heat `Wi/tauE`, with `tauP, tauE` taken from the same `closure.evaluate` call the 0-D step uses. There is no edge `n` or `T` value. Example magnitudes (hand calculation from the default 0-D samples at `t = 3 s`): `We/tauE ≈ 2.2 MW`, `N/tauP ≈ 8.8e20 s^-1`. The edge `n, T_e, T_i` are emergent outputs.

**Why not a fixed nonzero edge temperature (research note: e.g. 100 eV Dirichlet).** (i) A Dirichlet edge makes the edge loss follow from the solution, so the volume integrals could not reproduce the 0-D `W/tauE` and `N/tauP` losses; parity would be lost. (ii) It is a heat and particle bath whose exchange is not in the 0.1.0 ledger (A-M01-013). (iii) The research statement that TORAX applies zero-Dirichlet `n = T = 0` at `rho = 1` came from literature familiarity, not from code read this session (research §1 says only the README was fetched); it is not relied on. Dirichlet edges are retained only as a **verification-only** solver option so the analytic fixtures (zero-Dirichlet, research 2a/2b) run on the same kernel.

**Failure behaviour.** After each step, any cell with `n <= 0`, `T_e <= 0`, `T_i <= 0` or a nonfinite value stops the run with a distinct error, "profile constraint violated", carrying time and cell; never clipped (mirrors the 0-D guard and A-M01-014). This means the profile-on run can fail where profile-off succeeds: the prescribed loss cannot be carried by the prescribed `chi` (Section 5). The profile-off path is unaffected.

**Initial condition.** Uniform `n = 3e19 m^-3`, `T_e = T_i = 0.5 keV` (C-M01-initial_ne, C-M01-initial_Te_Ti), so the initial integrals equal the 0-D initial state. Peaked initial profiles are deferred. The flat start is inconsistent with the 0-D `tauE` (a flat profile cannot carry the prescribed edge loss without an edge layer forming), so an initial transient of order `tau_diff` is part of the model; its duration is not measured here.

**Interaction with the equilibrium solver.** (1) The equilibrium is still fed the 0-D mean pressure `2(We+Wi)/(3V)`; because 0-D is authoritative, its valid/unsupported status and outputs are bit-identical to 0.1.0 (A-M01-011, A-M01-014 unchanged). (2) The Solov'ev family has `p = A psi` with `psi = 0` on the boundary, so its pressure vanishes at the edge, whereas the 1-D `p(rho)` is positive at the edge and not proportional to `psi`. The displayed profiles and the equilibrium pressure are therefore two different, unreconciled realisations of the same mean pressure; the spec forbids presenting them as one. (3) "Equilibrium unsupported" and "profile constraint violated" are independent statuses.

## 8. Numerical scheme

Grid: `N_rho = 64` cells (default; allowed 16–256), faces at `rho_j = j/N_rho`, cell volumes `ΔV_i = V (2i−1)/N_rho²`, face areas `A_j = V'(rho_j) = 2 V rho_j`, `A_0 = 0`. Unknowns are volume-averaged cell values; totals are `Σ x_i ΔV_i`. Finite-volume, flux at faces, so interior fluxes telescope exactly.

Time: the same steps as the 0-D run (`dt` default 0.002 s, `0 < dt <= 0.01`, `dt = 5/round(5/dt)`), one 1-D step per 0-D step. Transport is **backward Euler**; sources and edge fluxes are evaluated explicitly at the pre-step level (left-endpoint, as in 0-D). Density is advanced first (it depends on no energy variable); then `w_e`, `w_i` with the conduction coefficient `n` (face value = arithmetic mean of adjacent `n^{k+1}`) and `T = 2w/(3 n KEV)` at `k+1`. Each solve is one tridiagonal system. Order: second in space, first in time (backward Euler with explicit Euler sources, matching the first-order 0-D scheme). Backward Euler was chosen over Crank–Nicolson for L-stability across the step-function heating switch-on at 1 s and an M-matrix (monotone, nonnegative updates); CN would not raise the overall first-order accuracy.

Stability: the diffusion part is unconditionally stable. Explicit-source stability is inherited from the 0-D scheme, so the 0-D limit `dt <= 0.01` is the only time-step bound. Unconditional numerical stability is not physical solvability; the constraint-violation failure of Section 7 is a model limit. Verification-only Dirichlet edge closure must be at least second-order (e.g. quadratic one-sided); a linear half-cell closure is first-order at the edge (hand-checked on the quadratic fixture) and does not qualify.

## 9. Reduction to the 0-D balances (integral constraint)

**Construction.** The 0-D loop of 0.1.0 (`N, We, Wi`, all rates, ledgers, samples) executes unchanged and is authoritative. The 1-D layer consumes, per step, the pre-step 0-D totals and rates (`Sgas, Sbeam, Pe, Pi, Pech, Pohm, Pbr, Pion, tauE, tauP`) and never writes back. Summing each 1-D equation over cells, the interior fluxes cancel and the discrete update of the integrals is

```
N^{k+1}  = N^k  + dt (Sgas + Sbeam − N^k/tauP)
We^{k+1} = We^k + dt (Pe + Pohm − We^k/tauE − Pbr − Pion − Qei)
Wi^{k+1} = Wi^k + dt (Pi − Wi^k/tauE + Qei)
```

term for term the 0-D Euler update, given normalised shapes and the prescribed edge fluxes. The integral of the 1-D profiles therefore equals the 0-D state up to roundoff, *by construction*.

**Tolerance (decided).** Relative parity `|∫ x V' − X_0D| / X_0D <= 1e-9` for `X = N, We, Wi` at every step, and per-step ledger closure `<= 1e-10` relative to `max(inventory, Σ|contributions|)`, per species (tightening the intake's 1e-8). The prototype reached about 1e-12 to 7e-11 cumulative at `N_rho = 64` (indicative only). The research note's candidate 1e-4 is rejected as too loose to catch a mis-normalised shape (a 1e-6 normalisation error must be detected; AC-4). Because parity is algebraic, passing it verifies implementation consistency, **not** physical accuracy of the profile shapes, and must be reported that way.

**What the constraint costs.** Profiles cannot change confinement, radiation or heating totals, and there is no profile-dependent equilibrium feedback. Real peaking would alter all three; `C_br`/`C_ohm` (Section 6) and the edge diagnostics report the size of that omission. Feedback of profiles onto the 0-D closure is a later capability.

## 10. Opt-in semantics (profile-off is bit-for-bit 0.1.0)

1. Profiles are requested through a separate optional options value passed to `runShot` (after `observer`, the last M02 optional argument); absent, `undefined` and `{enabled:false}` all mean off, and in the off state no other field is read or validated (an invalid field beside `enabled:false` cannot throw). `enabled` must be a boolean; any other value throws and is never coerced. The 0.1.0 parameters and `Controls`/`LIMITS` are untouched.
2. Off: no profile allocation, no additional reads of state, no change to control flow or floating-point operation order. Every existing `Shot` field is `Object.is`-identical to 0.1.0, including `modelVersion: '0.1.0'`, `schemaVersion: 1`, and the same field sets. Regression basis: the frozen M02 case set and `experiments/baseline/m01-shot.json`.
3. On: the original `Shot` fields are still `Object.is`-identical to the off run (0-D is a passenger) except that `modelVersion` reports `'0.2.0'` and an additional optional `profiles` block is present: grid, per-sample `n, T_e, T_i` (existing export units: 1e19 m^-3, keV), edge values and fluxes, `C_br`, `C_ohm`, parity and ledger errors. `schemaVersion` recommended to remain 1 (additive optional field); Director to confirm.
4. Invalid options (nonfinite, out of the Section 5–6 ranges, non-integer `N_rho`) throw before any stepping. Coefficients are never silently defaulted when partially supplied.
5. The web app does not use profiles in this unit (display is a separate unit).

## 11. Capability declaration and versioning

`physicsCapabilityChange: true`. Capabilities (each with verification checks defined in Section 12 and the Part B package; SHA-256 bindings are **pending** and will be computed by Director tooling only after Part B exists; none are asserted here):

| Capability | Verification check IDs |
|---|---|
| C1: 1-D volume-coordinate diffusion of `n, w_e, w_i` | D2-VER-STEADY, D2-VER-EIGEN-DIRICHLET, D2-VER-EIGEN-REFLECT, D2-VER-MMS-CONDUCTION, D2-VER-REFINEMENT |
| C2: radial deposition/sink distribution with exact normalisation | D2-VER-PARITY, D2-VER-LEDGER |
| C3: 0-D-constrained edge flux closure with explicit constraint-violation status | D2-VER-PARITY, D2-VER-FAILSAFE |
| C4: profile-consistency diagnostics (`C_br`, `C_ohm`, edge values) | D2-VER-DIAGNOSTICS |
| Off-path guarantee | D2-VER-OFFPATH |

Version: physics model **0.1.0 -> 0.2.0** (additive; a profile-off run is the 0.1.0 model and still reports `'0.1.0'`). Verification version bump left to the Director. New IDs proposed: assumptions `A-D2-001…` and constants `C-D2-*` (shape parameters, `D`, `chi`, `N_rho`), to be registered on approval; no existing ID is redefined.

## 12. Numeric acceptance criteria

All must pass with real numbers reported (never a bare boolean); failure triggers a Director change request, not threshold relaxation.

- **AC-1 off path.** The frozen M02 regression case set (DEFAULT plus six variants) plus `experiments/baseline/m01-shot.json` `Object.is`-identical with option absent, `undefined` and `{enabled:false}`; all existing `tests/` and `python/tests/` unchanged and passing.
- **AC-2 passenger.** With profiles on, all original `Shot` fields `Object.is`-identical to the off run (except `modelVersion`, `profiles`).
- **AC-3 integral parity.** `<= 1e-9` (Section 9) for `N, We, Wi` at every step, for `N_rho in {32,64,128}`, `dt in {0.004,0.002,0.001}`, on every completing case of AC-9.
- **AC-4 ledger and anti-tautology.** Independent test-only oracle (not the production rates) closes `n, w_e, w_i` ledgers `<= 1e-10` per step. Perturbing a copy of the trace by (a) `1e-6` of `N` in one post-step density, (b) `1e-6` of `We` moved between cells or between species with the total conserved, (c) a `1e-6` normalisation error in one shape must each be rejected.
- **AC-5 analytic fixtures.** D2-VER-STEADY: uniform source, zero-Dirichlet, `n = S(L²−r²)/(4D)`; relative L2 `<= 1e-6` at `N_rho = 64` against analytic *cell averages*. D2-VER-EIGEN-DIRICHLET: `J0(2.4048 rho) exp(−2.4048² D t/L²)`; relative L2 error `<= 1e-4` of the profile at `t = 1` (`D/L² = 1`) against the analytic *cell averages*, at `N_rho = 256` and `dt <= 2e-6` (backward-Euler amplitude error is about `16.7 dt` here; the point value at `rho = 0.5` is also reported by interpolation). D2-VER-EIGEN-REFLECT: zero-flux edge, `J0(3.8317 rho)` decay (first nonzero root of `J1`, to be recomputed and cited in Part B), same tolerance; total of the uniform mode conserved to `1e-12`. D2-VER-MMS-CONDUCTION: manufactured solution with non-uniform `n` for the `n chi grad T` operator, relative L2 `<= 1e-4` at `N_rho = 128`.
- **AC-6 convergence.** Observed spatial order in `[1.8, 2.2]` (`N_rho = 32…256`, time error suppressed) and temporal order in `[0.85, 1.15]` (`dt = 4e-5…1e-5` on the fixtures; `0.004…0.0005` on the default shot, first- and last-cell `T_e` at 0.5, 2, 3, 4.5 s, within `[0.7, 1.3]`), reported unless both differences are `<= 1e-10` (roundoff-limited).
- **AC-7 structure.** Axis flux exactly zero; prescribed edge flux delivered to `1e-12` relative; each shape integrates to 1 to `1e-13`; diffusion-only fixtures produce no negative values below `−1e-14` of the maximum (monotonicity).
- **AC-8 diagnostics.** `C_br`, `C_ohm`, edge values and fluxes recomputed independently agree to `1e-9`.
- **AC-9 sweep (C1 harness, `python/d3gate/sweep.py`).** Every profile-on run either completes with AC-3/AC-4 satisfied and all values finite and positive, or stops with the explicit constraint-violation error. Zero silently clipped, nonfinite or nonpositive completions. The DEFAULT control set completes at default coefficients. The list of failing controls and their times is reported (expected: the all-zero-auxiliary/zero-gas corner at default coefficients).
- **AC-10 independent falsification.** Validation lane (claude-opus, distinct from Software's claude-sonnet) attempts falsification by sweeps, edge cases, convergence and conservation; Jev audits every stage in one batched call.

## 13. Provenance of this specification

Read this session: `agents/physics.md`, the d2-profiles intake and research notes, `science/NEW-PHYSICS-REQUIREMENTS.md`, `science/capability-policy.json`, `docs/PHYSICS.md`, `science/assumptions.yaml`, `science/constants.json`, `physics/engine.ts` (full), `specs/proposals/m02.md`, `specs/change-requests/M02-OBSERVABILITY-001.json`. No external source was fetched or read in Part A. Known-of, not read: TORAX and its conventions (the research note's README fetch is inherited, not re-verified here), TRANSP/ASTRA/JETTO/RAPTOR, Bessel-root values, NBI/ECH deposition literature, DIII-D diagnostics. The scratch prototype is a feasibility check only; it is not evidence and is not in the repository. Hand derivations: `V' = 2 V rho`, `tau_diff = L²/(8 chi)`, the linear-Dirichlet edge error, the backward-Euler amplitude error `λ² t dt/2`.

## 14. Package (Part B): five companion documents

1. **`d2-profiles-verification.md`.** Defines executable tests for D2-VER-*: fixtures F1 (steady quadratic), F2/F3 (Bessel eigenmodes with Dirichlet and reflecting edge), F4 (manufactured solution, variable `n`), the independent ledger oracle with anti-tautology mutations, integral parity, off-path bit-equality, refinement studies with observed orders, and the failure-path test. Names planned test paths (Software finalises), inputs, units, tolerances of Section 12, and what each cannot show (no physical accuracy).
2. **`d2-profiles-validation-plan.md`.** Experimental plan, status **pending, no data**: candidate observables (`n_e, T_e, T_i` profiles from Thomson scattering, charge-exchange recombination, ECE; known-of, not read), dataset/acquisition options and access dependencies, the mapping problem from `rho_V` to diagnostic coordinates (needs an equilibrium reconstruction 0.1.0 lacks), calibration/validation separation, metrics, acceptance criteria and explicit falsifiers (e.g. measured core/edge ratios outside the prescribed-coefficient envelope in matched shots). The capability stays experimentally unvalidated.
3. **`d2-profiles-uncertainty.md`.** Numerical (Richardson on `N_rho, dt`), parameter (`D, chi, shape parameters` over the Section 5–6 ranges, correlations, ensembles via the C1 harness), model-form (scalar closure, constant metric, passenger coupling, renormalised radiation/Ohmic), and measurement terms; propagation to `T_e(0)/T_e(1)`, edge values, `C_br, C_ohm`; sensitivity and coverage checks. Quantities without evidence stay unknown, no invented distributions.
4. **`d2-profiles-validity.md`.** Geometry (volume label, equivalent circular metric), species, ranges of controls and coefficients, dimensionless numbers (`tau_diff/tauE`, grid Fourier number `chi dt/(L² Δrho²)`), initial/boundary conditions, excluded physics, breakdown criteria (edge collapse; the all-zero-auxiliary corner), assumed-versus-verified ranges, and behaviour outside the domain (explicit throw).
5. **`d2-profiles-reference.md`.** Reference-implementation pathway. Candidate: TORAX (`google-deepmind/torax`, version/commit to be pinned), with a mapping of equations, `rho_tor` versus `rho_V` (coincide only in circular constant-`B` benchmarks), grid, edge convention (TORAX-style Dirichlet edge maps only to the verification-only Dirichlet option; the production prescribed-flux edge has **no reference counterpart**, a stated gap), sources, and matched circular-geometry cases with metrics and expected differences; else a dated search record. Kept separate from experimental validation. The requirements document specifies structured JSON for reference artifacts, so a JSON sibling (as `pyengine-reference.json` does) will likely be needed alongside the `.md`.

## 15. Limits and open concerns

- **Passenger design is by construction consistent.** It cannot reproduce profile effects on confinement, radiation, or equilibrium; profile shapes are consequences of illustrative `chi`, `D` and shapes, not predictions. This is the intended reading of the intake ("0-D as integral constraint"); the Director should confirm it over a self-consistent design.
- **Failure envelope.** `chi < ~1.25` fails the DEFAULT shot and the all-zero corner fails at default `chi` (prototype). Edge `T_i` is as low as about 47 eV at defaults; that is a model artefact of an imposed loss, not a predicted edge.
- **Flat initial profile** conflicts with the 0-D `tauE`; the initial transient duration is unmeasured.
- **Python port.** `python/d3gate/engine.py` mirrors the TypeScript engine; whether profiles must also be ported (and parity tolerance vs TypeScript) is a Director decision. TypeScript is the source of truth.
- **Untested coefficient ranges.** Prototype covered `D` in {0.05, 0.1, 0.3} and `chi` in [0.5, 30] at limited controls (V 28 and 14.5 m³ substituted for elongation extremes, not real `geometry()` calls). Section 5 ranges are declared limits, not verified domains.
- No implementation code, constant, assumption or test was changed by this document.
