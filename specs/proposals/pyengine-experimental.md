# Experimental validation plan — Python engine reimplementation

Status: **PENDING DATA**. This educational model is not experimentally validated and must remain labeled as such. This plan documents criterion that would count as experimental evidence and states that none exists yet. Plans are not completed validation.

## Separation of concerns

- **Verification** (did we solve the equations correctly) is covered by the cross-engine tests and the inherited verification dashboards.
- **Experimental validation** (do the equations reproduce measurements) is out of scope for the reduced educational model until a real dataset is authorized by the Director.
- **Calibration**: no model constant is calibrated or will be calibrated on any experimental dataset by this capability. `tauE`, absorption fractions and exchange/radiation constants remain the illustrative values of model 0.1.0 (assumptions A-M01-005 through A-M01-009).

## Synthetic hold-out that executes now

The only evidence available in-repository is synthetic. The Python engine must reproduce the frozen M01 baseline records and approved curated examples, which serve as held-out fixtures:

- `experiments/baseline/m01-shot.json` (provenance-bound to commit `b07537877cec168d20783a3cfc45366fccbd4538`);
- `examples/` curated synthetic baseline.

**Falsification criterion**: if the Python engine's aggregate metrics (peak Te, ne, thermal energy, beta, final tauE, volume) deviate from these frozen synthetic records beyond the cross-engine discrepancy budget in `specs/proposals/pyengine.md`, the implementation is falsified and may not be accepted regardless of any other passing test.

## Candidate experimental comparison (future, requires Director-approved data access)

If a real dataset is authorized, the planned route is:

1. **Observables**: time-resolved (or flattop-averaged) central/peak electron temperature, line/peak density, stored thermal energy, plasma beta, confinement time estimate, and programmed `Ip`/`Bt` waveforms matched from the discharge summary.
2. **Diagnostics and uncertainty**: Thomson scattering, interferometry, magnetic reconstruction and MSE where available; uncertainty taken from the published or facility-reported `±` percent and propagated as independent measurement error. Diagnostic uncertainty is not a free tolerance for the model; it sets the smallest residual that could be attributed to the model.
3. **Parameter matching**: map the recorded `Ip`, `Bt`, auxiliary heating powers and fueling to `Controls`; acknowledge that the reduced 0-D model cannot match profile shapes or boundary geometry of any specific discharge, so only volume/shape-integrated observables are comparable.
4. **Comparison metrics**: relative residuals on the listed observables and a `tauE` ratio; acceptance requires every residual to sit within the sum of the measurement uncertainty band and a documented model discrepancy (currently the residual against this plan's chosen dataset, which does not exist, so the capability remains unvalidated).
5. **Data-access dependency**: none granted today; any future dataset, its provenance, and a held-out protocol require explicit Director approval before use.

## What would falsify the model

A claimed success requires both (a) staying within the synthetic hold-out budget above and (b) if raw data later becomes available, residuals against measured observables that cannot be explained by documented uncertainty and model-form limitations. Demonstration of (a) proves numerical equivalence only. Absence of (b) is not corrected by rewording; the capability stays labeled experimentally unvalidated until real evidence exists.