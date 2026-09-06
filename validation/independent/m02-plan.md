# M02 independent validation preparation

Author: Independent Validation Agent `/root/validation`. Implementation agent: `/root/software`.

Status: preparation only. Infrastructure accepted by Director; M02 specification and implementation remain pending. No M02 acceptance or validation result is asserted. Tests and tolerances must be aligned with the Director-approved specification before execution. Final evidence and report require a source freeze.

## Baseline understanding

The current engine advances particle inventory N and thermal energies We, Wi using explicit Euler at the start of each interval. It adjusts the requested time step to `5 / round(5 / dt)`. Its recorded output samples are generally less frequent than integration steps. The present energyError and particleError use running ledgers accumulated from the same terms as the update and therefore cannot establish independent balance verification.

Independent checks will consume optional observer snapshots containing the actual integration time, actual interval, immutable before/after N, We, Wi and geometry volume. Snapshots must be plain numerical data, captured on every interval. Reported individual powers or accumulated ledgers may aid diagnosis but will not supply the reference calculation. Observer invocation must not change default outputs, state, update order, or error behavior. The observer must expose the pre-step state rather than reconstructing it from rounded presentation samples. The validator should check snapshot count, temporal continuity, adjacent-state equality, and start/end coverage before calculating any residual.

## Independently reconstruct all three balances

Reference equations will be transcribed from the approved science specification into a validation-only implementation, without importing production rate functions, closures, waveform helpers, physical constants, or balance diagnostics. Constants and conventions will be written explicitly with approved registry IDs and their hashes. Imports of public run APIs are allowed solely to obtain experiment outputs and observer snapshots.

For the present baseline model, reconstruct density `ne=N/V`, electron temperature `Te=We/(1.5*N*KEV)`, programmed current and heating state directly from time and requested controls. Reconstruct confinement time, particle confinement, resistivity, ohmic power, absorbed electron and ion heating, bremsstrahlung, gas and beam particle sources, ionization cost and interspecies exchange from these inputs and reference equations. If M02 changes these equations, use the approved replacements rather than retaining this baseline mechanically.

At each interval, compute three expected increments independently:

- Particle: `dt * (gas source + beam source - N/tauP)`.
- Electron: `dt * (electron auxiliary heating + ohmic heating - We/tauE - radiation - ionization - exchange)`.
- Ion: `dt * (ion auxiliary heating - Wi/tauE + exchange)`.

Compare each with its observed state increment. Also verify the combined thermal increment using an equation with no exchange term, so a cancellation or sign defect cannot hide a channel imbalance. Normalize local residuals by a documented combination of state scale and absolute integrated terms, and report both absolute errors with units and dimensionless errors. Avoid normalization by a near-zero signed net increment. Tolerances will reflect floating-point cancellation and the approved specification, with maximum-error interval and associated parameter case recorded.

Accumulate independently reconstructed physical terms for a whole-run comparison against endpoint inventory/energies. This integration ledger will be distinct from the implementation ledger, but remains a consistency check for the specified discrete equations. It does not establish experimental fidelity or whole-machine energy conservation. Explicitly distinguish exact discrete balances from the finite-step error relative to continuous equations.

## Independent reference solutions and sensitivity checks

Use the analytic constant-source particle solution with zero beam heating, using the configured gas source, fixed volume and tauP, to check both endpoint behavior and expected first-order error reduction under time-step halving. Where the approved interface supports a deliberately simple validation closure, consider uncoupled constant-coefficient reference cases; do not request additional production physics solely to fit a test.

Exercise zero auxiliary heating, zero gas, zero gas and heating together, high gas with low heating, the control-domain endpoints, and intermediate values withheld from software tests. Unsupported thermal states should be explicit failures, never silently clipped. A failed unsupported run is assessed against specified behavior rather than declared a numerical failure automatically. Cases will be selected after reading the implementation tests to retain meaningful independence.

Probe heating on/off at one and four seconds and the current ramps, especially a requested dt that does not divide those event times. Verify actual dt, observer timestamps and output endpoint semantics. Discontinuous forcing can prevent monotone convergence; report event alignment and evaluate aligned and unaligned series separately.

For supported cases, compare runs at dt, dt/2 and dt/4 using endpoint states and common physical timestamps. Use interpolation only if specified and label its effect. Report absolute and relative differences and observed convergence order where the differences exceed floating-point noise. Time refinement tests numerical sensitivity, not plasma stability. No MHD, disruption, hardware, or experimentally validated stability claim is authorized by these checks.

## Regression and observer integrity

Preserve the exact M01 default shot output and baseline equilibrium checkpoints unless the Director-approved M02 specification explicitly authorizes a versioned change. Confirm instrumented and uninstrumented runs match exactly. Mutating an observer snapshot must not modify subsequent simulation state. Observer failure behavior must be documented and tested. Repeated runs must be deterministic, and observing one run must not retain state for another.

## Evidence and release gate

Write validation-only tests under validation/independent and per-check evidence under validation/evidence. Each check will include approved specification identity, source fingerprint, parameter settings, actual dt, metrics, thresholds, and failure details. Run only after the Director freezes the approved implementation, then create the independent report with distinct agent identities and SHA256 hashes of every required evidence artifact. Do not edit production code or approve a milestone.

Medium reasoning is sufficient for this bounded infrastructure-and-discrete-balance validation. Higher reasoning would be warranted if the approved work introduces a coupled nonlinear solver, a new closure requiring derivation, or claims about physical stability or quantitative experimental agreement. Those would require an expanded scientific specification and independent reference evidence as well as more reasoning effort.
