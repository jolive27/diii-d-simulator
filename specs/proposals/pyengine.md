# Python engine reimplementation — normative specification

Capability `pyengine` (proposal PYENGINE-PORT-001). Physics model **0.1.0** unchanged. Verification version **0.2.0**. Status: DRAFT-NOT-APPROVED.

## Purpose

Port the sole physics implementation (`physics/engine.ts`, model 0.1.0) to Python as the preferred implementation language going forward, introducing **no change** to any equation, assumption, constant, unit, control limit, default, export schema or accepted numerical behavior. The TypeScript engine remains the in-repository established reference implementation for cross-engine comparison (see `pyengine-reference.json`).

The browser remains a consumer of exported results; the web app still contains no physics computation, LLM calls or agent orchestration. Python owns new tooling (for example the `d3gate` Jev gate) and, with this capability, the engine itself.

## Implementation contract

The Python engine lives under `python/d3gate/engine.py`, written with NumPy vectorization for geometry/integration and SciPy only where it replaces hand-rolled LAPACK-free kernels (none are required by the reduced model). It must replicate the TypeScript engine's deterministic API (`physics/api.ts`):

- `run_shot(config)` -> shot (controls, volume, dt, samples, assumptions)
- `get_metrics(shot)` -> aggregate `ShotMetrics`
- `parameter_sweep(config, control, values)` -> shot[] (ordered, all-or-nothing)
- `export_results(shot, format)` -> json/csv text
- `run_benchmark(name)` for `baseline`, `analytic-solovev`, `shaped-convergence`, `m02`

The following invariants from `science/equations.md` are normative and must be reproduced exactly (units, formulas, and control flow):

1. **State and conversions**: internal `N` (electrons and equal deuterium ion number), `We, Wi` (J), fixed `V` (m³); `ne=N/V`, `Te=We/(1.5 N KEV)`, `Ti=Wi/(1.5 N KEV)` with `KEV=1.602176634e-16`; `pbar=2(We+Wi)/(3V)`; export in MA/MW/MJ/10¹⁹ m⁻³; `beta=100×2 mu0 pbar/Bt²`.
2. **Geometry**: boundary `R=R0+a cos(theta+asin(delta) sin(theta))`, `Z=kappa a sin(theta)`, 160-interval polyline; odd grid 17–129 (default 49) over `R0±1.04a`, `Z=±1.04 kappa a`; interior-mask membership rule with `z=Z/(kappa a)`, `t=asin(z)`, `shift=asin(delta) z`; `V=sum(2 pi R dA)`, `C=sum(R dA)`, `D=sum(dA/(mu0 R))` on masked cells only.
3. **Basis / SOR**: solve `Delta* u=-mu0 R²` and `Delta* v=-1` with the documented stencil `L f=(1/dR²+1/(2R dR)) f_left+(1/dR²-1/(2R dR)) f_right+(f_down+f_up)/dZ²-2(1/dR²+1/dZ²) f_center`; in-place SOR omega 1.7, at most 12000 sweeps, residual check every 20 indexed sweeps with threshold `1e-8` normalized as in the TypeScript engine; throw when exceeded.
4. **Equilibrium closure**: `h=ubar-C vbar/D`, `q=I vbar/D`, `disc=q²+4h pbar`; `A=0` for zero mean pressure else `A=2pbar/(q+sqrt(disc))`, `B=(I-A C)/D`; reject negative discriminant, masked `psi<-1e-10`, and masked `F²<=0` (returns unsupported status, never a half-answer).
5. **Waveform and closures**: `Ip(t)` ramped 0–1 s, flattop 1–4 s, down 4–5 s; NBI/ECH active only on `[1,4)` s; `tauE`, `tauP=1.6`, and `eta=2.8e-8 max(Te,0.02)^-1.5` formulas exactly as transcribed, including the same floors on function arguments (floors touch arguments, not state).
6. **Sources and evolution**: `Sgas=0.3 gas×1e21`, `Sbeam=0.8 Pnbi/(80 KEV)`, `Pe=0.8×0.35 Pnbi+0.9 Pech`, `Pi=0.8×0.65 Pnbi`, `Pohm=eta(2 pi R0)² I²/V`, `Pbr=1.69e-38 ne² sqrt(1000 Te) V`, `Pion=0.0136 KEV Sgas`, `Qei=(We-Wi)/0.25`; explicit Euler with `steps=round(5/dt)`, actual `dt=5/steps`, default 0.002 s; sampling every `max(1,round(0.02/dt))` steps and at the final step, recording pre-update state and rates; nonfinite `We+Wi+N` or nonpositive individual state throws with no clipping.
7. **Ledgers**: `Ein+=dt(Pe+Pohm+Pi)`, `Eout+=dt(We/tauE+Pbr+Pion+Wi/tauE)`, `Nin+=dt(Sgas+Sbeam)`, `Nout+=dt N/tauP`; errors `(We+Wi-2W0-Ein+Eout)/max(2W0,Ein)` and `(N-N0-Nin+Nout)/max(N0,Nin)`.

## Floating-point compatibility

Both engines use binary64 IEEE-754. Identical formulas give near-identical results; residual differences come from summation ordering and `libm` elementary functions. Ledger and volume/`C`/`D` sum nesting must follow the TypeScript engine where it changes results outside the budget. The cross-engine discrepancy budget is:

| Quantity | Tolerance (relative) |
| --- | --- |
| Aggregate scalars (peak Te, Ti, ne, thermal energy, beta, final tauE, volume) | `1e-9` |
| Pointwise sample fields (any exported field) | `1e-6` |
| Equilibrium diagnostics (psi axis/peak, mean pressure, integrated current) on shared grids | `1e-6` |
| Determinism (same input, same runtime) | bitwise equal |

Any exceeded tolerance is a recorded discrepancy requiring cause analysis and a Director-approved change request. Retrospective tolerance loosening is prohibited.

## Verification checks (requiredChecks)

- `PYENGINE-VERIFY`: primary test suite `python/tests/test_pyengine.py` executes and its named sub-checks below pass.
- `PYENGINE-BASELINE-METRICS`: default baseline shot aggregate metrics match the TypeScript engine within `aggregateRelative`.
- `PYENGINE-TIMESERIES-MATCH`: full exported sample time series match pointwise within `pointwiseRelative`.
- `PYENGINE-SWEEP-MATCH`: ordered single-control sweep across every control's `LIMITS` step grid matches aggregate metrics within budget on every case.
- `PYENGINE-CONSERVATION`: per-sample energy/particle balance errors match the TypeScript engine within budget.
- `PYENGINE-EQUILIBRIUM-MATCH`: `analytic-solovev` and `shaped-convergence` fixture diagnostics match on shared grids within budget.
- `PYENGINE-DETERMINISM`: identical input produces bitwise-identical output across repeated runs on the same runtime.
- `PYENGINE-LEGACY-TESTS`: existing committed tests that exercise engine behavior still pass unchanged (TypeScript suite).
- `PYENGINE-SCIENTIFIC-SCOPE`: no equation, assumption, constant, control limit, default, export schema or runtime model-version change versus 0.1.0.
- `PYENGINE-LINT`: Python engine lint/type checks pass (configured tooling only; stdlib-only test execution).

## Registry and versioning

The physics model version stays **0.1.0**. The Python engine exposes `modelVersion: "0.1.0"` plus `implementationVersion` (e.g. `0.1.0-python-numpy`) and a source fingerprint of its files. `science/model_versions.json` gains a `kind: "implementation"` entry recording this spec and its approval. Acceptance is a Director decision after independent Validation reviews the evidence against the frozen source hash; a changed implementation requires fresh evidence, never a substituted hash.

Materially altering any of the above floating-point or scientific invariants is a physics capability change requiring a new change request, updated artifacts, and re-approval. This capability intentionally changes the implementation source only.