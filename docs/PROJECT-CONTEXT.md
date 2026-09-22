# Project context

This started in early September 2026 as a first attempt at a DIII-D style tokamak simulator, built with AI coding agents. The brief I set was: get the architecture in place and a first working milestone, a physically consistent virtual shot with controls for plasma current, toroidal field, NBI, ECH, gas injection, and shape, with an equilibrium and basic temperature and density evolution, organized so higher-fidelity solvers and validation could be added later.

What got built is a browser-based educational reduced model. It tracks particle and thermal energy inventories explicitly and solves a fixed-boundary force-balance equilibrium. It is not a research-grade digital twin. No private shot data or facility controls were used, and no experimental validation is claimed.

The scope covers a formed-plasma current ramp, flat-top heating, and a ramp-down to nonzero current. It does not cover breakdown, extinction, coil circuits, divertor geometry, current diffusion, or stability.

The project lives at the repo root. The first phase used a different agent toolchain; the current lanes are described in `AGENTS.md`. The next phases were a numerical benchmark suite (done, Milestone 2) and a transport layer chosen against an explicit validation target (Milestone 3, in progress). Nothing here should be called calibrated until a comparison against real data exists.
