# Architecture and extension path

## Separation of responsibilities

- `physics/engine.ts`: deterministic computation; no React, browser, network, or AI dependencies. Exports typed Controls, Geometry, Basis, Sample, Shot, and TransportClosure.
- `geometry` and `basis`: shape boundary, finite-difference mesh, and two reusable elliptic basis solves. Geometry is constant for a shot.
- `waveform`: current and heating schedules. Replace this function with a versioned waveform provider for a shot editor.
- `runShot`: conservative time integration. It accepts a TransportClosure for replacement of the initial heuristic transport model.
- `equilibrium`: constrains the linear-pressure/linear-F² Grad–Shafranov family to instantaneous current, pressure, and toroidal field. Independent of the time integrator; evaluated on demand at the selected time.
- `app/page.tsx`: controls, chart rendering, computed flux contours, timeline, JSON export. No physics equations in UI except diagnostic presentation and contour extraction.
- `tests`: headless numerical verification using the same engine as the UI.
- `examples`: synthetic baseline data and numerical verification report.

Flow: Controls → geometry + waveform → particle/energy integration → Shot → selected-time equilibrium → views/export. Pressure feeds equilibrium; a heuristic confinement closure feeds transport. Equilibrium does not yet feed geometry-dependent transport coefficients back to the thermal solver. Do not describe this as fully self-consistent integrated modeling.

## Solver integration contract

Future solvers should accept SI quantities, an explicit machine geometry/version, initial state, time-dependent actuator inputs, and a model/parameter manifest. Return profiles, diagnostics, convergence status, residuals, units, and provenance. Unsupported or failed solves must produce status rather than silent fallback.

Add an `EquilibriumSolver` interface before bringing in FreeGS or another external solver. Its input should be boundary or coil currents, total plasma current, pressure/current profile specification, toroidal field reference, and mesh/tolerance. Output should include psi, R/Z grids, p/F profiles, magnetic axis and boundary, residual, integrated current, and convergence flags. Compare conventions explicitly: flux vs flux/2pi, sign, coordinate orientation, and COCOS convention.

For a Python/research-code backend, keep the UI and typed versioned JSON boundary. Run expensive calculations in a worker/job service with cancellation and result storage. Do not embed external solvers in the browser shell. Preserve a deterministic baseline adapter for regression testing.

## Milestones with acceptance gates

1. **Numerical benchmarks:** manufactured/analytic Solov’ev equilibria, asymptotic mesh refinement, stricter time convergence, independent pressure/current integrals. Current tests are initial verification, not comprehensive validation.
2. **Experimental equilibrium:** import a licensed/access-authorized GEQDSK benchmark, document conventions, compare axis/boundary, flux, current, pressure, and q against reference with declared tolerances.
3. **Radial transport:** evolve n(rho), Te(rho), Ti(rho), heat/particle fluxes; introduce profile-dependent deposition, resistivity, exchange, and radiation. Require integral conservation and analytic diffusion benchmarks.
4. **Circuit and free boundary:** coil geometry, voltage/current circuits, plasma position, shaping controller, current diffusion. Include actuator energy and magnetic energy before claiming whole-system conservation.
5. **Shot validation:** split data into calibration and held-out shots; compare measured diagnostics with forward models, uncertainty, residuals, and documented error budgets.

Candidate solvers must be assessed for license, installation, supported geometry, numerical formulation, and validation evidence before selection. None is installed or claimed integrated in this milestone.

## Persistence and context

Versioned JSON exports keep run controls, model version, time step, assumptions, diagnostics, and selected equilibrium. Run results are not automatically persisted in the browser. Project context lives in this folder, independent of any chat cache. A private hosted console is convenient; this Desktop source is the editable project.
