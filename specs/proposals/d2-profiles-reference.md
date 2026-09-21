# D2 profiles: reference-implementation comparison pathway (Part B, item 5)

Status: PROPOSED. **No comparison has been run.** Author: Physics lane (claude-sonnet), 2026-09-21. Baseline physics model 0.1.0; no constants changed. This document is kept separate from experimental validation (`d2-profiles-validation-plan.md`): agreement with a reference code says the equations were solved consistently, not that they describe DIII-D.

## 1. Provenance (honest)

- Candidate: **TORAX**, `google-deepmind/torax` (public GitHub repository). The research stage (`d2-profiles-research.md`) fetched the **README** on 2026-09-21; it described coupled ion and electron heat transport, electron particle transport and current diffusion, finite-volume discretisation and neural-network surrogate transport. This stage re-fetched nothing. **The TORAX source code, configuration schema and documentation pages were not read** by either stage.
- Everything below about TORAX's conventions (normalised toroidal-flux coordinate, cell/face grid, theta-method time stepping, Dirichlet outer boundary with zero-gradient axis, constant-transport model option, Gaussian source models, circular-geometry option) is **known-of from general literature familiarity and is unverified**. Each such item is marked *[unverified]* and must be confirmed against a pinned release before any comparison. The research note's statement that TORAX applies zero-Dirichlet `n = T = 0` at the edge is *not* relied on.
- **Version/revision: unpinned.** Pin at execution time to a tagged release or commit hash and record install method and date; until then the structured record below is incomplete.
- Other codes (TRANSP, ASTRA, JETTO, RAPTOR) are known-of, unread, not pursued: TRANSP, ASTRA and JETTO are institutional/collaboration codes whose accessibility is unknown here (lack of access alone is not evidence that no reference exists); RAPTOR is a reduced 1-D code known-of only. They remain candidates if TORAX proves unsuitable. Search record: research note, 2026-09-21, literature familiarity plus TORAX README fetch (result: TORAX chosen as most accessible).

## 2. Mapping

| Item | D2 (Part A) | TORAX *[unverified]* | Note |
|---|---|---|---|
| Radial label | `rho_V = sqrt(V(rho)/V)`, `V' = 2 V rho` | normalised toroidal-flux label `rho_tor_norm` | coincide only for concentric circles with constant `B` (large aspect ratio); otherwise a coordinate shift (§4) |
| Metric | `⟨(grad rho)²⟩ = 1/L²`, `L² = V/(2 pi² R0)` | geometry-supplied `V'`, `g0`, `g1`-type metric coefficients | compare numerically (step B0) |
| Unknowns | `n`, `w_e = (3/2) n T_e KEV`, `w_i` | `T_i`, `T_e`, `n_e` (and `psi`) | D2 evolves energy densities; conduction operator in `T` is the same form `n chi grad T` |
| Time scheme | backward Euler + explicit sources | theta method (implicit default) with Newton or linear solver | set theta = 1 for B1–B3 |
| Grid | 64 volume-uniform-in-`rho` cells | uniform cells/faces in `rho_tor_norm` | different mesh spacing accepted; compare on a common analysis grid |
| Units | SI, `KEV = 1.602176634e-16 J/keV`, `n` m^-3 | keV, `1e20 m^-3`-type normalisation *[unverified]* | convert to SI at the comparison layer |
| Transport | scalar `D`, `chi_e`, `chi_i`, uniform | constant-transport model option *[unverified]* | same values in both |
| Sources | Gaussian shapes with `∫ h V' drho = 1`, totals from 0-D | Gaussian generic sources with location, width, total *[unverified]* | benchmark supplies identical totals |
| Axis | zero flux, exact | zero gradient | equivalent |
| Edge, verification | Dirichlet value, second-order closure | Dirichlet value | **comparable** |
| Edge, production | prescribed flux = 0-D loss, no edge value | no equivalent | **no counterpart** (§5) |
| Ion density | `n_i = n_e = n`, `Z_eff = 1` | dilution and `Z_eff` handled explicitly | set `Z_eff = 1`, pure deuterium *[unverified]* |

## 3. Matched benchmark definition

Common rules: benchmarks use the verification-only Dirichlet edge and prescribed Gaussian sources with identical totals; TORAX runs with theta = 1, uniform constant transport, electron-ion exchange disabled in both codes, fixed steps at least four times finer than the D2 step, and no current diffusion or neural surrogate (frozen or trivial `psi` evolution *[unverified]*). Coefficients are the illustrative defaults (`D = 0.1`, `chi = 3.0 m²/s`); shape values are the illustrative `rho_E = 0.3`, `sigma_E = 0.1`. Circular geometry, `kappa = 1`, and two geometry tiers: **T-large** `R0 = 10 m`, `a = 0.84 m` (aspect ratio 12; `rho_tor²` and `rho_V²` differ by at most about 0.2%, hand estimate); **T-DIII-D** `R0 = 1.66 m`, `a = L = 0.840 m` (the equivalent-circle radius of the default equilibrium; `epsilon = 0.51`).

| ID | Case | Observable | Metric | Tolerance |
|---|---|---|---|---|
| B0 | Geometry equivalence: extract each code's `V'(rho)` and metric on the analysis grid | `V'`, metric ratio | max relative difference | T-large `5e-3`; T-DIII-D reported, expected about 5% (§4) |
| B1 | Steady conduction, uniform `n`, uniform electron source, Dirichlet edge `T = 0.1 keV`, `T_i` not evolved | `T_e(rho)` | `L2rel` on 64-point analysis grid (D2 cell averages against TORAX values interpolated, quadratic) | T-large `3e-3`; anchored to the closed form `T_b + S L²(1−rho²)/(4(3/2)KEV n chi)` |
| B2 | Relaxation of parabolic `T` (`0.5→0.1 keV`), uniform `n`, no sources, `t = 0.05, 0.1, 0.3 s` | `T_e(rho, t)`, total `We(t)` | `L2rel`; energy-content relative difference | `1e-2`; `3e-3` |
| B3 | Gaussian ECH-like source (`rho_E = 0.3`, `sigma_E = 0.1`), frozen `n`, `chi_e` only, run to `1 s` | `T_e(rho)` at `1 s` | `L2rel` | `2e-2` |

Tolerance provenance: these are **illustrative starting values** set from the expected numerical accuracy of second-order schemes on comparable grids, not fitted. Before running, execute a TORAX self-convergence study (double resolution); the working tolerance is `max(listed value, 3 × TORAX self-convergence difference)`, recorded before comparing. Tolerances may not be adjusted after seeing the comparison. The analytic solution is an extra anchor (three-way comparison): if D2 and TORAX disagree, whichever differs from the closed form is the suspect.

## 4. Expected differences

- **Coordinate.** For concentric circles with `B ∝ 1/R`, `rho_tor² = (R0 − sqrt(R0² − r²))/(R0 − sqrt(R0² − a²))` versus `rho_V² = r²/a²`. Hand check at `r = a/2` for T-DIII-D: `0.237` versus `0.250`, a `5%` shift in `rho²`; this is expected structural difference, not an error, and the T-DIII-D tier reports it rather than passing or failing on it.
- **Metric.** D2's constant `1/L²` versus geometry-supplied metrics. Reported by B0.
- **Mesh and time scheme.** Different meshes, mesh spacings and solver choices. Bounded by the self-convergence study.
- **Source normalisation.** D2's discrete `Σ h_i ΔV_i = 1`; TORAX's own normalisation of Gaussian totals *[unverified]*. Compare integrated source power first.

## 5. What cannot be compared, and why

- **Production edge-flux closure:** a prescribed flux equal to the 0-D loss has **no reference-code counterpart**; TORAX-type codes impose boundary values. Only the Dirichlet verification option maps. The production edge is tested by D2's own parity/ledger (`d2-profiles-verification.md`) and, experimentally, by validation F-6.
- **Passenger construction and 0-D parity:** a self-consistent code has no 0-D authority; parity is D2-internal.
- **Physical source models** (NBI, ECH, gas, Ohmic with `jt`, bremsstrahlung): D2's are illustrative shapes with renormalised totals; TORAX source models differ. Benchmarks use identical prescribed Gaussians instead.
- **Transport physics:** TORAX's turbulent surrogate, current diffusion and self-consistent geometry evolution have no D2 counterpart; any use puts the benchmark outside this pathway.
- **Equilibrium coupling and the `psi`-independent grid:** D2 does not use `psi`.

## 6. Execution and access requirements

Python environment able to install the pinned TORAX; run outside the repository (no LLM or orchestration in the web app, no new runtime dependency in the project); result files and configuration saved under an evidence path assigned by the Director; Validation (claude-opus) reviews. Depends on the D2 kernel's verification-only entry (`d2-profiles-verification.md` §1). Status: **not started, blocked on the Software implementation and the version pin.**

## 7. Structured record (the machine-checked JSON sibling)

`NEW-PHYSICS-REQUIREMENTS.md` requires reference artifacts in JSON. The sixth bound artifact (DD-9) is **`specs/proposals/d2-profiles-reference.json`**, in the format of `pyengine-reference.json` (`availability`, `implementations` with `name`, `versionOrRevision`, `source`, `comparisonPlan`, `limitations`), extended with the read-status of the source, the equation-mapping entries of §2, benchmark definitions B0-B3 with metrics and tolerances marked illustrative (§3), the expected differences of §4 and the non-comparable items of §5 with reasons. The JSON is authoritative for the machine check; this document is the human-readable companion. Provenance is unchanged: version **unpinned**, README only read, source not read, conventions unverified. No comparison has been run.
