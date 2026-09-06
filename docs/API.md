# Callable simulator API

`physics/api.ts` is a synchronous, deterministic wrapper around the unchanged M01 engine. It has no browser, filesystem, network, or process side effects. These functions add infrastructure only; they do not introduce M02 physics or establish scientific validation.

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
- `run_benchmark(name: 'baseline'): Shot` returns exactly `run_shot()`. Other names throw. This is a deterministic infrastructure baseline, not a benchmark acceptance decision or a new verification suite.
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
