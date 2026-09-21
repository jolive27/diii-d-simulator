# Copilot (Claude) M03 brainstorm — headless handoff

- source: `copilot -p` headless, model auto, 2026-09-18
- session: `copilot --resume=79119ad3-3393-4472-ba25-ba9cf04756f8`
- credits: 0.45 AI credits (17s); read pyengine-validity.md, m02.md, capability-policy.json,
  AGENTS.md, m03-brainstorm-copilot.md

## Candidates

1. **Python-engine benchmark and sweep harness** (engineering)
   Rationale: the accepted NumPy engine (`python/d3gate/engine.py`) matches TS M01 within
   validated 1e-9/1e-6 budgets; M03 operationalizes it as the authoritative regression +
   sweep harness for frozen 0.1.0 physics.
   Payoff: fast, trustworthy mapping of the verified operating space; side-by-side scenario
   teaching without new physics claims.
   Hardest gate: preserving exact numerical parity with TS fixtures while expanding sweep
   coverage — faithful reference, not a silently changed model.

2. **Validated operating-space uncertainty atlas** (physics, physicsCapabilityChange)
   Rationale: formalize a bounded uncertainty/sensitivity atlas over the accepted domain
   instead of one deterministic shot.
   Payoff: students see which controls dominate current/heating/thermal balance within the
   valid 0.1.0 domain — rigorous sensitivity teaching without unvalidated physics.
   Hardest gate: meeting the capability-policy 5-part package while framing it as
   within-model sensitivity, not a new physics claim.

3. **Verified educational scenario library** (engineering)
   Rationale: package a curated, deterministically reproducible set of baseline/edge-case
   scenarios tied to the exact validated M01 assumptions.
   Payoff: canonical examples (baseline, low-gas, no-heating, strong-NBI) that teach the
   same physics consistently for web app and classrooms.
   Hardest gate: stable outputs across TS/Python paths, no new defaults or hidden
   assumption drift that invalidates M01/M02 evidence.