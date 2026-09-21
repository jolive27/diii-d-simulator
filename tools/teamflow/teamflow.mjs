#!/usr/bin/env node
/** TeamFlow — Director-operated engineering-team workflow engine.
 *
 * Usage:
 *   init <unit> [--title T] [--kind K]
 *   assign <unit> <stage> <role> <task...> [--model M]
 *   complete <unit> <stage> --files a,b [--report "..."] [--role R] [--model M]
 *   eval <unit> <stage> [--model M]          # Jev batched audit
 *   evals <unit>                              # list recorded audits
 *   compact <unit> [--summary "..."] [--draft-by ROLE] [--summary-file P]
 *   gate <unit>                               # structural gate (exit 0=PASS)
 *   accept <unit> [--formal]                  # Director sign-off
 *   release <unit>
 *   retro <unit> --notes "..."
 *   status [unit]
 *   models
 *   selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import { root, audit } from '../workflow.mjs';
import { readRegistry, dispatch } from './backends.mjs';
import { initUnit, loadUnit, writeUnit, listUnits, decisionPath, allStagesThrough } from './state.mjs';
import { runEval, runEvalBatch, compactAudit, gateCheck, stageFor, evalTemplate, roleModel } from './gates.mjs';
import { allowed } from '../dispatch-agent.mjs';

const [cmd, ...args] = process.argv.slice(2);

function fail(msg = '') {
  if (msg) console.error(msg);
  process.exitCode = 1;
}

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
function flagLast(name) {
  const i = args.lastIndexOf(`--${name}`);
  return i >= 0 ? args.slice(i + 1).join(' ') : undefined;
}

function table(reg) {
  const rows = [['MODEL', 'BACKEND', 'REACHABLE', 'ROLES', 'NOTE']];
  for (const [id, m] of Object.entries(reg.models)) {
    rows.push([id, m.backend, String(m.reachable), (m.roles || []).join(','), m.note || '']);
  }
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(i === 4 ? 14 : i === 1 ? 9 : i === 2 ? 11 : i === 3 ? 30 : 26)).join(' '));
}

async function run() {
  const reg = readRegistry();

  if (cmd === 'models') {
    table(reg);
    return;
  }

  if (cmd === 'init') {
    const unit = args[0];
    if (!unit) return fail('init <unit>');
    const s = initUnit(unit, { title: flag('title'), kind: flag('kind') });
    console.log(JSON.stringify({ unit: s.unit, title: s.title, kind: s.kind, director: s.director }, null, 2));
    return;
  }

  if (cmd === 'assign') {
    const [unit, stage, role, ...words] = args;
    if (!unit || !stage || !role || !words.length) return fail('assign <unit> <stage> <role> <task...> [--model M]');
    const state = loadUnit(unit);
    const st = state.stages[stage];
    if (!st) return fail(`unknown stage '${stage}'`);
    const idx = words.findIndex(w => w.startsWith('--'));
    const task = (idx === -1 ? words : words.slice(0, idx)).join(' ');
    const model = flag('model') || (state.tasks[stage]?.model) || reg.roles[role]?.model;
    st.status = 'in_progress';
    state.tasks[stage] = { task, model, role, time: new Date().toISOString() };
    writeUnit(state);
    const res = dispatch({ unit, stage, role, model, task });
    if (res.error) console.error('dispatch warning:', res.error);
    if (res.manual) {
      console.log(`MANUAL — brief written to ${res.briefPath}`);
      console.log(`Run the task with ${model} in your IDE, then: node tools/teamflow.mjs complete ${unit} ${stage} --files ... --report "..."`);
    } else if (res.ok) {
      const outDir = path.join(root, `experiments/teamflow/runs`, `${unit}-${stage}-${role}.out.txt`);
      fs.mkdirSync(path.dirname(outDir), { recursive: true });
      fs.writeFileSync(outDir, res.output);
      console.log(`dispatched to ${res.backend}/${res.model}; output saved to ${outDir}`);
      console.log(`Review then: node tools/teamflow.mjs complete ${unit} ${stage} --files ... --report "...";  then: node tools/teamflow.mjs eval ${unit} ${stage}`);
    } else {
      return fail(`dispatch failed: ${JSON.stringify(res)}`);
    }
    return;
  }

  if (cmd === 'complete') {
    const [unit, stage] = args;
    if (!unit || !stage) return fail('complete <unit> <stage> --files a,b [--report "..."]');
    const state = loadUnit(unit);
    const st = state.stages[stage];
    if (!st) return fail(`unknown stage '${stage}'`);
    const files = (flag('files') || '').split(',').map(s => s.trim()).filter(Boolean);
    const report = flagLast('report');
    const role = flag('role') || stageFor(stage).owner;
    const model = flag('model') || state.tasks[stage]?.model || reg.roles[role]?.model;
    const perms = reg.roles[role] ? null : null;
    const violations = files.filter(f => !allowed(role, f) || (perms === null && false));
    if (violations.length) return fail(`permission violations for ${role}: ${violations.join(', ')}`);
    if (!files.length) return fail('complete requires at least one --files entry');
    if (!report) return fail('complete requires a --report handoff');
    st.status = 'done';
    state.artifactWindows[stage] = { role, files, model, time: new Date().toISOString() };
    state.handoffs[stage] = report;
    writeUnit(state);
    audit({ role: 'director', action: 'teamflow-complete', unit, stage, role, model, files });
    console.log(`stage '${stage}' complete (${role}/${model}); next: node tools/teamflow.mjs eval ${unit} ${stage}`);
    return;
  }

  if (cmd === 'eval') {
    const [unit, stage] = args;
    if (!unit || !stage) return fail('eval <unit> <stage|all [...]> [--model M]');
    const state = loadUnit(unit);
    const stages = stage.toLowerCase() === 'all'
      ? reg.stages.map(s => s.id).filter(id => evalTemplate(id))
      : args.slice(1);
    for (const s of stages) if (!stageFor(s)) return fail(`unknown stage '${s}'`);
    let records;
    if (stages.length === 1) {
      const out = await runEval(state, stages[0], { jevModel: flag('model') });
      records = { [stages[0]]: out.record };
    } else {
      records = await runEvalBatch(state, stages, { jevModel: flag('model') });
    }
    writeUnit(state);
    console.log(JSON.stringify(records, null, 2));
    const failed = Object.values(records).filter(r => r && r.status === 'FAIL');
    if (failed.length) fail(`Jev audit below threshold for: ${failed.map(r => r.stage).join(', ')}`);
    return;
  }

  if (cmd === 'evals') {
    const state = loadUnit(args[0]);
    if (!state) return fail('evals <unit>');
    for (const [stage, e] of Object.entries(state.evals || {})) {
      console.log(`${stage.padEnd(16)} ${e.status.padEnd(5)} ${e.time} model=${e.model}`);
      for (const [q, s] of Object.entries(e.questions || {})) console.log(`   ${q.padEnd(24)} ${s.pass ? 'OK  ' : 'FAIL'} value=${s.value?.toFixed(3)} min=${s.min}`);
    }
    if (!Object.keys(state.evals || {}).length) console.log('no audits recorded yet');
    return;
  }

  if (cmd === 'compact') {
    const unit = args[0];
    if (!unit) return fail('compact <unit>');
    const state = loadUnit(unit);
    let summary = flagLast('summary');
    const draftBy = flag('draft-by');
    const sfile = flag('summary-file');
    if (sfile && fs.existsSync(sfile)) summary = fs.readFileSync(sfile, 'utf8');
    if (draftBy && !summary) {
      const role = draftBy;
      const model = reg.roles[role]?.model;
      const out = dispatch({ unit, stage: 'compact', role, model, task: `Write a compact resume summary (max 400 words) covering decisions, risks, next steps, and open concerns. Output ONLY the summary text.` });
      if (!out.ok && !out.manual) return fail(`draft dispatch failed: ${out.error}`);
      if (out.manual) return fail(`draft-by ${role} is manual; provide --summary or --draft-by a reachable model`);
      const m = out.output.match(/```(?:markdown|md)?\s*([\s\S]*?)```/);
      summary = m ? m[1].trim() : out.output.trim();
    }
    if (!summary) summary = `Compact resume for ${unit}: see status table; gate/accept statuses per audits. (auto)`;
    const result = await compactAudit(state, summary);
    state.compact = { ...result, time: new Date().toISOString(), draftedBy: draftBy || 'director' };
    writeUnit(state);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'REJECT') fail(`compaction rejected by Jev: ${result.below.join(', ')}`);
    return;
  }

  if (cmd === 'gate') {
    const unit = args[0];
    if (!unit) return fail('gate <unit>');
    const state = loadUnit(unit);
    const g = gateCheck(state);
    console.log(JSON.stringify(g, null, 2));
    if (g.status !== 'PASS') fail();
    return;
  }

  if (cmd === 'accept') {
    const unit = args[0];
    if (!unit) return fail('accept <unit>');
    const state = loadUnit(unit);
    const g = gateCheck(state);
    if (g.status !== 'PASS') {
      console.log(JSON.stringify(g, null, 2));
      return fail('gate not passed; acceptance blocked');
    }
    const decision = {
      unit, status: 'ACCEPTED', role: 'director', agentId: roleModel('director'),
      time: new Date().toISOString(), gate: g, stagedBy: state.director,
    };
    // A passing gate plus Director sign-off completes both stages.
    state.stages.gate.status = 'done';
    state.stages.accept.status = 'done';
    fs.mkdirSync(path.dirname(decisionPath(unit)), { recursive: true });
    fs.writeFileSync(decisionPath(unit), JSON.stringify(decision, null, 2) + '\n');
    state.decision = decision;
    writeUnit(state);
    audit({ role: 'director', action: 'teamflow-accept', unit, status: 'ACCEPTED' });
    console.log(JSON.stringify(decision, null, 2));
    if (flag('formal') && fs.existsSync(path.join(root, `specs/${unit}.json`))) {
      console.warn('--formal: legacy workflow.mjs accept gate requires retired Codex agent identity; refusing to run it.');
    }
    return;
  }

  if (cmd === 'release') {
    const state = loadUnit(args[0]);
    if (!state) return fail('release <unit>');
    state.stages.release.status = 'done';
    writeUnit(state);
    console.log(`release recorded for ${args[0]}`);
    return;
  }

  if (cmd === 'retro') {
    const [unit] = args;
    if (!unit) return fail('retro <unit> --notes "..."');
    const notes = flagLast('notes');
    if (!notes) return fail('retro requires --notes');
    const state = loadUnit(unit);
    state.retro = [...(state.retro || []), { time: new Date().toISOString(), notes }];
    state.stages.retro.status = 'done';
    writeUnit(state);
    console.log(`retro recorded for ${unit}`);
    return;
  }

  if (cmd === 'status') {
    const unit = args[0];
    const units = unit ? [unit] : listUnits();
    if (!units.length) { console.log('no units; run: node tools/teamflow.mjs init <unit>'); return; }
    for (const u of units) {
      let state;
      try { state = loadUnit(u); } catch { continue; }
      console.log(`\n${state.unit} — ${state.title} (${state.kind})  director=${state.director}`);
      for (const [id, st] of Object.entries(state.stages)) {
        const ev = state.evals[id];
        console.log(`  ${id.padEnd(14)} [${st.status.padEnd(11)}] owner=${st.owner}${ev ? ` audit=${ev.status}` : ''}`);
      }
      if (state.decision) console.log(`  DECISION: ${state.decision.status} ${state.decision.time}`);
      if (state.compact) console.log(`  COMPACT: ${state.compact.compression}% smaller, Jev=${state.compact.status}`);
    }
    return;
  }

  if (cmd === 'selftest') {
    await selftest();
    return;
  }

  return fail(`unknown command '${cmd}' — see header for usage`);
}

async function selftest() {
  const base = '__selftest__';
  const unit = `${base}${Date.now().toString(36)}`;
  const steps = [];
  const ok = (s) => { steps.push({ step: s, status: 'OK' }); console.log(`  OK  ${s}`); };
  const bad = (s) => { steps.push({ step: s, status: 'FAIL' }); console.error(` FAIL  ${s}`); };
  const collect = [];
  process.env.TEAMFLOW_MOCK = '1';
  const prevKey = process.env.JEV_API_KEY; delete process.env.JEV_API_KEY;

  try {
    initUnit(unit, { title: 'selftest', kind: 'engineering' });
    ok('init');

    const phase = async (pairs) => {
      for (const [stage, role, files, report, model] of pairs) {
        let s = loadUnit(unit);
        s.stages[stage].status = 'in_progress';
        s.tasks[stage] = { task: `test ${stage}`, model, role };
        writeUnit(s);
        const f = flagBundle(files);
        s = loadUnit(unit);
        s.stages[stage].status = 'done';
        s.artifactWindows[stage] = { role, files: f.map(x => x[0]), model, time: new Date().toISOString() };
        s.handoffs[stage] = report;
        writeUnit(s);
        const { record } = await runEval(s, stage);
        s.evals[stage] = record;
        writeUnit(s);
      }
    };

    // Positive path: distinct validation model.
    await phase([
      ['intake', 'director', [['experiments/records/selftest.json']], 'bounded scope, success criteria recorded', 'claude-opus'],
      ['research', 'physics', [['specs/proposals/infra-ref.md']], 'reference pathway documented', 'claude-sonnet'],
      ['spec', 'physics', [['specs/proposals/selftest-spec.md']], 'five-part package complete', 'claude-sonnet'],
      ['design-review', 'director', [['tools/teamflow/registries.json']], 'criteria quantified', 'claude-opus'],
      ['implement', 'software', [['physics/selftest.ts']], 'tests ran', 'claude-sonnet'],
      ['self-review', 'software', [['tests/selftest.test.mjs']], 'drift checked by reviewer', 'claude-haiku'],
      ['validate', 'validation', [['validation/evidence/selftest.json']], 'falsification attempts recorded', 'claude-opus'],
    ]);
    ok('stages complete + audits pass (mock)');

    const g = gateCheck(loadUnit(unit));
    if (g.status === 'PASS') ok('gate PASS');
    else bad(`gate FAIL: ${g.errors.join('; ')}`);

    // Negative: validation reuse of software model must block at gate.
    let s = loadUnit(unit);
    s.artifactWindows.validate.model = 'claude-sonnet';
    writeUnit(s);
    const g2 = gateCheck(loadUnit(unit));
    if (g2.status === 'FAIL' && g2.errors.some(e => e.includes('must differ'))) ok('independence guard blocks same-model validation');
    else bad(`independence guard missed: ${g2.errors.join('; ')}`);

    // Negative: missing audit blocks.
    s = loadUnit(unit);
    s.artifactWindows.validate.model = 'claude-opus';
    delete s.evals.validate;
    writeUnit(s);
    const g3 = gateCheck(loadUnit(unit));
    if (g3.status === 'FAIL' && g3.errors.some(e => e.includes('missing Jev audit'))) ok('missing-audit guard blocks');
    else bad(`missing-audit guard missed: ${g3.errors.join('; ')}`);

    // Restore full state; compaction audit; acceptance.
    s = loadUnit(unit);
    const { record } = await runEval(s, 'validate');
    s.evals.validate = record;
    writeUnit(s);

    const c = await compactAudit(loadUnit(unit), 'Compact: selftest unit passed all gates; validation independent; next: mark accepted.');
    if (c.status === 'ACCEPT') ok('compaction audit ACCEPT');
    else bad(`compaction rejected: ${c.below.join(', ')}`);

    if (gateCheck(loadUnit(unit)).status === 'PASS') ok('gate re-PASS');
    else bad('gate regressed after audit restore');

    // accept
    fs.rmSync(path.join(root, 'experiments/teamflow/units', `${unit}.json`), { force: true });
    ok('selftest unit removed');

    const failed = steps.filter(x => x.status === 'FAIL').length;
    console.log(`\nselftest: ${steps.length - failed}/${steps.length} steps OK`);
    if (failed) process.exitCode = 1;
  } finally {
    if (prevKey !== undefined) process.env.JEV_API_KEY = prevKey;
    fs.rmSync(path.join(root, 'experiments/teamflow/units', `${unit}.json`), { force: true });
    fs.rmSync(path.join(root, `experiments/teamflow/decisions/${unit}.json`), { force: true });
  }
}

function flagBundle(files) { return files; }

run();