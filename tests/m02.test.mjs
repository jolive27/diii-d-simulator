import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT, MU0, KEV, MACHINE, geometry, basis, equilibrium, runShot, educationalTransport } from '../physics/engine.ts';
import { analytic_benchmark, shaped_benchmark } from '../physics/verification.ts';
import { ledger } from './m02/ledger.mjs';
const spec = JSON.parse(fs.readFileSync(new URL('../specs/m02.json', import.meta.url))), limits = spec.thresholds;
const variants = [{ ...DEFAULT }, { ...DEFAULT, nbi: 0 }, { ...DEFAULT, gas: 0 }, { ...DEFAULT, nbi: 8 }, { ...DEFAULT, gas: 5 }, { ...DEFAULT, nbi: 0, ech: 0, gas: 0 }];
function observed(c, dt, closure = educationalTransport) { const trace = []; const shot = runShot(c, geometry(c), dt, closure, s => trace.push(s)); return { trace, shot }; }
function within(value, max, name = '') { assert.ok(Number.isFinite(value) && value <= max, `${name}: ${value} > ${max}`); }
function ordered(value, range) { assert.ok(Number.isFinite(value) && value >= range[0] && value <= range[1], `Order ${value} not in ${range}`); }

test('M02 exact frozen original M01 regression and observer equivalence', () => {
  const frozen = JSON.parse(fs.readFileSync(new URL('../experiments/baseline/m01-regression.json', import.meta.url)));
  assert.equal(process.version, frozen.runtimeVersion);
  for (const entry of frozen.cases) {
    const g = geometry(entry.c), b = basis(g), shot = runShot(entry.c, g);
    const equilibria = [0, 1, 2.5, 4, 5].map(time => { const s = shot.samples.find(sample => sample.t === time); return equilibrium(b, s.ip, entry.c.bt, s.pressure); });
    // JSON fixture stores typed arrays as numeric-key objects. Roundtrip changes representation only.
    assert.deepEqual(JSON.parse(JSON.stringify({ name: entry.name, c: entry.c, g, b, shot, equilibria })), entry);
    assert.deepEqual(observed(entry.c, .002).shot, shot);
  }
});
test('M02 boundary arrays reject dimensions/nonfinite values, and inactive values alone are prescribed', () => {
  const g = geometry(DEFAULT, 17), u = new Float64Array(17 * 17), v = new Float64Array(17 * 17);
  assert.throws(() => basis(g, { u: [], v }), /match/);
  u[0] = NaN; assert.throws(() => basis(g, { u, v }), /finite/); u[0] = 0;
  const ordinary = basis(g); u.fill(100); v.fill(100);
  for (let k = 0; k < u.length; k++) if (!g.mask[k]) { u[k] = 0; v[k] = 0; }
  assert.deepEqual(basis(g, { u, v }), ordinary);
});
test('M02 rectangular analytic gates with production operator and independent measurements', () => {
  const result = analytic_benchmark(), fine = result.rows.at(-1);
  for (const row of result.rows) {
    assert.ok(row.basisResidual < limits.basisResidual);
    within(row.truncationIdentityRelative, limits.truncationIdentityRelative, 'identity');
    within(row.exactDerivativeIdentityRelative, limits.truncationIdentityRelative, 'derivative identity');
    within(row.boundaryRelative, limits.boundaryRelative);
    assert.ok(row.fluxLinfRelative > 0 && row.fluxL2Relative > 0 && row.exactDerivativeError > 0);
  }
  for (const row of result.refinement) { ordered(row.fluxLinfOrder, limits.fluxOrder); ordered(row.fluxL2Order, limits.fluxOrder); ordered(row.exactDerivativeOrder, limits.fluxOrder); }
  within(fine.fluxLinfRelative, limits.fineFluxLinfRelative); within(fine.fluxL2Relative, limits.fineFluxL2Relative);
  within(fine.axis.radialErrorGridSpacings, limits.fineAxisErrorGridSpacings); within(fine.axis.verticalErrorGridSpacings, limits.fineAxisErrorGridSpacings); within(fine.axis.peakRelative, limits.finePeakRelative);
  within(fine.pressurePointwiseRelative, limits.finePressurePointwiseRelative); within(fine.currentPointwiseRelative, limits.fineCurrentPointwiseRelative);
  within(fine.integratedCurrentRelative, limits.fineIntegratedCurrentRelative); within(fine.meanPressureRelative, limits.fineMeanPressureRelative);
  for (let i = 1; i < result.rows.length; i++) { assert.ok(result.rows[i].integratedCurrentRelative < result.rows[i - 1].integratedCurrentRelative); assert.ok(result.rows[i].meanPressureRelative < result.rows[i - 1].meanPressureRelative); }
});
test('M02 fixed-pressure shaped and ellipse consistency without second-order claims', () => {
  for (const study of shaped_benchmark().cases) {
    for (const row of study.rows) {
      assert.ok(row.minInteriorFlux > 0 && row.minF2 > 0); assert.equal(row.outsideMaskMaximum, 0);
      assert.ok(row.currentError < limits.shapedCurrentPressureRelative && row.pressureError < limits.shapedCurrentPressureRelative && row.residual < limits.shapedResidual);
      within(row.boundaryDistance.curveToInterfaceGridDiagonals, limits.boundaryDistanceGridDiagonals); within(row.boundaryDistance.interfaceToCurveGridDiagonals, limits.boundaryDistanceGridDiagonals);
    }
    const fine = study.refinement.at(-1); within(fine.volumeRelative, limits.shaped65to129VolumeRelative); within(fine.peakFluxRelative, limits.shaped65to129PeakFluxRelative); within(fine.axisDisplacementCoarseGridDiagonals, limits.shapedAxisCoarseGridDiagonals);
    if (study.delta === 0) within(study.rows.at(-1).ellipseVolumeRelative, limits.ellipseFineVolumeRelative);
  }
});
test('M02 observer is frozen, continuous and does not suppress callback errors', () => {
  const { trace } = observed(DEFAULT, .002);
  assert.equal(trace.length, 2500); assert.equal(trace[0].t, 0); assert.equal(trace.at(-1).t + trace.at(-1).dt, 5);
  assert.ok(trace.every(Object.isFrozen)); assert.throws(() => { trace[0].postN = 1; }, TypeError);
  for (let i = 1; i < trace.length; i++) { assert.equal(trace[i].preN, trace[i - 1].postN); assert.equal(trace[i].preWe, trace[i - 1].postWe); assert.equal(trace[i].preWi, trace[i - 1].postWi); }
  assert.throws(() => runShot(DEFAULT, geometry(DEFAULT), .002, educationalTransport, () => { throw new Error('observer failure'); }), /observer failure/);
});
test('M02 independent per-step and cumulative species/thermal budgets for twelve cases', () => {
  assert.equal(KEV, 1.602176634e-16); assert.equal(MACHINE.R, 1.66); assert.equal(MU0, 4 * Math.PI * 1e-7);
  for (const c of variants) for (const dt of [.002, .001]) {
    const result = ledger(c, observed(c, dt).trace);
    for (const [key, value] of Object.entries(result.worst)) within(value, limits.ledgerRelative, key);
    assert.equal(result.components.electronExchange, -result.components.ionExchange);
  }
});
test('M02 independent ledger rejects particle corruption and opposite species corruption', () => {
  const { trace } = observed(DEFAULT, .002);
  // Perturb final step to isolate budget rejection from the separate continuity guard.
  const particles = trace.map(s => ({ ...s })); particles.at(-1).postN += 1e-5 * trace[0].initialN;
  assert.ok(ledger(DEFAULT, particles).worst.N > limits.ledgerRelative);
  const species = trace.map(s => ({ ...s })), delta = 1e-5 * trace[0].initialWe;
  species.at(-1).postWe += delta; species.at(-1).postWi -= delta;
  const result = ledger(DEFAULT, species); assert.ok(result.worst.We > limits.ledgerRelative && result.worst.Wi > limits.ledgerRelative); within(result.worst.W, limits.ledgerRelative);
});
test('M02 continuous constant-source particle oracle converges under halving', () => {
  const c = { ...DEFAULT, nbi: 0 }, volume = geometry(c).volume, initial = 3e19 * volume;
  const expected = initial * Math.exp(-5 / 1.6) + .3 * c.gas * 1e21 * 1.6 * (1 - Math.exp(-5 / 1.6));
  const errors = [.002, .001].map(dt => Math.abs(observed(c, dt).trace.at(-1).postN / expected - 1));
  within(errors[0], limits.analyticParticleDt002Relative); assert.ok(errors[1] < errors[0]);
});
const checkpoints = [.5, 1, 2, 2.5, 3, 4, 4.5, 5];
function states(c, dt) {
  const { trace } = observed(c, dt);
  return checkpoints.map(t => {
    const s = trace[Math.round(t / trace[0].dt) - 1]; assert.ok(Math.abs(s.t + s.dt - t) < 1e-14);
    assert.ok(s.postN > 0 && s.postWe > 0 && s.postWi > 0);
    return { N: s.postN, We: s.postWe, Wi: s.postWi, Te: s.postWe / (1.5 * s.postN * 1.602176634e-16), Ti: s.postWi / (1.5 * s.postN * 1.602176634e-16) };
  });
}
test('M02 aligned timestep convergence for baseline and no heating/fueling', () => {
  for (const c of [variants[0], variants.at(-1)]) {
    const runs = [.004, .002, .001, .0005].map(dt => states(c, dt));
    for (const key of ['N', 'We', 'Wi', 'Te', 'Ti']) {
      const diffs = runs.slice(1).map((run, i) => run.map((s, j) => (runs[i][j][key] - s[key]) / Math.max(Math.abs(s[key]), 1e-12)));
      within(Math.max(...diffs[2].map(Math.abs)), limits.timeFineDifferenceRelative);
      const norms = diffs.map(values => Math.hypot(...values));
      for (let i = 0; i < 2; i++) if (!(norms[i] <= limits.timeRoundoffRelative && norms[i + 1] <= limits.timeRoundoffRelative)) ordered(Math.log2(norms[i] / norms[i + 1]), limits.timeObservedOrder);
    }
  }
});
test('M02 stability sweep, stiff closure rejection and nonaligned coverage', () => {
  for (const dt of [.01, .005, .002, .001, .003]) {
    const { shot, trace } = observed(DEFAULT, dt), result = ledger(DEFAULT, trace);
    for (const value of Object.values(result.worst)) within(value, limits.ledgerRelative);
    assert.equal(shot.dt, 5 / Math.round(5 / dt));
    assert.ok(trace.every(s => s.postN > 0 && s.postWe > 0 && s.postWi > 0));
    if (dt === .003) { assert.ok(!shot.samples.some(s => s.t === 1 || s.t === 4)); assert.equal(shot.samples.at(-1).t, 5); }
  }
  const coarse = states(DEFAULT, .01), fine = states(DEFAULT, .001);
  for (const key of ['N', 'We', 'Wi']) for (let i = 0; i < coarse.length; i++) within(Math.abs(coarse[i][key] / fine[i][key] - 1), limits.stabilityCoarseDifferenceRelative);
  assert.throws(() => runShot(DEFAULT, geometry(DEFAULT), .002, { evaluate: () => ({ tauE: 1e-4, tauP: 1.6, resistivity: 2.8e-8 }) }), /valid thermal-plasma regime/);
  for (const dt of [0, -.001, NaN, .010001]) assert.throws(() => runShot(DEFAULT, geometry(DEFAULT), dt), /Time step/);
});
test('M02 source units and absorbed heating partitions have explicit independent expectations', () => {
  const closureValues = { tauE: .12, tauP: 1.6, resistivity: 2.8e-8 };
  const { trace } = observed(DEFAULT, .002, { evaluate: () => closureValues });
  const result = ledger(DEFAULT, trace, closureValues);
  for (const value of Object.values(result.worst)) within(value, limits.ledgerRelative);
  // Five seconds of gas, three seconds of active 4 MW NBI and 1 MW ECH.
  const expected = { gas: 3.75e21, beam: 9.6e6 / 1.2817413072e-14, electronNbi: 3.36e6, electronEch: 2.7e6, ionNbi: 6.24e6 };
  for (const [key, value] of Object.entries(expected)) within(Math.abs(result.components[key] / value - 1), 1e-12, key);
  // Hand-calculated contributions for one active .002-second step.
  within(Math.abs((.002 * .3 * 2.5 * 1e21) / 1.5e18 - 1), 1e-15);
  within(Math.abs((.002 * .8 * 4 * 1e6 / (80 * 1.602176634e-16)) / (6400 / 1.2817413072e-14) - 1), 1e-15);
  within(Math.abs(.002 * .8 * .35 * 4e6 - 2240), 1e-12);
  within(Math.abs((.002 * .9 * 1e6) / 1800 - 1), 1e-15);
  within(Math.abs((.002 * .8 * .65 * 4e6) / 4160 - 1), 1e-15);
});
