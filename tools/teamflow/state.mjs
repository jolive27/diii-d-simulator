/** TeamFlow unit state persistence + provenance. Director-owned under experiments/teamflow. */
import fs from 'node:fs';
import path from 'node:path';
import { root, audit } from '../workflow.mjs';

const DATA = path.join(root, 'experiments/teamflow');
const UNITS = path.join(DATA, 'units');
const DECISIONS = path.join(DATA, 'decisions');
const LEDGER = path.join(DATA, 'teamflow.jsonl');

export function initUnit(unit, { title = unit, kind = 'engineering', director = 'big-pickle' } = {}) {
  const p = path.join(UNITS, `${unit}.json`);
  if (fs.existsSync(p)) return loadUnit(unit);
  const reg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'registries.json'), 'utf8'));
  const stages = Object.fromEntries(reg.stages.map(s => [s.id, { status: 'pending', owner: s.owner, role: s.role || null }]));
  const state = {
    unit, title, kind, director,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    modelVersion: 'teamflow/0.1.0',
    stages,
    tasks: {},
    artifactWindows: {}, // stage -> { role, files: [] }
    handoffs: {},
    evals: {},
    compact: null,
    decision: null,
  };
  fs.mkdirSync(UNITS, { recursive: true });
  fs.mkdirSync(DECISIONS, { recursive: true });
  writeUnit(state);
  audit({ action: 'teamflow-init', unit, title, kind, director });
  ledger({ action: 'init', unit, title, kind });
  return state;
}

export function loadUnit(unit) {
  const p = path.join(UNITS, `${unit}.json`);
  if (!fs.existsSync(p)) throw new Error(`unit '${unit}' not found (run 'init' first)`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function listUnits() {
  if (!fs.existsSync(UNITS)) return [];
  return fs.readdirSync(UNITS).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
}

export function writeUnit(state) {
  state.updated = new Date().toISOString();
  fs.mkdirSync(UNITS, { recursive: true });
  fs.writeFileSync(path.join(UNITS, `${state.unit}.json`), JSON.stringify(state, null, 2) + '\n');
  ledger({ action: 'write', unit: state.unit, stages: state.stages });
}

export function ledger(ev) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify({ time: new Date().toISOString(), ...ev }) + '\n');
}

export function decisionPath(unit) {
  return path.join(DECISIONS, `${unit}.json`);
}

export function stageDone(state, id) {
  return state.stages[id]?.status === 'done';
}

export function allStagesThrough(state, upto) {
  const reg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'registries.json'), 'utf8'));
  const ids = reg.stages.map(s => s.id);
  const idx = ids.indexOf(upto);
  return ids.slice(0, idx + 1).every(id => stageDone(state, id));
}