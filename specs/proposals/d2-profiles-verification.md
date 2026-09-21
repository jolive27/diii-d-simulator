# D2 profiles: verification test specification (Part B, item 1)

Status: PROPOSED. Author: Physics lane (claude-sonnet), TeamFlow unit `d2-profiles`, 2026-09-21; fix-up pass 2026-09-21 applying DD-6..DD-10 (`experiments/records/d2-profiles-design-decisions.json`). Binds to `d2-profiles.md` §§4, 6–10, 12 and DD-1..DD-10. Verification version **0.3.0**, physics model **0.2.0** (profiles on; profile-off remains 0.1.0, schema 1) per DD-8. No constant or assumption changes to 0.1.0. No implementation code; test and helper paths are planned, Software finalises them.

## 1. Conventions common to all checks

- **Test layout (planned).** One top-level file `tests/d2-profiles.test.mjs` (matched by the `npm test` glob); one `test(...)` per check, titled with the check ID; helpers in `tests/d2/` (sweep driver `tests/d2/sweep-driver.mjs`). Test-only oracles restate conversions and formulas independently, as `tests/m02/ledger.mjs` does; production rate functions are not imported.
- **Verification-only entry (interface requirement on Software).** A kernel entry, not reachable through `runShot` options, that accepts: arbitrary `V`, `L²`, `D`, `chi_e`, `chi_i` (including `0`), prescribed source arrays per cell, edge type (`flux` or `dirichlet` with a value), a switch freezing `n`, initial cell arrays; an **observer callback** invoked after each accepted step with the post-step cell arrays and the prescribed edge fluxes (so a run that later throws still leaves a trace up to its last accepted step); and a **diagnostics evaluator** callable on supplied cell arrays (`n, T_e, T_i, jt`, `V`, `We`, `N`). Dirichlet edges use a closure exact for quadratics in `rho` given cell averages (`d2-profiles.md` §8); a linear half-cell closure does not qualify.
- **Normalised fixture units:** `V = 1` (so `V' = 2 rho`, `ΔV_i = (2i−1)/N_rho²`), `(3/2)KEV = 1`, `D/L² = chi/L² = 1`. SI runs (`V = 23.11 m³`, `R0 = 1.66 m`, `L² = V/(2 pi² R0) ≈ 0.705 m²`, to exercise unit conversions) exist only for D2-VER-STEADY (b) and (c); every other fixture is normalised. Fixture times are dimensionless in the normalised units; every fixture `t` is an integer multiple of every `dt` listed for it, and the production shot rule `dt = 5/round(5/dt)` applies only to shot runs (PARITY, LEDGER, FAILSAFE, REFINEMENT default shot, DIAGNOSTICS A6).
- **Comparison to analytic solutions** is always against exact volume-weighted **cell averages** of the analytic solution (`(1/ΔV_i) ∫ u(rho) 2 rho drho V` over the cell, Gauss–Legendre with at least 8 nodes per cell in the test), never point samples. Norm: `L2rel(u, ū) = sqrt( Σ ΔV_i (u_i − ū_i)² / Σ ΔV_i ū_i² )`. Useful closed form for a quadratic: the volume-weighted cell average of `rho²` on `[a,b]` is `(a²+b²)/2`.
- **Constants restated by the test:** `a1 = 2.404825557695773` (first zero of `J0`), `b1 = 3.831705970207512` (first nonzero zero of `J1`), `J0` evaluated by the test's own series or library, to `1e-15`; `KEV = 1.602176634e-16 J/keV`.
- **Convergence procedures (reused by name).**
  - *Spatial rate.* For `N_rho = 32, 64, 128, 256` compute `e_N = L2rel(2 u_{dt/2} − u_{dt}, ū)` with `dt = 1e-5` and the time error removed by this Richardson combination (`u_{dt}` is the field after time `t` with step `dt`). Rate per pair `p_x(N) = log2(e_N / e_{2N})`: three values.
  - *Temporal rate.* At fixed `N_rho` compute fields for `dt_k = 4e-5, 2e-5, 1e-5, 5e-6`; `d_k = sqrt( Σ ΔV_i (u_{dt_k} − u_{dt_{k+1}})² / Σ ΔV_i ū_i² )` (spatial error cancels); `p_t,k = log2(d_k/d_{k+1})`: two values.
  - *Roundoff exemption.* A rate is not judged (but is reported) when the two quantities in its ratio are both `≤ 1e-10` (relative). The exemption is never available to D2-VER-EIGEN-REFLECT.
- **Output artifacts.** Each check writes one JSON file `<evidence-dir>/d2-ver-<check>.json` (directory assigned by the Director; file names fixed here: `d2-ver-steady.json`, `d2-ver-eigen-dirichlet.json`, `d2-ver-eigen-reflect.json`, `d2-ver-mms-conduction.json`, `d2-ver-refinement.json`, `d2-ver-parity.json`, `d2-ver-ledger.json`, `d2-ver-failsafe.json`, `d2-ver-diagnostics.json`, `d2-ver-offpath.json`). Every file records: `checkId`, `physicsModelVersion`, `verificationVersion: "0.3.0"`, source SHA-256 of `physics/` files used, Node version, and a `runs` array; each run holds `inputs`, every measured quantity as a number, its `tolerance`, and `ratio = measured/tolerance`; a top-level `pass` derives from the ratios. A check with a bare boolean, or any absent measured number, fails.
- A failed check triggers a Director change request, never a loosened threshold.
- "Prototype" figures come from throwaway numpy scripts outside the repo (Physics scratchpad, not evidence, not reproducible from repository files); Software and Validation must re-derive them. Figures marked *(scratch, fix-up)* were re-run in this pass; the earlier ones are inherited from Part A/B.

## 2. Fixtures

| ID | Definition |
|---|---|
| **F1** | Steady state, uniform source, zero-Dirichlet edge. Normalised: `S = 1`, `D/L² = 1`. Cell-average closed form `n̄_i = (S L²/(4D)) (1 − (rho_{i−1}² + rho_i²)/2)`. Also SI runs (b) density, (c) electron energy (see D2-VER-STEADY). |
| **F2** | Dirichlet eigenmode. `u(rho,t) = J0(a1 rho) exp(−a1² D t/L²)`, `D/L² = 1`, zero-Dirichlet edge, no sources, `n` frozen `= 1`. Initial condition: cell averages of `J0(a1 rho)`. |
| **F3** | Reflecting (zero-flux edge) eigenmode. `u(rho,t) = J0(b1 rho) exp(−b1² D t/L²)`, `D/L² = 1`, edge flux `0`, no sources, `n` frozen `= 1`. Initial condition: cell averages of `J0(b1 rho)`. |
| **F4** | Manufactured conduction, frozen non-uniform `n`. Normalised: `n = 3/2 − rho²/2` (density source keeps it steady), `T = e^{−t}(1−rho²)(1+rho²/2)`, `w = n T`, operator `(1/rho) d/drho(rho n dT/drho)` (`V' = 2 rho`, so this is `(1/V') d/drho(V' n dT/drho)`), Dirichlet edge `T = 0`, face `n` = mean of the neighbouring cell values. Initial condition: cell averages of `w(rho,0)`. Manufactured source `S_e(rho,t) = e^{−t}(3/2 + (45/4) rho² − (11/2) rho⁴ − (1/4) rho⁶)` evaluated as cell averages in the test, applied left-endpoint. Source re-derived in this pass by finite-difference evaluation of `dw/dt − (1/rho) d/drho(rho n T')` at seven `rho` in `[0.05, 0.95]`, `t = 0.7`: maximum residual `7.8e-8` (finite-difference truncation), *(scratch, fix-up)*. |

## 3. The ten checks

Each check states: Fixture and inputs, Expected, Tolerance, Convergence procedure, Pass/fail rule, Output artifact.

### D2-VER-STEADY (capability C1)

- **Fixture and inputs.** F1 at `N_rho = 16, 64, 256`. Runs: (a) normalised, `S = 1`, `D/L² = 1`; (b) SI density, `V = 23.11 m³`, `D = 0.1 m²/s`, `S = 1e19 m^-3 s^-1` (illustrative fixture value); (c) SI electron energy, `n` frozen `= 3e19 m^-3`, `chi_e = 3 m²/s`, `S_e = 1e5 W m^-3` (illustrative), `T` zero-Dirichlet at the edge. Time step `dt = 0.05` in the normalised run (a), and `dt = 0.05 L²/D` in run (b) and `dt = 0.05 L²/chi_e` in run (c); march until the maximum relative change of any cell between successive steps is `≤ 1e-14`, cap `2000` steps (backward Euler's fixed point does not depend on `dt`).
- **Expected.** (a) `n̄_i = (1/4)(1 − (rho_{i−1}²+rho_i²)/2)`. (b) `n̄_i = S L²/(4D) · (1 − (rho_{i−1}²+rho_i²)/2)`, centre value `n(0) = 1.763e19 m^-3`. (c) `T̄_i = S_e L²/(4 (3/2) KEV n chi) · (1 − (rho_{i−1}²+rho_i²)/2)`, centre value `T(0) = 0.815 keV`.
- **Tolerance.** `L2rel ≤ 1e-6` for each of the nine runs (3 cases × 3 grids). Discrimination: with an edge closure exact for quadratics the error is roundoff (`≈ 1e-13`, expected `≤ 1e-12`); a linear half-cell closure gives `≈ 2e-4` (prototype, inherited), so the check rejects that closure.
- **Convergence procedure.** None asserted (quadratic-exact closure gives roundoff error at every `N_rho`); the three grids are reported so a non-roundoff error growing with `N_rho` is visible. Rates: F2–F4 via D2-VER-REFINEMENT.
- **Pass/fail.** Pass iff all nine `L2rel ≤ 1e-6`, every march reached the `1e-14` stopping rule within the cap, and the axis-face flux is exactly `0.0` in every run. Otherwise fail.
- **Output artifact.** `d2-ver-steady.json`.

### D2-VER-EIGEN-DIRICHLET (capability C1)

- **Fixture and inputs.** F2, `t = 1`, `N_rho = 256`, `dt = 2e-6` (500 000 steps; `dt ≤ 2e-6` allowed, no larger). Amplitude at `t = 1`: `exp(−a1²) = 3.0789e-3`.
- **Expected.** Cell averages of `J0(a1 rho) exp(−a1²)`. Also report (not judged) the interpolated point value at `rho = 0.5` against `J0(a1/2) exp(−a1²)`.
- **Tolerance.** `L2rel ≤ 1e-4`. Prototype (inherited, not evidence): spatial `4.2e-5` plus temporal `≈ 0.5 a1⁴ dt = 3.3e-5` at `dt = 2e-6`, i.e. about `7.5e-5` if additive, a margin of about 1.3, so the check sits close to the limit: **a failure here is a defect or a mis-stated fixture, not a reason to loosen** (DD-6 rationale).
- **Convergence procedure.** D2-VER-REFINEMENT (spatial and temporal rates, this fixture).
- **Pass/fail.** Pass iff `L2rel ≤ 1e-4` **and** the minimum over cells of `u_i` is `≥ −1e-14 · max|u_i|` (monotonicity: an `M`-matrix scheme must not create negative values from a nonnegative mode).
- **Output artifact.** `d2-ver-eigen-dirichlet.json`.

### D2-VER-EIGEN-REFLECT (capability C1; amended, DD-6)

- **Fixture and inputs.** F3, `t = 1`, `N_rho = 256`, `dt = 1e-6` (`dt ≤ 1e-6` allowed, no larger). Amplitude `exp(−b1²) = 4.2e-7` at `t = 1`; the tolerance is relative to the solution, so the small amplitude is not an escape. Companion run: uniform mode `u = 1`, same grid, `t = 1`.
- **Expected.** Cell averages of `J0(b1 rho) exp(−b1²)`; the uniform mode is exactly conserved in total (`Σ u_i ΔV_i`); edge flux is identically `0`.
- **Tolerance.** `L2rel ≤ 1e-3` (amended from `1e-4`; DD-6). Uniform-mode total conserved to `1e-12` relative. Delivered edge flux `≤ 1e-12` of the flux scale `max_j |Φ_j|`. *Scratch re-check (fix-up):* spatial error alone `2.74e-4`, total at `N_rho = 256`, `dt = 1e-6`: `3.82e-4` (exact discrete backward-Euler solution via eigendecomposition), i.e. a margin of about 2.6 to `1e-3`.
- **Convergence procedure (mandatory report, DD-6).** Spatial rate and temporal rate by the procedures of §1, on this fixture. Theoretical orders: spatial 2, temporal 1. The observed rates must **match theory within 20%**: `p_x ∈ [1.6, 2.4]` for each of the three pairs, `p_t ∈ [0.8, 1.2]` for each of the two values. Prototype (scratch, fix-up): `p_x = 2.009, 2.002, 2.001`; `p_t = 1.002, 1.001`.
- **Pass/fail.** Pass iff **all** hold: `L2rel ≤ 1e-3`; the rate report file exists with all five rates present as numbers; all three `p_x` and both `p_t` inside their 20% bands; conservation and edge-flux tolerances. No condition can compensate for another; a missing rate report or any rate outside its band fails the check even if `L2rel ≤ 1e-3`. Any change of tolerance or band requires a Director change request.
- **Output artifact.** `d2-ver-eigen-reflect.json` (contains `L2rel`, the five rates with their inputs `e_N` or `d_k`, and the bands).

### D2-VER-MMS-CONDUCTION (capability C1)

- **Fixture and inputs.** F4, `N_rho = 128`, `dt = 1e-5`, `t = 1` (`1e5` steps).
- **Expected.** Cell averages of `w = n T = (3/2 − rho²/2) e^{−1}(1−rho²)(1+rho²/2)` at `t = 1`, compared on `w`; the source is the F4 manufactured `S_e`.
- **Tolerance.** `L2rel ≤ 1e-4` on `w`; prototype (inherited) `2.2e-5`.
- **Convergence procedure.** D2-VER-REFINEMENT (this fixture: spatial at `N_rho = 32…256`, temporal at `N_rho = 128`).
- **Pass/fail.** Pass iff `L2rel ≤ 1e-4`. The measured value and the source residual of F4 are recorded.
- **Output artifact.** `d2-ver-mms-conduction.json`.

### D2-VER-REFINEMENT (capability C1)

- **Fixture and inputs.** F2, F3, F4 and the DEFAULT shot.
  - *Spatial:* `N_rho = 32, 64, 128, 256`, procedure of §1 (Richardson removal of time error at `dt = 1e-5`), three rates per fixture.
  - *Temporal (fixtures):* `dt = 4e-5, 2e-5, 1e-5, 5e-6`; `N_rho = 256` (F2, F3) and `128` (F4); two rates per fixture.
  - *Temporal (default shot):* `N_rho = 64`, `dt = 0.004, 0.002, 0.001, 0.0005` (each divides the `5 s` shot into an integer number of steps and lands on the sample times), quantities: first-cell and last-cell `T_e` at `t = 0.5, 2, 3, 4.5 s` (8 quantities); `d_k = |x(dt_k) − x(dt_{k+1})| / |x(dt_4)|` for `k = 1, 2, 3` (normalised by the finest-step value, `dt_4 = 0.0005`), `p_t,k = log2(d_k/d_{k+1})`, two rates per quantity; the step-function heating at `1 s` and `4 s` is present, hence the wider band.
- **Expected.** Spatial order 2, temporal order 1 (`d2-profiles.md` §8).
- **Tolerance (bands).** Spatial `[1.8, 2.2]`; temporal fixtures `[0.85, 1.15]`; default shot `[0.7, 1.3]`. For F3 the DD-6 20% bands `[1.6, 2.4]` and `[0.8, 1.2]` are the mandatory outer bands (they contain the bands above, so passing the bands above passes them). Inherited prototype: spatial `1.88–2.01`, temporal `1.000`; scratch (fix-up) F3 `2.001–2.009`, `1.001–1.002`.
- **Convergence procedure.** As defined in §1; every rate is written to the artifact with its inputs; roundoff exemption per §1 (not for F3).
- **Pass/fail.** Pass iff every judged rate is inside its band and every fixture has all its rates reported (`3` spatial + `2` temporal for each of F2, F3, F4; `2` temporal for each of the `8` default-shot quantities: `15 + 16 = 31` rates).
- **Output artifact.** `d2-ver-refinement.json`.

### D2-VER-PARITY (capabilities C2, C3)

- **Fixture and inputs.** Cases: the six frozen control sets of `tests/m02.test.mjs` line 8 — DEFAULT, `nbi:0`, `gas:0`, `nbi:8`, `gas:5`, all-zero (`nbi:0, ech:0, gas:0`) — at default coefficients (`D = 0.1`, `chi_e = chi_i = 3.0`), plus all-zero at `chi_e = chi_i = 5`; each at `N_rho ∈ {32, 64, 128}` × `dt ∈ {0.004, 0.002, 0.001}` (7 cases × 9 = 63 runs). 0-D totals `postN, postWe, postWi` (and step-0 `initialN, initialWe, initialWi`) taken from the M02 `observer` of the same run; profile totals `Σ x_i ΔV_i` from the verification-only observer.
- **Expected.** `Σ_i x_i ΔV_i = X_0D` for `X = N, We, Wi`, after every accepted step and at step 0 (algebraic identity, `d2-profiles.md` §9).
- **Tolerance.** `|Σ x_i ΔV_i − X_0D| / X_0D ≤ 1e-9` at every step (prototype, inherited: about `1e-12…7e-11` cumulative at `N_rho = 64`).
- **Convergence procedure.** None (identity, not an approximation).
- **Pass/fail.** For each run, the maximum over steps and over `X` is recorded; pass iff every completing run has maximum `≤ 1e-9`. A run that throws is checked over the steps accepted before the throw and is listed for D2-VER-FAILSAFE; it is not counted as a parity pass or failure of the remaining steps. Parity verifies implementation consistency, not physical accuracy (`d2-profiles.md` §9).
- **Output artifact.** `d2-ver-parity.json` (per-run maximum error, step and quantity at which it occurs).

### D2-VER-LEDGER (capabilities C2, C3)

- **Fixture and inputs.** Every PARITY run; an independent cell-resolved oracle (test-only) restates the 0.1.0 source and loss formulas as `tests/m02/ledger.mjs` does and restates the shapes `h(rho)`, `jt`, `eta` from `d2-profiles.md` §6, and uses only the exported post-step profiles, exported prescribed edge fluxes and the M02 pre-step totals.
- **Expected.** For each cell `i` and species `s ∈ {n, w_e, w_i}`: residual `R_i^s = (x_i^{k+1} − x_i^k) ΔV_i − dt (Φ_{i−1}^{k+1} − Φ_i^{k+1} + Σ_q c_{i,q}^{k})` `= 0`, where faces are `j = 0…N_rho`, cell `i` lies between faces `i−1` and `i`, `Φ_j` is the rate leaving through face `j` in the outward direction, recomputed by the oracle from the post-step profiles as `Φ_j = −A_j (coefficient/L²)(x_{j+1} − x_j)/h` with `A_j = 2 V rho_j`, `rho_j = j/N_rho`, `h = 1/N_rho`, coefficient `D` for `n` and `(3/2) KEV n_face chi` for `w_s` (`n_face` = arithmetic mean of the two adjacent post-step `n`) (`Φ_0 = 0`; `Φ_{N_rho}` = the prescribed edge flux from the observer), and `c_{i,q}` are the restated source, sink, exchange, ionisation, radiation and Ohmic cell contributions (left-endpoint, pre-step state).
- **Tolerance.** `|R_i^s| / max(|x_i^k ΔV_i|, dt Σ_q |c_{i,q}| + dt |Φ_{i−1}| + dt |Φ_i|) ≤ 1e-10` for every cell and species and step; species totals closed to `1e-10` relative to `max(inventory, Σ|contributions|)`; each source shape integrates to `1` on the discrete cell volumes within `1e-13`; delivered edge flux equals prescribed within `1e-12` relative.
- **Anti-tautology (mutation) procedure.** On a copy of a clean DEFAULT trace (`N_rho = 64`, `dt = 0.002`), apply, one at a time, all at step `750` (`t = 1.5 s`, heating on): (a) `+1e-6 · N` (with `N` the 0-D inventory at that step) added to density cell `32` (`1` mutation); (b) `1e-6 · We` (0-D inventory at that step) moved from `w_e` cell `10` to `w_e` cell `50`, and separately from `w_e` cell `10` to `w_i` cell `10`, totals conserved in each case (`2` mutations); (c) the oracle's shape multiplied by `(1 + 1e-6)` for one shape at a time — NBI, ECH, gas, bremsstrahlung, Ohmic (`5` mutations, a `1e-6` normalisation error each). For every mutation the maximum normalised residual must exceed `1e-10`, and the ratio residual/tolerance is recorded.
- **Convergence procedure.** None.
- **Pass/fail.** Pass iff the clean traces of all completing PARITY runs are within tolerance **and** all eight mutations (1 + 2 + 5) are rejected (each ratio `> 1`). A mutation that passes means the oracle is tautological and fails the check.
- **Output artifact.** `d2-ver-ledger.json` (per-run maxima; per-mutation residual, tolerance and ratio).

### D2-VER-FAILSAFE (capability C3; amended, DD-7)

- **Fixture and inputs.**
  - (i) All-zero-auxiliary controls (`nbi:0, ech:0, gas:0`) with default coefficients `chi_e = chi_i = 3`, `N_rho = 64`, `dt = 0.002`; the same controls profile-off.
  - (ii) Kernel-level (verification-only entry), normalised, `N_rho = 16`, `dt = 0.1`, uniform initial `n = w_e = w_i = 1`, zero-flux edge, `D = chi_e = chi_i = 0` (pure-source kernel run, so only cell `10` can be affected and the reported cell is unambiguous), each of: (ii-a) `S_e = −1e3` in cell `10` only; (ii-b) `S_n = −1e3` in cell `10` only; (ii-c) `S_e = NaN` in cell `10` only. Other sources `0`.
  - (iii) **TypeScript sweep driver** (DD-7) over: DEFAULT; the C1 ordered grid of `expand_cases` in `python/d3gate/sweep.py` (baseline plus `ip ∈ {0.9, 1.2, 1.5}` × `nbi ∈ {2, 4, 6}`; Software cites the list at implementation); the `2^7 = 128` corners of the `LIMITS` box (each control at its minimum or maximum); default coefficients, `N_rho = 64`, `dt = 0.002`. The Python C1 harness is not run with profiles on (DD-3, DD-7).
- **Expected.** (i) profile-on throws an error containing the fixed substring `profile constraint violated`, with a time value in seconds and a cell index in `[1, 64]`, not containing the 0-D message "left its valid thermal-plasma regime"; profile-off completes. (ii-a) throws at the first step with cell index `10` and `T_e ≤ 0`; (ii-b) throws at the first step with cell index `10` and `n ≤ 0`; (ii-c) throws at the first step with cell index `10` (nonfinite value). In all of (ii) no state is returned, and the observer trace contains only accepted steps (no partial or clipped step). (iii) every run completes or throws; each completion satisfies the checks below. Software documents the exact message grammar (the test asserts the fixed substring plus a parsable time and cell index).
- **Tolerance.** Completions of (iii): parity `≤ 1e-9` (PARITY procedure) and ledger `≤ 1e-10` (LEDGER procedure), all cell values finite and strictly positive; zero exceptions. Time of failure in (i) is reported and **not asserted** (prototype `≈ 4.9 s`, not evidence).
- **Convergence procedure.** None.
- **Pass/fail.** Pass iff (i), (ii-a/b/c) behave as Expected, and in (iii) zero runs are silent violations (a completion with a non-finite, non-positive or clipped value, or with a parity/ledger violation), DEFAULT completes, and the list of throwing control sets with error times is written to the artifact. The count of runs `1 + 9 + 128 = 138` (the `baseline` case of `expand_cases` is DEFAULT, counted once; corner or grid points coinciding with another control set are still run and counted) must equal the number reported.
- **Output artifact.** `d2-ver-failsafe.json` (per-run status `completed | threw`, error text, time, cell, and for completions the parity and ledger maxima).

### D2-VER-DIAGNOSTICS (capability C4; DD-10)

- **Fixture and inputs.** Via the diagnostics evaluator on supplied cell arrays, plus exported profiles of PARITY runs.
  - (A1) `N_rho = 64`, uniform `n = 3e19 m^-3`, `T_e = 1 keV` (above the C-M01-Te_floor `0.02 keV`), `jt = 1` (`gamma = 0`).
  - (A2) `N_rho = 256` and `64`: uniform `n`, `T_e = T0 (1 − rho²)` as cell averages, `T0 = 2 keV`, `V = 23.11 m³`.
  - (A3) `N_rho = 256` and `64`: uniform `n`, uniform `T_e = 1 keV`, `jt = (1 − rho²)^gamma` as cell averages, `gamma = 1` and `gamma = 2`.
  - (A4) edge-value rule (DD-10) on injected cell arrays, `N_rho = 64`, for each of `n`, `T_e`, `T_i`: hand cases `(x_{N−1}, x_N) = (2, 1) → 0.5`, `(1, 0.4) → 0.1`, `(1, 0.2) → raw −0.2, reported 0, clip flag true`; and profile linear in `rho`, `x = a + b rho` (cell averages, `a = 1`, `b = −0.5`), expected value from the rule `max((3/2) x_N − (1/2) x_{N−1}, 0)` on the injected averages.
  - (A5) `T_e,avg` identity: `T_e,avg = We/((3/2) N KEV)` (0-D value) against the `n`-weighted profile mean `∫ n T_e V' drho / ∫ n V' drho`, on PARITY-run exports.
  - (A6) Independent recomputation of `C_br`, `C_ohm`, edge values (with clip flags) and edge fluxes on exported profiles of the DEFAULT run at `t = 2, 3, 4.5 s` (`N_rho = 64`, `dt = 0.002`).
- **Expected.** (A1) `C_br = C_ohm = 1`. (A2) `C_br = 2√2/3 = 0.9428090416` (`∫ sqrt(1−rho²) 2 rho drho = 2/3`, `T_e,avg = T0/2`). (A3) `C_ohm = 4/3` (`gamma = 1`), `9/5` (`gamma = 2`) (`<jt²>/<jt>²` with `<(1−rho²)^k>_V = 1/(k+1)`). (A4) the three hand values exactly; the linear case equals the rule's output. Reported, not judged, in (A4): the difference of the linear-case output from the analytic edge value `a + b = 0.5`, expected `O(h²)` (about `b h²/12 ≈ 1e-5` at `N_rho = 64`, rate about 2 across `N_rho = 32, 64, 128`). (A5) equal. (A6) test-oracle values.
- **Tolerance.** (A1) `≤ 1e-12`. (A2), (A3) at `N_rho = 256`: relative `≤ 2e-4` (discretisation error of the cell-value evaluation; *scratch, fix-up*: `5.6e-5` for `C_br`, `1.0e-5` and `1.5e-5` for `C_ohm`; at `N_rho = 64`: `4.2e-4`, `1.6e-4`, `2.4e-4`, reported, not judged; the `2e-4` bound is a discretisation allowance, illustrative, with margin about 3.6 and 13). (A4) hand and rule values `≤ 1e-12` relative (absolute `1e-15` where the value is `0`); clip flag exact. (A5) `≤ 1e-9` relative. (A6) `≤ 1e-9` relative for each of `C_br`, `C_ohm`, `n(1)`, `T_e(1)`, `T_i(1)` and the delivered edge fluxes.
- **Convergence procedure.** For (A2)/(A3) the errors at `N_rho = 64` and `256` must decrease, error ratio `≥ 4` (recorded); no band on the rate. For (A4) reported as above.
- **Pass/fail.** Pass iff (A1)–(A6) meet their tolerances, every anchor's measured value is recorded, and the `N_rho = 256` errors are smaller than the `N_rho = 64` errors by at least the factor stated. The anchors are fed cell-average arrays through the evaluator, so the check does not depend on how production evaluates `jt(rho)` (open item, `d2-profiles.md` §15).
- **Output artifact.** `d2-ver-diagnostics.json`.

### D2-VER-OFFPATH (off-path guarantee; DD-2)

- **Fixture and inputs.** For each of: option absent, `undefined`, `{enabled: false}`, and `{enabled: false, N_rho: -1, chi_e: NaN}` (option field names are those of the proposed constants `C-D2-*`: `N_rho`, `D`, `chi_e`, `chi_i`, `rho_NBI`, `sigma_NBI`, `rho_ECH`, `sigma_ECH`, `gas_exponent`, `jshape_gamma`; the spec's `rho_N`, `sigma_N`, `rho_E`, `sigma_E`, `m`, `gamma` correspond respectively; Software documents the final spelling and the test uses it): the frozen M02 case set (six control sets of `tests/m02.test.mjs` line 8, `dt = 0.002`, default `closure`) and the control set stored in `experiments/baseline/m01-shot.json` at its recorded settings. Invalid-option cases with `enabled` set to each of `0`, `1`, `'true'`, `null`, `[]`, `{}`; and with `enabled: true`: each of `N_rho ∈ {15, 257, 64.5, NaN}`, `D ∈ {0.02, 1.01, NaN, Infinity}`, `chi_e ∈ {1.4, 10.1}`, `chi_i ∈ {1.4, 10.1}`, `rho_NBI ∈ {−0.1, 0.71}`, `sigma_NBI ∈ {0.09, 0.41}`, `rho_ECH ∈ {−0.1, 0.81}`, `sigma_ECH ∈ {0.04, 0.26}`, `gas_exponent ∈ {1, 9}`, `jshape_gamma ∈ {−0.1, 2.1}` (each one out-of-range or non-finite value with all others valid), and partial coefficient sets (`{enabled: true, chi_e: 3}` alone). Profiles-on comparison run: DEFAULT, `N_rho = 64`, `dt = 0.002`.
- **Expected.** Off variants: output `Object.is`-identical (deep, same key sets and order) to the 0.1.0 reference output, `modelVersion === '0.1.0'`, `schemaVersion === 1`, no `profiles` key; the invalid field beside `enabled: false` does not throw. Non-boolean `enabled` throws (never coerced). With `enabled: true`, each invalid value throws **before** any stepping (the M02 observer receives no call; verified by a counting observer) and a partial coefficient set throws rather than defaulting. Profiles on (DEFAULT): every original `Shot` field `Object.is`-identical to the off run except `modelVersion` (`'0.2.0'`) and the added `profiles` key; `schemaVersion === 1`.
- **Tolerance.** Exact (`Object.is`, no numeric tolerance).
- **Convergence procedure.** None.
- **Pass/fail.** Pass iff zero differences in all cases above, every listed invalid input throws and no listed valid input throws, and all existing `tests/` and `python/tests/` pass unchanged. Diff review of the production `runShot` (not this test) covers operation order.
- **Output artifact.** `d2-ver-offpath.json` (per-case count of compared fields and differences found, which must be `0`).

## 4. Status of earlier deviations and open items

- **D-1 (F3 tolerance): resolved by DD-6.** F3 tolerance `1e-3` with a mandatory 20% convergence-rate report; the earlier proposal `5e-4` is superseded.
- **D-2 (AC-9 harness): resolved by DD-7.** Profile-on sweeps use the TypeScript driver; the Python C1 harness compares profile-off paths only until the follow-up parity unit.
- **D-3 (versions): resolved by DD-8.** Physics `0.2.0` (profiles on), verification `0.3.0`, profile-off `0.1.0`/schema `1`. `science/model_versions.json` (DD-4 convention) receives a `physics` entry `0.2.0` and a `verification` entry `0.3.0`; the number `0.2.0` therefore appears in both namespaces (M02's verification `0.2.0` is not relabelled), so consumers must key on `(kind, version)`. Open for the Director: the registry's top-level `physicsModelVersion` field while profile-off is the default path.
- **Edge-value extrapolation and `T_e,avg`: resolved by DD-10**, defined in `d2-profiles.md` §4 and tested by D2-VER-DIAGNOSTICS (A4–A6).
- **Corrections carried by this pass.** The Part B analytic anchors of D2-VER-DIAGNOSTICS were stated at `1e-9`, which a discrete grid cannot meet against a closed form (errors `≈ 1e-4` at `N_rho = 64`); they are restated with a discretisation allowance and the `1e-9` bound is kept for the independent recomputation of the same discrete data.
- **Open (not decided here).** Evaluation point of `h(rho)` and `jt(rho)` (cell centre or cell average): `d2-profiles.md` §15.

## 5. What these tests cannot show

They verify equations, discretisation order, conservation and the opt-in contract. They do not show that `chi`, `D`, source shapes or the passenger closure are physically right, nor any agreement with DIII-D. Passing them leaves the capability experimentally unvalidated.
