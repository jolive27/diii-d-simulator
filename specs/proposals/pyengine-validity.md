# Domain of validity — Python engine reimplementation

Identical to model 0.1.0 (DIII-D Virtual Shot educational reduced tokamak). Assumed ranges are the model's declared design space; verified ranges are those covered by cross-engine comparison evidence.

## Geometry (assumed)

- Major radius `R0=1.66 m`, minor radius `a=0.66 m`.
- Boundating polyline with 160 intervals: `R=R0+a cos(theta+asin(delta) sin(theta))`, `Z=kappa a sin(theta)`.
- Shape limits: `kappa 1.0–1.95`, `delta −0.30–0.60`.
- Odd square grid `17–129` (default 49) spanning `R0±1.04a`, `Z=±1.04 kappa a`; only strictly interior masked cells participate.
- Fixed boundary only; no free boundary, coils, X-point, or divertor representation.

## Parameters (verified operating range)

| Input | Range | Unit |
| --- | --- | --- |
| Plasma current `Ip` | 0.6–2.0 | MA |
| Toroidal field `Bt` | 1.0–2.1 | T |
| Neutral-beam heating `NBI` | 0–12 | MW |
| ECH heating | 0–3 | MW |
| Gas fueling | 0–8 | ×0.3×10²¹ s⁻¹ |
| Time step `dt` | (0, 0.01] | s |
| Formed-plasma shot | 5 s programmed (ramp 0–1, flattop 1–4, down 4–5) | s |

The verified range is the same control space as the TypeScript engine: this capability's sweep evidence (`PYENGINE-SWEEP-MATCH`) must cover every control's `LIMITS` step grid; the default case must match the M01 baseline.

## Regimes

Low-beta thermal plasma (default peak beta ~1%); singly ionized deuterium with equal electron/ion inventory; Maxwellian-like electron/ion populations implied by the 0-D thermal closures. No nonthermal, impurity, or multi-species treatment.

## Excluded phenomena (model form)

Breakdown and plasma extinction; free-boundary equilibrium and coil systems; X-point/divertor configures; MHD stability limits and disruptions; radial transport and profile evolution; turbulence and neoclassical effects; impurity radiation beyond bremsstrahlung; fusion yield and electrical machine conversion; relativistic two-temperature effects; any facility operations or safety decision role.

## Resolution

Time sampling at ~0.02 s (fixed schedule, final step always sampled); single fixed spatial grid per shot; no temporal or spatial adaptation; no profile resolution (0-D thermal + scalar equilibrium).

## Behavior outside the domain

Invalid controls, timestep, grid parity/range, or any transition to a non-finite/nonpositive thermal state throws rather than clipping. Extrapolation beyond the declared ranges is not intended; results outside the domain carry no meaning and are not evidence.

## Assumed versus verified

Geometry/mesh rules, waveforms, closures, absorption and exchange constants: **assumed** (educational model, no experimental calibration). Cross-engine numerical equivalence over the declared operating range and shared grids: **verified** by this capability's tests. Experimental agreement with real tokamak measurements: **none, pending data** (see `pyengine-experimental.md`).