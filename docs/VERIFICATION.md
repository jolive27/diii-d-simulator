# Milestone 1 verification

Verified September 6, 2026 on the Desktop project using the same TypeScript physics engine as the browser UI.

Nine numerical tests passed:

1. A five-second baseline has positive temperatures/density and closes tracked thermal-energy and particle balances to below 1e-12 relative error.
2. Every baseline sample supports equilibrium; integrated current, volume-average pressure, and independently differenced GS equation meet the test tolerances (current/pressure 1e-12; GS 1e-7).
3. Halving time step from 2 ms to 1 ms changes flat-top temperatures/density by less than 1%.
4. No-NBI particle inventory agrees with its analytic source/loss solution within 0.1%.
5. Increased heating raises stored energy; increased gas raises density.
6. Zero auxiliary heating and zero gas run through five seconds for the seeded formed plasma.
7. Invalid controls/time steps and an unsupported equilibrium fail explicitly.
8. A 129-point elliptical mesh gives torus volume within 0.5% of the analytic value.
9. Refining 49→97 points changes baseline peak flux by less than 5% and volume by less than 2%.

Type checking and the production build passed. The development route returned HTTP 200 and was opened in Codex. Browser visual/interaction testing was not requested and has not been performed. The optional WebMCP run tool is feature-detected but unverified in a supported WebMCP browser context; this does not affect manual controls.

Baseline at 2.5 s: Te ≈0.8723 keV, Ti ≈0.8464 keV, mean ne ≈5.7854e19 m^-3, stored thermal energy ≈0.55224 MJ. These are synthetic model results, not measured DIII-D values.

Residual/conservation tests do not establish experimental accuracy, globally second-order boundary convergence, stability, or hardware feasibility. Analytic-equilibrium and experimental validation remain future work. See PHYSICS.md and ARCHITECTURE.md.

Sidebar net energy is ΔW=We(t)+Wi(t)-We(0)-Wi(0), in MJ. Net heating power is absorbed NBI+ECH+ohmic input minus modeled thermal transport, radiation, and gas ionization losses, in MW. Both follow the selected playback time. They are not electrical output or fusion gain.
