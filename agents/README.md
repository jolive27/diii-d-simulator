# How development works

1. The Director records the task and its approved scope in `experiments/records`.
2. A Physics lane writes a specification proposal: governing equations, units, normalization, boundary conditions, expected behavior, quantitative acceptance criteria, and limitations. The Director reviews it.
3. The Director promotes the approved spec into `specs/` and runs `node tools/workflow.mjs approve MILESTONE`.
4. A separate Software lane implements only that spec and saves test outputs, the changed paths, and its assumption and model declarations.
5. Source is frozen. A separate Validation lane reads and runs the final source and writes `validation/MILESTONE-report.json`, its evidence, and the source fingerprint. It cannot fix production code.
6. The Director runs `node tools/workflow.mjs gate MILESTONE`, then `accept`. A failure blocks acceptance. Any later edit invalidates the validation and it has to be rerun.

The lanes run through TeamFlow (`tools/teamflow/`, CLI `node tools/teamflow/teamflow.mjs`): Director on claude-opus, Physics and Software on claude-sonnet, Validation on claude-opus (a different model from Software), research and review on claude-haiku. `teamflow assign` dispatches each lane headlessly with `claude -p --model <opus|sonnet|haiku>` in its own execution context. The lanes still share a filesystem, so the role scopes in `agents/permissions.json` and the content checks at `complete` and `gate` are instructions and acceptance checks, not OS access control. Do not describe them as more than that. Every stage is audited by Jev in one batched call over one state before the Director signs off.

`tools/dispatch-agent.mjs` is the first-phase dispatcher. It is retired and kept only because the infrastructure validation uses its `allowed()` permission helper. Execution separation for terminal-driven runs now goes through TeamFlow `assign` and the role scopes above.

Only the local Director runs approval commands. The scripts enforce provenance and quality; they are not authentication against a malicious process running as the same OS user. If you need real isolation, use separate OS accounts or containers and a privileged integration service.

## Evidence and experiments

`node tools/milestone-status.mjs` shows the recorded milestone decisions and whether the current source still matches their evidence. Infrastructure acceptance is a historical prerequisite; M02 changed its source fingerprint on purpose and carries its own final report. `node --experimental-strip-types tools/run-shot.mjs [CONFIG.json] [LABEL]` saves shot JSON, CSV, metrics, configuration, and a source fingerprint under `experiments/runs`. `node tools/export-validation.mjs m02` exports the recorded independent report for the website, and only after checking the current gates. The dashboard is a saved snapshot, not a live agent.
