# DIII-D Virtual Shot development contract
Read agents/director.md, agents/physics.md, agents/software.md, agents/validation.md and science registries before changes. These are persistent development roles, not UI features. Use real separate Claude Code lanes per experiments/teamflow/decisions/WORKFLOW-EXECUTOR-CLAUDE-003.json: physics=claude-sonnet, software=claude-sonnet, validation=claude-opus (must differ from Software's model); Director (claude-opus) coordinates and accepts, and may delegate bounded work to sonnet/haiku subagents.
Infrastructure and M02 are accepted; M03 proceeds unit by unit through TeamFlow with recorded Director assignments. Preserve Milestone 01 baseline at commit b07537877cec168d20783a3cfc45366fccbd4538 and experiments/baseline/m01-shot.json.
Physics owns specs/proposals; Software owns approved implementation; Validation owns independent evidence; Director owns approval/decision files. No silent assumption or constant changes. Use specs/change-requests with reason, old/new values, model version and Director approval.
Native collaboration agents share a filesystem: path restrictions are instructions and acceptance checks, not an OS security sandbox. For execution separation use TeamFlow `assign` (headless Claude Code lanes via `node tools/teamflow/teamflow.mjs assign ...`) plus role scopes in agents/permissions.json enforced at `complete`/`gate`; tools/dispatch-agent.mjs is dormant (Codex retired) — its `allowed()` permission helper is still used. Only Director imports reviewed changes and runs approve/accept; local scripts do not authenticate a hostile same-user process.
No LLM calls or agent orchestration inside the web app. The app displays numerical simulation and evidence only.
No OpenAI models are available; older records mentioning GPT-6 Astra/Codex are historical provenance — do not edit them.

## Jev auditor

Every stage is audited by Jev in ONE batched call over ONE state (`node tools/teamflow/teamflow.mjs eval <unit> all`); agents self-verify with the `jev` CLI / MCP `jev_evaluate`/`jev_review_diff` before handoff. Jev is independent of the Claude family and is the main independence check. Never print the key.

## Mandatory requirements for new physics

Every new physics capability requires a verification test, experimental validation plan, uncertainty model, documented domain of validity, and comparison pathway against at least one established reference implementation where available. Follow science/NEW-PHYSICS-REQUIREMENTS.md and science/capability-policy.json. Explicitly classify future specs with physicsCapabilityChange; approved artifact hashes and independent scientific review are mandatory. Plans do not justify claims of completed validation. No reference identified requires a documented search/rationale, not omission.
