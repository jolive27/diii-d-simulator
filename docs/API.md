# Callable simulator API

`physics/api.ts` is a synchronous, deterministic wrapper around the unchanged M01 engine. It has no browser, filesystem, network, or process side effects. The callable M02 benchmarks add numerical verification of unchanged M01 physics; they do not establish scientific validation or milestone acceptance.

```ts
import { run_shot, run_benchmark, parameter_sweep, get_metrics, export_results } from './physics/api.ts';

const shot = run_shot({ controls: { nbi: 8 }, gridSize: 49, dt: 0.002 });
const baseline = run_benchmark('baseline');
const sweep = parameter_sweep({ controls: { ech: 1 } }, 'nbi', [4, 6, 8]);
const metrics = get_metrics(shot);
const json = export_results(shot); // Caller chooses whether to save this string.
const csv = export_results(shot, 'csv');
```

## Contracts

- `run_shot(config?: ShotConfig): Shot` accepts optional `controls`, `gridSize`, and `dt`. Controls are a partial M01 `Controls` object, merged over the existing defaults. Grid size defaults to 49 and must be an odd integer from 17 through 129. Requested time step defaults to 0.002 seconds and must be finite, positive, and at most 0.01 seconds. The engine adjusts it to `5 / round(5 / dt)` to finish at five seconds; `shot.dt` records the effective value. Unknown fields and invalid controls throw. Each run recomputes geometry for its controls. Configurations and defaults are never mutated.
- `run_benchmark('baseline'): Shot` returns exactly `run_shot()`. The overloads `'analytic-solovev'`, `'shaped-convergence'`, and `'m02'` return the numerical measurement structures described below. Unsupported names throw. Results contain measurements and limitations, not independent approval decisions.
- `parameter_sweep(config, control, values): Shot[]` varies one control across a nonempty array of values. Results follow input order, including duplicates; each is independently allocated. All other configuration values remain fixed. Any invalid value or engine failure throws, and no partial result is returned.
- `get_metrics(shot): ShotMetrics` summarizes stored samples: count, first/last time, peak electron/ion temperature, density, total thermal energy, beta, and maximum absolute tracked energy/particle conservation errors. Peaks are sampled maxima, not continuous extrema. Empty samples throw. This accepts an engine-produced `Shot`; it is not an arbitrary JSON validator.
- `export_results(shot, format?: 'json' | 'csv'): string` defaults to pretty JSON containing the complete existing Shot schema. CSV contains one header row and all stored sample rows with a final newline. CSV omits controls, assumptions, versions, volume, and time-step metadata; use JSON for complete provenance. Unsupported formats throw. This accepts an engine-produced `Shot` and does not write files.

Returned shots keep the existing `schemaVersion: 1`, `modelVersion`, controls, volume, effective time step, samples, and assumptions. Default API output is deeply identical to `runShot(DEFAULT, geometry(DEFAULT))`. The API does not compute or export selected-time equilibrium; that remains a separate engine operation.

## Units

Control units are plasma current `ip` in MA, toroidal field `bt` in T, NBI/ECH powers in MW, and `gas` in the existing engine's fueling-control units (the source remains `0.3 * gas * 1e21` particles/s). Elongation `kappa` and triangularity `delta` are dimensionless. Limits and defaults are defined in `physics/engine.ts`.

CSV columns follow the existing sample fields: `t` in s; `ip` in MA; `ne` in 10^19 m^-3; `te`/`ti` in keV; `we`/`wi` in MJ; `nbi`/`ech`/`pOhm`/`pLoss`/`pRad` in MW; `tauE` in s; `pressure` in Pa; `beta` in percent; and `energyError`/`particleError` as dimensionless tracked relative residuals. Volume is in m^3. Metric field names encode these units.

## Verification

Run the API and existing engine tests with Node supporting TypeScript stripping:

```sh
node --experimental-strip-types --test tests/api.test.mjs tests/physics.test.mjs
```

The API tests check exact baseline and custom-run equivalence, configuration failures, ordered independent sweeps, known-sample summaries, and JSON/CSV fidelity. They do not replace independent scientific validation.


## M02 numerical measurement APIs

`physics/verification.ts` exports `analytic_benchmark()`, `shaped_benchmark()`, and `run_verification()`. The named `run_benchmark` overloads forward to these pure functions. Physics model version remains `0.1.0`, and verification version is `0.2.0`.

`analytic_benchmark()` returns three rectangle rows for n=33/65/129 and adjacent refinement orders. Each row records grid spacing, production basis residual/iterations, flux L2/Linf error, boundary error, exact-stencil identity error, pointwise pressure/current errors, exact-flux derivative error, numerical and independent analytic current/mean-pressure integrals, and grid/interpolated axis estimates. The quartic analytic formula and limits come from the approved M02 specification. The rectangle uses endpoint-derived spacing (`min + i * ((max-min)/(n-1))`); its prescribed nonzero boundary uses the existing production SOR solver. Truncation identity metrics are raw double precision and sensitive to cancellation at n=129. Complete-rectangle current integration uses independent central derivatives inside and one-sided second-order derivatives on edges, then composite trapezoidal quadrature.

`shaped_benchmark()` returns default-triangularity and delta-zero cases at fixed Ip=1.2 MA, Bt=2 T and pbar=30000 Pa, on n=33/65/129. Rows contain geometry, flux/F², pressure/current constraints, residual, axis, and two directed boundary distances measured against 4096 parametric curve intervals. Refinement measurements include relative volume/peak changes, axis displacement, and reported difference ratios/orders. No global second-order gate is claimed for the staircase masks.

`run_verification()` combines these two benchmark datasets. It does not run the separate regression, independent ledgers, timestep tests, type checking, or production build, and does not create an independent validation report. Those checks remain mandatory for Director acceptance.

To emit deterministic developer evidence with runtime and source hashes:

```sh
node --experimental-strip-types tools/run-verification.mjs m02
node --experimental-strip-types --test tests/api.test.mjs tests/physics.test.mjs tests/m02.test.mjs
```

The CLI writes JSON to stdout only and exits nonzero for unsupported names, failed solves, or nonfinite numbers. It does not accept a milestone or overwrite independent reports.

## Optional production observability and boundary data

`basis(g, {u, v})` optionally accepts full-grid arrays (`readonly number[]` or `Float64Array`). Length and every value must be valid and finite. Only inactive-node values initialize the basis arrays; active nodes retain their original zero initialization. Omission retains the original zero-boundary solve exactly. This support is for approved prescribed-boundary numerical tests; the nonzero-boundary rectangle must not be passed to the zero-boundary `equilibrium` constraint algebra.

`runShot(c, g, dt, closure, observer)` optionally invokes a callback after every successful actual integration step. It passes an immutable flat scalar record: `step`, `t`, actual `dt`, `volume`, `initialN`, `initialWe`, `initialWi`, `preN`, `preWe`, `preWi`, `postN`, `postWe`, and `postWi`. The step index starts at zero; `t` is the left endpoint. Particle inventory is a particle count, energies are J, time is s, and volume is m³. An invalid thermal step throws before a callback; callback exceptions propagate. No observer fields are added to `Shot`, and the observer-disabled and observer-enabled returned shots match exactly. Observations expose state only, not trusted flux budgets; independent test oracles recompute each source and sink.
