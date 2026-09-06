import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT, geometry, runShot } from '../physics/engine.ts';
import { run_shot, run_benchmark, parameter_sweep, get_metrics, export_results } from '../physics/api.ts';

test('default API and named baseline preserve every M01 output field and sample', () => {
  const existing = runShot(DEFAULT, geometry(DEFAULT));
  assert.deepEqual(run_shot(), existing);
  assert.deepEqual(run_benchmark('baseline'), existing);
});
test('custom controls, mesh, and time step delegate exactly to the unchanged engine', () => {
  const config = Object.freeze({ controls: Object.freeze({ nbi: 8, delta: 0.2 }), gridSize: 33, dt: 0.003 });
  const controls = { ...DEFAULT, ...config.controls };
  assert.deepEqual(run_shot(config), runShot(controls, geometry(controls, 33), 0.003));
  assert.equal(run_shot(config).dt, 5 / Math.round(5 / 0.003));
});
test('API rejects malformed inputs and unsupported operations explicitly', () => {
  for (const config of [null, [], { typo: 1 }, { controls: null }, { controls: { typo: 1 } }, { controls: { bt: NaN } }, { gridSize: NaN }, { gridSize: 18 }, { gridSize: 49.5 }, { dt: Infinity }, { dt: 0 }]) {
    assert.throws(() => run_shot(config));
  }
  assert.throws(() => run_benchmark('M02'), /Unsupported benchmark/);
  assert.throws(() => parameter_sweep({}, 'typo', [1]), /Unknown sweep control/);
  assert.throws(() => parameter_sweep({}, 'nbi', []), /nonempty/);
  assert.throws(() => parameter_sweep({}, 'nbi', [4, 99]), /Invalid nbi/);
  assert.throws(() => parameter_sweep({}, 'nbi', Array(2)), /Invalid nbi/);
  assert.throws(() => export_results(run_shot(), 'xml'), /Unsupported export format/);
});
test('sweep preserves requested order and duplicates without mutating inputs or sharing results', () => {
  const config = Object.freeze({ controls: Object.freeze({ ech: 2 }), gridSize: 33 });
  const values = Object.freeze([8, 4, 8]);
  const results = parameter_sweep(config, 'nbi', values);
  assert.deepEqual(results.map(shot => shot.controls.nbi), values);
  for (let i = 0; i < values.length; i++) {
    assert.deepEqual(results[i], run_shot({ ...config, controls: { ech: 2, nbi: values[i] } }));
  }
  results[0].samples[0].te = -1;
  results[0].controls.ech = -1;
  assert.equal(results[2].samples[0].te, 0.5);
  assert.equal(results[2].controls.ech, 2);
});
test('metrics summarize known stored samples including absolute conservation errors', () => {
  const shot = run_shot();
  const sample = shot.samples[0];
  shot.samples = [
    { ...sample, t: 1, te: 3, ti: 7, ne: 2, we: 4, wi: 1, beta: 2, energyError: -0.4, particleError: 0.1 },
    { ...sample, t: 2, te: 5, ti: 6, ne: 4, we: 1, wi: 5, beta: 3, energyError: 0.2, particleError: -0.3 },
  ];
  const before = structuredClone(shot);
  assert.deepEqual(get_metrics(shot), { sampleCount: 2, startTimeSeconds: 1, endTimeSeconds: 2, peakElectronTemperatureKeV: 5, peakIonTemperatureKeV: 7, peakDensity1e19PerM3: 4, peakThermalEnergyMJ: 6, peakBetaPercent: 3, maxAbsEnergyError: 0.4, maxAbsParticleError: 0.3 });
  assert.deepEqual(shot, before);
  assert.throws(() => get_metrics({ ...shot, samples: [] }), /empty shot/);
});
test('exports preserve complete JSON and all numeric CSV samples without mutation', () => {
  const shot = run_shot();
  const before = structuredClone(shot);
  assert.deepEqual(JSON.parse(export_results(shot)), shot);
  const [header, ...rows] = export_results(shot, 'csv').trimEnd().split('\n');
  const fields = header.split(',');
  assert.deepEqual(fields, Object.keys(shot.samples[0]));
  assert.equal(rows.length, shot.samples.length);
  rows.forEach((row, i) => assert.deepEqual(row.split(',').map(Number), fields.map(field => shot.samples[i][field])));
  assert.deepEqual(shot, before);
});
