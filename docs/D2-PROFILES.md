# D2 profiles (implementation notes, unit d2-profiles, software lane)

Illustrative, uncalibrated and **experimentally unvalidated**. Authority: `specs/proposals/d2-profiles.md`, `specs/change-requests/D2-PROFILES-001.json`, `experiments/records/d2-profiles-design-decisions.json` (DD-1..DD-19). Python does not implement profiles (DD-3).

## Opt-in

`runShot(controls, geometry, dt, closure, observer, profiles)`; `profiles` is the sixth and last optional argument.

- absent, `undefined` or `{enabled:false}` -> the 0.1.0 model, output identical to 0.1.0 (`modelVersion '0.1.0'`, `schemaVersion 1`, no `profiles` key). No other field is read.
- `enabled` must be a boolean (never coerced). With `enabled:true` all ten of `N_rho, D, chi_e, chi_i, rho_NBI, sigma_NBI, rho_ECH, sigma_ECH, gas_exponent, jshape_gamma` are required (no silent defaults; unknown fields throw) and validated against `PROFILES_RANGES` before any stepping. `PROFILES_DEFAULTS` in `physics/profiles.ts` holds the approved `C-D2-*` values for callers to pass explicitly.
- on -> original `Shot` fields are `Object.is`-identical to the off run except `modelVersion '0.2.0'`; a `profiles` block is added.

## `shot.profiles`

`status`, `units`, `options` (resolved), `grid` (`N_rho`, cell-centre `rho`, `volume`, `L2`), `samples[]` (one per 0-D sample, same index and `t`), `maxParity`, `maxLedger`.
Sample: `n` [1e19 m^-3], `te`, `ti` [keV] per cell; `edge` values (linear extrapolation from the last two cell centres, clipped to >= 0, with `clipped` flags; diagnostic only); `edgeFlux` = the prescribed losses `N/tauP` [s^-1], `We/tauE`, `Wi/tauE` [W] of the 0-D state at that sample time (same convention as the 0-D `pLoss`); `cBr`, `cOhm`; `parity` (relative `|sum x dV - X_0D|/X_0D` for N, We, Wi); `ledger` (kernel's own last-step per-species cell residual: consistency, not independent evidence).

## Failure

After each step every unclipped cell is checked; failure throws `profile constraint violated at t=<t> s in cell <i>: <q> <r>` (`t` = start time of the rejected step, `toFixed(6)`; `i` 1-based; `q` in `n|T_e|T_i`; `r` in `<= 0|nonfinite`). The 0-D guard runs first, so a 0-D failure reports the 0-D message. The M02 observer only sees steps accepted by both.

## Verification-only entries (`physics/profiles.ts`, not reachable through `runShot` options)

`runProfileKernel(spec)` (arbitrary V, L2, D, chi, per-cell source arrays or functions, `flux`/`dirichlet` edges with a quadratic-exact Dirichlet closure, `freezeN`, initial arrays, per-step observer, `enforceConstraint:false` for the sign-changing reflecting eigenmode), `evaluateDiagnostics`, `edgeValue`, and `withProfileStepObserver(observer, fn)` which delivers every accepted passenger step of `runShot` calls made inside `fn`. Tests: `tests/d2-profiles.test.mjs`, helpers `tests/d2/`, evidence `tests/d2/evidence/d2-ver-<check>.json`.

## Verification (ten checks, verification version 0.3.0)

Specification: `specs/proposals/d2-profiles-verification.md` (approved; hash-bound in D2-PROFILES-001). One `test()` per check in `tests/d2-profiles.test.mjs`; helpers in `tests/d2/` (`fixtures.mjs` analytic fixtures F1–F4, own J0/J1 series, Gauss–Legendre cell averages, convergence procedures and the AC-7 accumulator; `ledger.mjs` independent oracle; `trace.mjs` per-run parity/ledger/positivity trace; `sweep-driver.mjs` the 138-run TypeScript sweep; `worker.mjs`/`pool.mjs` worker threads for the long fixture runs). Each check writes `tests/d2/evidence/d2-ver-<check>.json` (`runs[]`, every measured number with its tolerance and ratio, top-level `pass`).

| Check | What it shows | Evidence file |
|---|---|---|
| D2-VER-OFFPATH | profile-off output identical (`Object.is`) to frozen 0.1.0; invalid options throw before stepping; profile-on is a passenger | `d2-ver-offpath.json` |
| D2-VER-PARITY | `Σ x ΔV = X_0D` for N, We, Wi every step, 63 runs | `d2-ver-parity.json` |
| D2-VER-LEDGER | independent cell-resolved oracle closes every ledger; eight perturbations are rejected (state ≥ 1e-8; shape ≥ max(1e-10, 100 × clean residual), DD-20) | `d2-ver-ledger.json` |
| D2-VER-FAILSAFE | (i) all-zero controls stop with the fixed-grammar error; (ii) kernel sources; (iii) 138-run sweep (DEFAULT + nine-case C1 grid + 128 `LIMITS` corners), no silent violation | `d2-ver-failsafe.json` (`complete:true`) |
| D2-VER-STEADY | F1 steady state, normalised and SI (density, electron energy), N_rho 16/64/256, L2rel ≤ 1e-6 | `d2-ver-steady.json` |
| D2-VER-EIGEN-DIRICHLET | F2 at t = 1, N_rho 256, dt 2e-6, L2rel ≤ 1e-4 | `d2-ver-eigen-dirichlet.json` |
| D2-VER-EIGEN-REFLECT | F3, L2rel ≤ 1e-3 plus five mandatory rates in the 20% bands | `d2-ver-eigen-reflect.json` |
| D2-VER-MMS-CONDUCTION | F4 manufactured conduction, L2rel ≤ 1e-4 | `d2-ver-mms-conduction.json` |
| D2-VER-REFINEMENT | 31 rates (spatial 2, temporal 1) on F2–F4 and the default shot | `d2-ver-refinement.json` |
| D2-VER-DIAGNOSTICS | A1–A6: C_br/C_ohm anchors, edge-value rule, T_e,avg identity, independent recomputation (AC-8) | `d2-ver-diagnostics.json` |

AC-7 sub-checks (axis flux exactly `0`, edge flux, shape normalisation, discrete maximum principle) are recorded inside the evidence of the checks that exercise them: (a),(b),(d) on F1–F4 in the fixture checks, (a),(b),(c) on the DEFAULT run in LEDGER.

Run: `npm test` (all), or one check: `node --experimental-strip-types --test --test-name-pattern="D2-VER-REFINEMENT" tests/d2-profiles.test.mjs`. The long fixture runs are started in worker threads when the file loads (so a filtered run still executes them). Full `npm test` is about 40 s on an 8-core machine (the D2 file alone about 30 s); F2/F3 at 5·10^5 and 10^6 steps and the refinement grids are the slow part.

Interpretation notes (recorded, not scientific choices): (1) DD-21's discrete maximum principle is applied with the Dirichlet edge value included in the bounds (`[min(min u(0), u_edge), max(max u(0), u_edge)]`; the literal interval excludes it and a decaying Dirichlet mode leaves it); the literal excess is reported. The source-driven F1 marches start from 0 and rise, so DD-21 is applied to a diffusion-only F1 companion (steady shape decaying) and the marches are checked for no new negative values. (2) The axis flux is `V'(0) = 0` by construction; `Object.is(flux, 0)` on the reported value is complemented by the independent ledger oracle closing cell 1 with `Φ_0 = 0` exactly. (3) The A6/AC-8 recomputation restates the same formulas in the same summation order, so agreement is at roundoff; the discriminating evidence is the analytic anchors A1–A4.

These tests verify equations, discretisation order, conservation and the opt-in contract. They do not validate the profiles against DIII-D or any experiment.
