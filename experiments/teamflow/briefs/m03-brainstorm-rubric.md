# M03 brainstorm evaluation rubric (Jev batch)

Evaluates the consolidated M03 candidate set across project-specific dimensions.
One batched Jev call per candidate set (never per-candidate calls).

## Dimensions (relate directly to the project)

| # | Dimension | Question it answers | Grounded in |
|---|-----------|--------------------|-------------|
| 1 | PhysicsValidity | Is the physics sound *inside the educational reduced model* — credible verification path (analytic fixture or matched reference), defensible closures, stays inside domain of validity? | `science/NEW-PHYSICS-REQUIREMENTS.md`, `specs/proposals/pyengine-validity.md` |
| 2 | BaselineAdvance | Does it materially improve beyond M01 (0-D) + M02 (numerical verification) — a genuinely new observable/capability, not repackaged numerics? | `specs/proposals/m02.md`, `specs/pyengine.json` |
| 3 | EduHelpfulness | Does a learner see or understand something new — profiles, time evolution, stability limits, real-data comparison — with clear plots/outcomes/failures? | mission: educational DIII-D shot simulator |
| 4 | GateRealism | Can it clear Director approval without an unbudgeted fight — 5-part package cost, reference comparison exists/accessible, uncertainty model achievable, no silent assumptions or constant changes? | `AGENTS.md`, `science/capability-policy.json` |
| 5 | EffortRisk | Implementation cost + solver stability + compute footprint on the user's macbook; risk of rabbit-holes and flaky gates. | actual constraints; M02 stability-guard discipline |

## Question design (one call per candidate set)

For EACH dimension, one `choice` question over the full candidate list:
"Across the candidates below, pick the one that bestsatisfies <dimension> (criteria above)."
→ gives per-dimension winners, so a candidate winning >1 dimension rises.

PLUS one `score` question per candidate (0=low,1=backlog,2=strong,3=top) as the numeric
baseline, with the leveled criteria restating PhysicsValidity+BaselineAdvance
(scientific advance), EduHelpfulness, GateRealism (governance). Confidence is
reported per question.

## Decision rule (Director, not Jev)

- Top 3 = candidates with the best combined story: >=2 dimension wins OR (score>=2
  with high confidence AND at least one dimension win), broken by Director judgment
  on sequencing and governance risk.
- Jev provides evidence; Director makes the call; record the batch under
  `experiments/teamflow/` or the M03 change record.

## Intake

- Cline (DeepSeek V4.1) + Copilot (Claude Sonnet 4.6) report via the two briefs
  (`m03-brainstorm-cline.md`, `m03-brainstorm-copilot.md`).
- Consolidate Director 7 + Cline 3 + Copilot 3 into one deduplicated state
  (compact 2-3 line descriptions), fire ONE batch, return top 3.