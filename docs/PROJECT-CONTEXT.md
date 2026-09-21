# Preserved project context

Original conversation: **Build DIII D Simulator**
Date: September 6, 2026.

User brief: Begin building a DIII-D tokamak simulator. Start with architecture and a first working milestone: a physically consistent virtual DIII-D shot with controls for plasma current, toroidal field, NBI, ECH, gas injection, and shape, plus equilibrium and basic temperature/density evolution. Organize it so higher-fidelity physics solvers and validation can be added later. Use Astra at medium thinking effort. Preserve the chat/project context.

Follow-up: Save the simulator files in a folder on the user's Desktop.

Interpretation implemented: a browser-based educational reduced model with explicitly tracked particle and thermal-energy inventories and fixed-boundary force-balance equilibrium, not a research-grade digital twin. No private shot data or facility controls have been accessed. No empirical shot validation is claimed.

Source location: the maintainer's local Desktop folder `DIII-D-Simulator` (personal absolute path redacted).
The project-level Codex configuration requests `gpt-6-astra`, `medium` for future sessions. The running task's setting could not be changed by the available tools.

Current scope includes formed-plasma current ramp, flat-top heating, and ramp-down to a nonzero current. It does not include breakdown, extinction, coil circuits, divertor geometry, current diffusion, or plasma stability.

Next intended phase: numerical benchmark suite and an equilibrium/transport solver adapter, selected with an explicit validation target and available experimental data. Avoid calling this calibrated until that validation exists.
