# Development contract

Read `agents/director.md`, `agents/physics.md`, `agents/software.md`, `agents/validation.md`, and the science registries before changing anything. These are persistent development roles, not features of the app.

## Lanes

Work runs as separate Claude Code lanes, per `experiments/teamflow/decisions/WORKFLOW-EXECUTOR-CLAUDE-003.json`: Physics and Software on claude-sonnet, Validation on claude-opus (it must be a different model from Software), research and review on claude-haiku. The Director (claude-opus) coordinates and accepts, and can hand bounded work to sonnet or haiku subagents.

Infrastructure and M02 are accepted. M03 proceeds unit by unit through TeamFlow with recorded Director assignments. Keep the Milestone 1 baseline at commit `b07537877cec168d20783a3cfc45366fccbd4538` and `experiments/baseline/m01-shot.json` intact.

## Ownership

Physics owns `specs/proposals`. Software owns the approved implementation. Validation owns the independent evidence. The Director owns approvals and decision files. No assumption or constant changes without a change request in `specs/change-requests` that states the reason, the old and new values, the model version, and Director approval.

## What the scopes are and are not

The agents share a filesystem, so the path restrictions are instructions plus acceptance checks, not an OS sandbox. Execution separation comes from TeamFlow `assign` (headless lanes via `node tools/teamflow/teamflow.mjs assign ...`) and the role scopes in `agents/permissions.json`, which are enforced at `complete` and `gate`. Only the Director imports reviewed changes and runs approve and accept. None of this authenticates against a hostile process running as the same user.

`tools/dispatch-agent.mjs` is the dispatcher from the first phase of the project, before the current lanes existed. It is retired but kept, since the infrastructure validation imports its `allowed()` helper. Older records that mention the models used in that phase are provenance. Do not edit them.

No LLM calls and no agent orchestration inside the web app. The app shows numerical results and evidence, nothing else.

## Jev

Every stage is audited by Jev in one batched call over one state (`node tools/teamflow/teamflow.mjs eval <unit> all`). Agents self-verify with the `jev` CLI or the `jev_evaluate` and `jev_review_diff` MCP tools before handing off. Jev is from outside the model family doing the work, which is the main independence check. Never print the key.

## New physics

Every new capability needs a verification test, an experimental validation plan, an uncertainty model, a documented domain of validity, and a comparison against at least one established reference implementation where one exists. Follow `science/NEW-PHYSICS-REQUIREMENTS.md` and `science/capability-policy.json`. Specs must say whether they are a `physicsCapabilityChange`. Approved artifact hashes and independent scientific review are required. A plan is not a completed validation. If no reference exists, document the search and the reasoning, do not just leave it out.
