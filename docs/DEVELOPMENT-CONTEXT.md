# Development context

The instructions I set going into Milestone 2, kept here because later decisions refer back to them:

Preserve the completed Milestone 1. Build real, separate, persistent development roles first, then do M02 through that workflow. Physics specifies, Software implements approved specs, Validation tests independently without touching production code, and only the Director accepts. Artifacts, APIs, registries, the audit trail, and the machine-checkable gates all persist in the repo. Agent orchestration stays out of the website. No M03 work until M02 is accepted.

The M02 scope was: finite-difference Grad-Shafranov grid convergence, a Solov'ev analytic benchmark, automated particle, electron, and ion conservation and regression checks, and a dedicated evidence dashboard. Keep the educational limitations explicit and trace any change to a physics assumption.

I also asked for readable pathways through the repo (`START-HERE.md`, `Project Guide.html`) and for advice on when a stronger reasoning setting is worth it, which is in `MILESTONE-02-RESULTS.md`. Independent role execution means real separate agent sessions, not one model playing several roles in one prompt.

For the current state, read `docs/CONTEXT-HANDOFF.md`.
