# Persistent development workflow

1. Director records task and approved scope in experiments/records.
2. Dispatch a real Physics agent to produce a specification proposal. Review governing equations, units, normalization, boundary conditions, expected behavior, quantitative acceptance criteria and limitations.
3. Director promotes approved specification into specs/MILESTONE.json and runs `node tools/workflow.mjs approve MILESTONE`.
4. Dispatch a distinct Software agent to implement only that specification. Save test outputs, changed paths and assumption/model declarations.
5. Freeze source. Dispatch a distinct Independent Validation agent; it reads and executes the final source and writes validation/MILESTONE-report.json, evidence and source fingerprint. It cannot repair production code.
6. Director runs `node tools/workflow.mjs gate MILESTONE`, then `accept`. Failure blocks acceptance. New edits invalidate current validation and require rerun.

This session uses TeamFlow (`tools/teamflow/`, CLI `node tools/teamflow/teamflow.mjs`) to run Claude Code lanes: Director on claude-opus, Physics and Software on claude-sonnet, Validation on claude-opus (a different model from Software), and research/reviewer on claude-haiku. `teamflow assign` dispatches each lane headlessly via `claude -p --model <opus|sonnet|haiku>`, with separate execution contexts. Claude Code subagents share a filesystem; the role scopes in agents/permissions.json and the content checks at `complete`/`gate` are instructions and acceptance checks, not OS access control. Do not claim otherwise. Every stage is audited by Jev (jev-latest) in one batched call over one state before Director sign-off.

`tools/dispatch-agent.mjs` is dormant: it dispatched a real Codex process with gpt-6-astra/medium and is retired now that OpenAI access is gone, kept only as historical provenance and for its `allowed()` permission helper. Execution separation for terminal-driven runs now goes through TeamFlow `assign` plus the agents/permissions.json role scopes described above.

Only the local trusted Director invokes approval commands. The scripts are provenance/quality enforcement, not authentication against a malicious process running as the same OS user. For adversarial hard isolation, use separate OS accounts/containers and a privileged integration service.

## Evidence and experiments

`node tools/milestone-status.mjs` shows recorded milestone decisions and whether current source still matches its evidence. Infrastructure acceptance is a historical prerequisite; M02 naturally changes its source fingerprint and carries its own final report. `node --experimental-strip-types tools/run-shot.mjs [CONFIG.json] [LABEL]` saves shot JSON, CSV, metrics, configuration and source fingerprint under experiments/runs. `node tools/export-validation.mjs m02` exports the recorded independent report for the website only after checking current gates. The dashboard is a saved snapshot, not a live development agent.
