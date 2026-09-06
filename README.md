# DIII-D Virtual Shot

A working educational tokamak simulator, with a five-second formed-plasma shot, seven controls, computed equilibrium, temperature/density traces, playback, and JSON export.

This folder is the project source. Start with `START-HERE.md`. The physics equations and limitations are in `docs/PHYSICS.md`, the extension plan in `docs/ARCHITECTURE.md`, and the preserved request in `docs/PROJECT-CONTEXT.md`.

## Develop

Node 22.13+ and pnpm are required. With this directory open:

```
pnpm install
pnpm dev
```

Open the Local URL printed by the server. Run numerical verification with:

```
node --experimental-strip-types --test tests/physics.test.mjs
pnpm exec tsc --noEmit
pnpm build
```

On John's Mac, `Launch Simulator.command` uses the installed bundled runtime. Keep its Terminal window open while using the local simulator. Stop with Control-C. The `.codex/config.toml` requests Astra at medium effort for future project sessions; it does not change a currently running task.

## Reproducibility

`examples/baseline-shot.json` records control values, time step, model version, assumptions, all sampled observables, and equilibrium checkpoints. All run calculations occur locally in the browser; no AI key, experimental data, or facility access is needed. Exported results are synthetic.

This is an independent educational project, not an official DIII-D product or experimentally validated predictor.
