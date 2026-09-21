import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('d3gate dry run emits Jev state and all typed questions without calling the API', () => {
  const out = execFileSync('python3', ['tools/jev-gate.py', '--dry'], { cwd: root, encoding: 'utf8' });
  for (const key of ['"peakElectronTemperatureKeV"', '"peakBetaPercent"', '"maxAbsEnergyError"', '"confinementTimeAtEndSeconds"']) {
    assert.ok(out.includes(key), `state key ${key} missing`);
  }
  for (const name of ['"physically_plausible"', '"numerics_healthy"', '"confinement_quality"', '"next_action"']) {
    assert.ok(out.includes(name), `question ${name} missing`);
  }
});

test('d3gate dry run is deterministic for the default baseline shot', () => {
  const first = execFileSync('python3', ['tools/jev-gate.py', '--dry'], { cwd: root, encoding: 'utf8' });
  const second = execFileSync('python3', ['tools/jev-gate.py', '--dry'], { cwd: root, encoding: 'utf8' });
  assert.equal(first, second);
});

test('d3gate honors an explicit gates script command', () => {
  const run = execFileSync('pnpm', ['jev:gate', '--dry'], { cwd: root, encoding: 'utf8' });
  assert.match(run, /confinementTimeAtEndSeconds/);
});