# Persistent development workflow

1. Director records task and approved scope in experiments/records.
2. Dispatch a real Physics agent to produce a specification proposal. Review governing equations, units, normalization, boundary conditions, expected behavior, quantitative acceptance criteria and limitations.
3. Director promotes approved specification into specs/MILESTONE.json and runs `node tools/workflow.mjs approve MILESTONE`.
4. Dispatch a distinct Software agent to implement only that specification. Save test outputs, changed paths and assumption/model declarations.
5. Freeze source. Dispatch a distinct Independent Validation agent; it reads and executes the final source and writes validation/MILESTONE-report.json, evidence and source fingerprint. It cannot repair production code.
6. Director runs `node tools/workflow.mjs gate MILESTONE`, then `accept`. Failure blocks acceptance. New edits invalidate current validation and require rerun.

This session uses Codex native collaboration subagents: /root (Director), /root/physics, /root/software and /root/validation, with separate execution contexts. Model configuration for the three specialists is explicitly gpt-6-astra/medium. Native subagents share a filesystem; the role contracts and content checks do not create OS access control. Do not claim otherwise.

For future terminal-driven runs, `tools/dispatch-agent.mjs ROLE TASK-ID "task"` starts a real Codex process in a separate workspace with gpt-6-astra/medium. It records changed files and rejects output beyond agents/permissions.json. It does not auto-import changes. Director reviews and imports permitted artifacts, records the real session identity from execution logs, and applies the same gates. CLI requires existing Codex authentication. It is an alternate dispatcher, not a web LLM feature.

Only the local trusted Director invokes approval commands. The scripts are provenance/quality enforcement, not authentication against a malicious process running as the same OS user. For adversarial hard isolation, use separate OS accounts/containers and a privileged integration service.
