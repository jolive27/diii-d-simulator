/** Gate logic: Jev audit batches, compaction faithfulness, structural grade checks. */
import fs from 'node:fs';
import path from 'node:path';
import { root, read, hash } from '../workflow.mjs';
import { evaluate, numeric } from './jev.mjs';
import { allowed } from '../dispatch-agent.mjs';

const reg = () => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'registries.json'), 'utf8'));
const isMock = () => process.env.TEAMFLOW_MOCK === '1';

export function evalTemplate(id) {
  return reg().eval_templates[id] || null;
}

/** Kind-aware + context-aware template: unit rubric file wins, then kind override, then registry. */
export function templateFor(state, id) {
  const reg2 = reg();
  const rubricPath = path.join(root, 'experiments', 'teamflow', 'units', `${state.unit}.rubric.json`);
  try {
    if (fs.existsSync(rubricPath)) {
      const rubric = JSON.parse(fs.readFileSync(rubricPath, 'utf8'));
      if (rubric[id]) return rubric[id];
    }
  } catch { /* malformed rubric: fall through to registry */ }
  const over = reg2.kind_overrides?.[state.kind]?.[id];
  if (over) return reg2.eval_templates[over] || null;
  return evalTemplate(id);
}

export function stageFor(id) {
  return reg().stages.find(s => s.id === id);
}

export function roleModel(role) {
  return reg().roles[role]?.model || null;
}

/** Deterministic structural digest used as compact/review state. */
export function digest(state) {
  const out = [];
  out.push(`UNIT ${state.unit} — ${state.title} (${state.kind})`);
  out.push(`director: ${state.director} | created ${state.created}`);
  for (const [id, st] of Object.entries(state.stages)) {
    const a = state.artifactWindows[id];
    const files = a?.files?.join(', ') || '';
    out.push(`- ${id.padEnd(14)} [${st.status.padEnd(11)}] owner=${st.owner}${files ? ` files=${files}` : ''}`);
  }
  for (const unit of Object.keys(state.tasks)) {
    out.push(`task ${unit}: ${state.tasks[unit]}`);
  }
  if (state.handoffs && Object.keys(state.handoffs).length) {
    out.push('handoffs:');
    for (const [stage, text] of Object.entries(state.handoffs)) {
      out.push(`- ${stage}: ${String(text).slice(0, 2500)}`);
    }
  }
  return out.join('\n');
}

async function jevOrMock(stateText, questions) {
  if (isMock()) {
    const answers = {};
    for (const id of Object.keys(questions)) answers[id] = { type: 'noul', probability: 0.99 };
    return { answers, usage: { input_tokens: 1, output_tokens: 1 } };
  }
  return evaluate(stateText, questions, { model: process.env.JEV_MODEL || 'jev-latest' });
}

/** Batched Jev audit for one stage; stores result in state.evals[stage]. */
export async function runEval(state, stageId, { jevModel } = {}) {
  const records = await runEvalBatch(state, [stageId], { jevModel });
  const record = records[stageId];
  return { record, below: record ? record.below : null };
}

/**
 * ALL questions across MANY stages submitted to Jev in ONE call over ONE state
 * (the non-negotiable batching rule). Partitions answers back per stage.
 */
export async function runEvalBatch(state, stageIds, { jevModel } = {}) {
  const ids = stageIds.filter(id => templateFor(state, id));
  const files = [];
  for (const id of ids) {
    const win = state.artifactWindows[id];
    if (!win || !Array.isArray(win.files)) continue;
    for (const f of win.files) {
      try {
        const full = path.join(root, f);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) files.push({ f, content: fs.readFileSync(full, 'utf8') });
      } catch { /* unreadable artifact: skip */ }
    }
  }
  // Total state budget shared across artifacts (Jev rejects oversized states with 400 max_tokens_exceeded).
  const buildPayload = (budget) => {
    // Proportional allocation: small artifacts never starve large ones (an equal split of 90k over
    // five files cut a 33k spec at 18k and hid its acceptance-criteria section from the auditor).
    const total = files.reduce((n, x) => n + x.content.length, 0);
    const scale = total > budget ? budget / total : 1;
    const chunks = [`# TeamFlow multi-stage audit [${ids.join(', ')}]`, '', digest(state), ''];
    for (const { f, content } of files) {
      const per = Math.max(2000, Math.floor(content.length * scale));
      chunks.push(`\n--- artifact: ${f} ---\n\n${content.slice(0, per)}${content.length > per ? `\n...[truncated at ${per} of ${content.length} chars]` : ''}\n`);
    }
    return chunks.join('\n');
  };
  const questions = {};
  for (const id of ids) {
    for (const q of templateFor(state, id)) questions[`${id}::${q.id}`] = { type: q.type, instructions: q.instructions, criteria: q.criteria };
  }
  let budget = Number(process.env.JEV_STATE_BUDGET_CHARS || 90_000);
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await jevOrMock(buildPayload(budget), questions);
      break;
    } catch (err) {
      if (attempt < 3 && /max_tokens_exceeded/.test(err.message || '')) { budget = Math.floor(budget / 2); continue; }
      throw err;
    }
  }
  const records = {};
  for (const id of ids) {
    const tpl = templateFor(state, id);
    const scoredAll = {};
    const below = [];
    for (const q of tpl) {
      const val = numeric(res.answers?.[`${id}::${q.id}`]);
      scoredAll[q.id] = { value: val, min: q.min, pass: val !== null && val >= q.min };
      if (val === null || val < q.min) below.push(q.id);
    }
    const record = {
      time: new Date().toISOString(),
      stage: id,
      questionCount: tpl.length,
      batch: ids.length > 1 ? `batch:${ids.join('+')}` : undefined,
      model: process.env.JEV_MODEL || res.model || 'jev-latest',
      questions: scoredAll,
      status: below.length ? 'FAIL' : 'PASS',
      below,
    };
    state.evals[id] = record;
    records[id] = record;
  }
  return records;
}

/** Compaction: director drafts a summary; Jev audits faithfulness/sufficiency/conciseness in one batch. */
export async function compactAudit(state, summary) {
  const original = digest(state);
  const questions = {
    faithful: {
      type: 'noul', min: 0.75,
      instructions: 'Does the summary retain the essence of the original state without invented facts?',
      criteria: { true: 'Every decision, risk, and next-step in the original appears faithfully in the summary.', false: 'The summary omits a decision/risk/next-step or introduces unsupported content.' },
    },
    sufficient: {
      type: 'noul', min: 0.6,
      instructions: 'Is the summary self-sufficient to resume work without re-reading the full state?',
      criteria: { true: 'A fresh session could act from the summary alone.', false: 'Key context needed to resume is missing.' },
    },
    concise: {
      type: 'noul', min: 0.5,
      instructions: 'Is the summary substantially more concise than the original, while staying equivalent?',
      criteria: { true: 'The summary is a meaningful compression, not a near-copy.', false: 'The summary is nearly as long as the original.' },
    },
  };
  const res = await jevOrMock(`# RESUME\n\n${original}\n\n# PROPOSED SUMMARY\n\n${summary}`, questions);
  const scoredAll = {};
  const below = [];
  for (const id of ['faithful', 'sufficient', 'concise']) {
    const val = numeric(res.answers?.[id]);
    scoredAll[id] = { value: val, min: questions[id].min, pass: val !== null && val >= questions[id].min };
    if (scoredAll[id].pass === false) below.push(id);
  }
  return {
    summary,
    sourceChars: original.length,
    summaryChars: summary.length,
    compression: original.length ? Math.round((1 - summary.length / original.length) * 100) : 0,
    evals: scoredAll,
    status: below.length ? 'REJECT' : 'ACCEPT',
    below,
  };
}

/** Structural gate: order, ownership, permissions, evidence, model independence. */
export function gateCheck(state) {
  const errors = [];
  const reg2 = reg();
  const ids = reg2.stages.map(s => s.id);
  const upto = ids.indexOf('gate');

  for (const id of ids.slice(0, upto)) {
    const st = state.stages[id];
    if (!st || st.status !== 'done') errors.push(`stage '${id}' not complete`);
    else {
      const a = state.artifactWindows[id];
      const role = a?.role || a?.owner || a?.roleToken;
      if (!a || !Array.isArray(a.files) || a.files.length === 0) errors.push(`stage '${id}' recorded no artifact files`);
      else for (const f of a.files) if (!allowed(role, f)) errors.push(`permission violation in '${id}': ${f} is outside ${role} scope`);
    }
  }

  // Required Jev audits: every stage with a (kind-aware) eval template must have a PASS record.
  for (const id of ids.slice(0, upto)) {
    if (templateFor(state, id) && !state.evals[id]) errors.push(`missing Jev audit for stage '${id}'`);
    else if (state.evals[id] && state.evals[id].status !== 'PASS') errors.push(`Jev audit FAIL for stage '${id}'`);
  }

  // Model independence for validation vs software.
  const implModel = effectiveModel(state, 'implement', 'software');
  const valModel = effectiveModel(state, 'validate', 'validation');
  if (implModel && valModel && implModel === valModel) {
    errors.push(`validation model (${valModel}) must differ from software implementation model (${implModel})`);
  }

  return { status: errors.length ? 'FAIL' : 'PASS', errors, sourceFingerprint: hash(digest(state)) };
}

/** Resolve which model actually did a stage: handoff/role annotation or registry default. */
function effectiveModel(state, stageId, role) {
  const win = state.artifactWindows[stageId];
  if (win?.model) return win.model;
  const task = state.tasks[stageId];
  if (task && typeof task === 'object' && task.model) return task.model;
  return roleModel(role);
}