/** Agent execution backends: claude (Claude Code, subscription), opencode (CLI), manual (IDE brief), codex (dormant). */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, read, audit } from '../workflow.mjs';

export function readRegistry() {
  return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'registries.json'), 'utf8'));
}

export function commandPresent(cmd) {
  try {
    spawnSync('sh', ['-lc', `command -v ${cmd}`], { stdio: 'ignore' });
    return spawnSync('sh', ['-lc', `command -v ${cmd}`]).status === 0;
  } catch {
    return false;
  }
}

function manualBrief({ unit, stage, role, model, task }) {
  const reg = readRegistry();
  const roleDef = reg.roles[role] || {};
  const modelDef = reg.models[model] || {};
  const stageDef = reg.stages.find(s => s.id === stage) || {};
  const permsRole = read('agents/permissions.json')[role] ? role : stageDef.owner;
  const perms = read('agents/permissions.json')[permsRole];
  const dir = path.join(root, 'experiments/teamflow/briefs');
  fs.mkdirSync(dir, { recursive: true });
  const file = `${unit}-${stage}-${role}.md`;
  const brief = `# TeamFlow manual assignment

- unit: ${unit}
- stage: ${stage}
- role: ${role}
- model: ${model}
- responsibility: ${roleDef.responsibility || ''}

## Task

${task}

## Constraints

- Read \`AGENTS.md\` and the role contract for \`agents/${role}.md\` first.
- Work within these allowed output paths only: \`${JSON.stringify(perms)}\`.
- Never accept milestones, alter permissions, or edit validation evidence.
- Return a handoff with: files changed, commands run and outputs, limits, open concerns.

## How to report back

Run this from the repo root, supplying the artifacts and handoff report:

\`\`\`
node tools/teamflow.mjs complete ${unit} ${stage} ${role} --files <artifact> --report "<handoff text>"
\`\`\`

After that, direct audited stages need a Jev audit:

\`\`\`
node tools/teamflow.mjs eval ${unit} ${stage}
\`\`\`

(Backend: manual — ${modelDef.note || 'run in your IDE'})
`;
  fs.writeFileSync(path.join(dir, file), brief);
  return path.join(dir, file);
}

export function dispatch({ unit, stage, role, model, task }) {
  const reg = readRegistry();
  const modelDef = reg.models[model];
  if (!modelDef) return { ok: false, error: `unknown model ${model}` };
  const backend = modelDef.backend;
  audit({ role: 'director', action: 'teamflow-dispatch', unit, stage, role, model, backend });

  if (backend === 'manual') {
    const briefPath = manualBrief({ unit, stage, role, model, task });
    return { ok: false, manual: true, briefPath, output: '', backend, model };
  }

  if (backend === 'ollama') {
    if (!commandPresent('ollama')) return { ok: false, error: 'ollama not on PATH' };
    const r = spawnSync('ollama', ['run', model, task], { encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
    return {
      ok: r.status === 0,
      manual: false,
      output: r.stdout.slice(0, 50_000),
      error: r.status !== 0 ? `ollama exit ${r.status}: ${r.stderr.slice(0, 1000)}` : undefined,
      backend,
      model,
    };
  }

  if (backend === 'claude') {
    if (!commandPresent('claude')) return { ok: false, error: 'claude CLI not installed — run: npm i -g @anthropic-ai/claude-code, then claude login' };
    if (process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'ANTHROPIC_API_KEY is set — unset it so Claude Code bills your subscription, not API tokens' };
    const alias = { 'claude-opus': 'opus', 'claude-sonnet': 'sonnet', 'claude-haiku': 'haiku' }[model] || model;
    const perms = read('agents/permissions.json')[role];
    const preamble = `You are the ${role} development agent. Read AGENTS.md and agents/${role}.md first. Work only within allowed output paths: ${JSON.stringify(perms)}. Never accept milestones, alter permissions, or edit validation evidence. Return a handoff: files changed, commands run with outputs, limits, open concerns.`;
    // Long-form stages (specs, implementation) need more than the old 10-minute cap; exit 143 = killed by this timeout.
    const timeout = Number(process.env.TEAMFLOW_LANE_TIMEOUT_MS || 1_800_000);
    const r = spawnSync('claude', ['-p', `${preamble}\n\nTask: ${task}`, '--model', alias, '--permission-mode', 'acceptEdits', '--output-format', 'text'], {
      cwd: root, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024,
    });
    const killed = r.signal === 'SIGTERM' || r.status === 143;
    return {
      ok: r.status === 0,
      manual: false,
      output: (r.stdout || '').slice(0, 50_000),
      error: r.status !== 0 ? (killed ? `claude lane killed after ${timeout / 60000} min (TEAMFLOW_LANE_TIMEOUT_MS); split the task or raise the limit` : `claude exit ${r.status}: ${(r.stderr || '').slice(0, 1000)}`) : undefined,
      backend,
      model,
    };
  }

  if (backend === 'opencode') {
    if (!commandPresent('opencode')) return { ok: false, error: 'opencode not on PATH' };
    const r = spawnSync('opencode', ['run', '-m', modelDef.model, '--agent', role, '--dir', root, task], {
      encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024,
    });
    return {
      ok: r.status === 0,
      manual: false,
      output: (r.stdout || '').slice(0, 50_000),
      error: r.status !== 0 ? `opencode exit ${r.status}: ${(r.stderr || '').slice(0, 1000)}` : undefined,
      backend,
      model,
    };
  }

  if (backend === 'codex') {
    return { ok: false, error: 'codex backend dormant (no gpt-6-astra); use manual or claude' };
  }

  return { ok: false, error: `unknown backend ${backend}` };
}