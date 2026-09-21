# M03 brainstorm — consolidated Jev batches, decision record

Batch 1: 2026-09-18, jev-1.13.0, Director set of 7 (provisional — superseded below).
Batch 2: 2026-09-18, jev-1.13.0, consolidated set = Director 7 + Copilot 3 (handoff
`experiments/teamflow/briefs/m03-brainstorm-copilot-headless.md`, dispatched via
`copilot -p` headless, session `79119ad3-3393-4472-ba25-ba9cf04756f8`). Cline was excluded
by Director decision before this batch (free-tier origin lock, `403` headless).

## Batch 2 per-dimension winners (choice)

| Dimension | Winner | p (conf) |
|---|---|---|
| PhysicsValidity | D6 fusion yield / Lawson | 0.38 (0.30; C1 0.22, C2 0.17 close) |
| BaselineAdvance | D2 1-D profiles | 0.89 (0.86 — decisive) |
| EduHelpfulness | D2 1-D profiles | 0.67 (0.64; D6 0.16) |
| GateRealism | C1 sweep harness | 0.42 (0.35; D6 0.19, C2 0.14) |
| EffortRisk | C3 scenario library | 0.71 (0.68; C1 0.16, D6 0.12) |

## Batch 2 per-candidate scores (0–3)

| Candidate | Score | Conf | Band |
|---|---|---|---|
| C1 sweep/regression harness | 2.09 | 0.56 | strong (highest) |
| C2 uncertainty atlas | 1.83 | 0.55 | backlog/strong |
| D7 evolving equilibrium | 1.48 | 0.37 | backlog |
| D5 web-app | 1.44 | 0.40 | backlog |
| C3 scenario library | 1.39 | 0.23 | backlog (~low conf) |
| D6 fusion yield | 1.36 | 0.41 | backlog |
| D2 1-D profiles | 1.23 | 0.57 | backlog |
| D1 exp validation | 1.10 | 0.68 | backlog |
| D4 MHD limits | 1.06 | 0.63 | backlog |
| D3 free-boundary | 0.56 | 0.53 | low |

## Decision rule applied (rubric)

>=2 dimension wins OR (score>=2 AND >=1 dimension win), Director breaks ties on sequencing
and governance risk.

- **D2 1-D profiles** — 2 wins (BaselineAdvance, EduHelpfulness). Qualifies outright.
- **C1 sweep/regression harness** — score 2.09 (>=2) AND GateRealism win. Qualifies outright.
- Third tie: C2 (1.83, no wins) vs D6 (PhysicsValidity win in BOTH batches, score 1.36) vs
  C3 (EffortRisk win, low score/conf). Director picks **D6** by sequencing: it has the only
  repeat dimension win, the cleanest verification (analytic <σv> + Lawson line), and its new
  observable (fusion yield from n,T) directly consumes D2's profile output. C2 is C1's
  sibling (same machinery, formalized) so it rides as phase-2 of C1, not a separate M03 item.

## Director top 3 (M03)

1. **D2 — 1-D radial transport + profile evolution** (headline physics advance). Genuinely
   new observable (ne/Te vs ρ, core vs edge), decisive BaselineAdvance 0.89 + EduHelpfulness
   0.67. Requires 5-part capability package (verification fixture, experimental validation
   plan, uncertainty model, domain of validity, reference comparison). Sequencing: depends
   on C1 harness for sweep coverage + parity budget.
2. **C1 — Python-engine benchmark + sweep harness** (foundation). Operationalizes the
   accepted pyengine as the authoritative regression + sweep tool for frozen 0.1.0 physics;
   GateRealism win (0.42). De-risks everything downstream (D2 verification, C2 atlas,
   C3 scenarios).
3. **D6 — fusion yield / Lawson module** (education centerpiece, conditional). Highest
   iteration count across both batches on PhysicsValidity; reads directly off D2's profile
   output. GO condition: a Director-approved change-request to lift the fusion-yield
   exclusion with explicit n_D/n_T and tritium-ratio constants (no silent assumptions), plus
   the 5-part package with the analytic Lawson reference. Without that clearance it stays at
   #4 (C2 atlas).

## Web-app (D5) note — marked-improvement gate resolved

D5 scored 1.44/no dimension wins in the consolidated batch and is NOT in the top 3, so the
earlier "marked improvement" gate question is moot for ranking. The user's gimmick concern
is absorbed as a standing guard: IF D5 is ever revisited, ship only if (a) interactive
control → live shot with flux surfaces + time traces, AND (b) >=1 physics view impossible
today (fusion/Q readout or animated psi evolution), and never an LLM inside.

## Handoff provenance

- Copilot (Claude, model auto): headless `copilot -p`, read repo files (pyengine-validity.md,
  m02.md, capability-policy.json, AGENTS.md, brief). 0.45 credits, 17s.
  `experiments/teamflow/briefs/m03-brainstorm-copilot-headless.md`,
  resume `copilot --resume=79119ad3-3393-4472-ba25-ba9cf04756f8`.

Evidence requires Director judgment; Jev provides the measurements.