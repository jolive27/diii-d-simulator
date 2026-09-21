// D2 profiles verification: the ten checks of specs/proposals/d2-profiles-verification.md, one test() per check.
// Real numbers only; each check writes tests/d2/evidence/d2-ver-<check>.json (verification s1). Helpers live in tests/d2/.
// Long fixture runs (eigenmodes, refinement) execute in worker threads, started at load so they overlap the serial checks; results are deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT, geometry, runShot } from '../physics/engine.ts';
import { PROFILES_DEFAULTS, resolveProfiles, runProfileKernel, evaluateDiagnostics } from '../physics/profiles.ts';
import { variants, allZero, meas, band, writeEvidence, deepIs, profileOptions, observedProfileRun } from './d2/util.mjs';
import { dVcell, stepResiduals } from './d2/ledger.mjs';
import { traceRun } from './d2/trace.mjs';
import { sweepCases, runSweepCase, SWEEP } from './d2/sweep-driver.mjs';
import { a1, b1, J0, J1, KEV, R0, cellAvg, l2rel, f1Shape, makeAc7, fixtures, fixtureField, fixtureExact, spatialRates, temporalRates, spatialRateInputs, temporalDts, temporalN, f4SourceResidual } from './d2/fixtures.mjs';
import { runJobs } from './d2/pool.mjs';

const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const frozen = read('../experiments/baseline/m01-regression.json'), m01shot = read('../experiments/baseline/m01-shot.json');
const ORIGINAL = ['schemaVersion', 'modelVersion', 'controls', 'volume', 'dt', 'samples', 'assumptions'];
const roundTrip = x => JSON.parse(JSON.stringify(x));
const nameOf = c => frozen.cases.find(e => deepIs(e.c, c).differences === 0)?.name;
const PARITY_CASES = [...variants.map(c => ({ c, chi: 3 })), { c: allZero, chi: 5 }];
const label = ({ c, chi }) => `nbi${c.nbi}/ech${c.ech}/gas${c.gas}/chi${chi}`;

test('D2-VER-OFFPATH profile-off is bit-for-bit 0.1.0; invalid options throw before stepping; profile-on is a passenger', () => {
  assert.equal(process.version, frozen.runtimeVersion);
  const runs = [], noop = () => {};
  const offForms = [['absent', undefined], ['undefined', undefined], ['{enabled:false}', { enabled: false }], ['{enabled:false,N_rho:-1,chi_e:NaN}', { enabled: false, N_rho: -1, chi_e: NaN }]];
  for (const c of variants) {
    const g = geometry(c), reference = roundTrip(frozen.cases.find(e => deepIs(e.c, c).differences === 0).shot), base = runShot(c, g, 0.002);
    for (const [form, opt] of offForms) {
      const shot = form === 'absent' ? runShot(c, g, 0.002) : runShot(c, g, 0.002, undefined, undefined, opt);
      const vsFrozen = deepIs(roundTrip(shot), reference), vsBase = deepIs(shot, base);
      assert.equal(shot.modelVersion, '0.1.0'); assert.equal(shot.schemaVersion, 1); assert.ok(!('profiles' in shot));
      runs.push({ inputs: { controls: c, optionsForm: form, dt: 0.002, reference: `experiments/baseline/m01-regression.json case ${nameOf(c)}` }, measurements: [meas('fields compared vs frozen 0.1.0 shot', vsFrozen.compared, 1, { lower: true }), meas('differences vs frozen 0.1.0 shot', vsFrozen.differences, 0), meas('differences vs option-absent run', vsBase.differences, 0)] });
    }
  }
  { // experiments/baseline/m01-shot.json at its recorded settings
    const shot = runShot(m01shot.controls, geometry(m01shot.controls), m01shot.dt), ref = Object.fromEntries(ORIGINAL.map(k => [k, m01shot[k]])), d = deepIs(roundTrip(shot), ref);
    runs.push({ inputs: { controls: m01shot.controls, dt: m01shot.dt, reference: 'experiments/baseline/m01-shot.json (original Shot fields)' }, measurements: [meas('fields compared', d.compared, 1, { lower: true }), meas('differences', d.differences, 0)] });
  }
  // Invalid options: nothing may step (counting M02 observer) and nothing may be defaulted.
  const valid = profileOptions(), c = DEFAULT, g = geometry(c);
  const rejected = (opt, name) => {
    let calls = 0; let threw = false;
    try { runShot(c, g, 0.002, undefined, () => calls++, opt); } catch { threw = true; }
    assert.ok(threw, `${name} must throw`); assert.equal(calls, 0, `${name} stepped before throwing`);
    runs.push({ inputs: { invalid: name }, measurements: [meas('throws (1 = yes) shortfall', 1 - Number(threw), 0), meas('observer calls before throw', calls, 0)] });
  };
  for (const v of [0, 1, 'true', null, [], {}]) rejected({ enabled: v }, `enabled=${JSON.stringify(v)}`);
  const bad = { N_rho: [15, 257, 64.5, NaN], D: [0.02, 1.01, NaN, Infinity], chi_e: [1.4, 10.1], chi_i: [1.4, 10.1], rho_NBI: [-0.1, 0.71], sigma_NBI: [0.09, 0.41], rho_ECH: [-0.1, 0.81], sigma_ECH: [0.04, 0.26], gas_exponent: [1, 9], jshape_gamma: [-0.1, 2.1] };
  for (const [k, list] of Object.entries(bad)) for (const v of list) rejected(profileOptions({ [k]: v }), `${k}=${v}`);
  rejected({ enabled: true, chi_e: 3 }, 'partial {enabled:true,chi_e:3}');
  rejected({ enabled: true }, 'partial {enabled:true} (no silent defaults; implementation choice, see handoff)');
  rejected(profileOptions({ chi_E: 3 }), 'unknown field chi_E');
  for (const v of [null, 5, 'x', []]) rejected(v, `profiles=${JSON.stringify(v)}`);
  // Valid inputs must not throw: the approved defaults and every range endpoint.
  const endpoints = [{}, { N_rho: 16 }, { N_rho: 256 }, { D: 0.03 }, { D: 1 }, { chi_e: 1.5 }, { chi_e: 10 }, { chi_i: 1.5 }, { chi_i: 10 }, { rho_NBI: 0 }, { rho_NBI: 0.7 }, { sigma_NBI: 0.1 }, { sigma_NBI: 0.4 }, { rho_ECH: 0 }, { rho_ECH: 0.8 }, { sigma_ECH: 0.05 }, { sigma_ECH: 0.25 }, { gas_exponent: 2 }, { gas_exponent: 8 }, { jshape_gamma: 0 }, { jshape_gamma: 2 }];
  for (const e of endpoints) { const r = resolveProfiles(profileOptions(e)); runs.push({ inputs: { validEndpoint: e }, measurements: [meas('resolved (1 = yes) shortfall', r === undefined ? 1 : 0, 0)] }); }
  assert.deepEqual({ ...resolveProfiles(PROFILES_DEFAULTS) }, { ...resolveProfiles(profileOptions()) });
  // Profiles on: passenger (AC-2), modelVersion 0.2.0, schemaVersion 1, only the profiles key added.
  for (const { c: cc, chi } of PARITY_CASES) {
    const g2 = geometry(cc), off = runShot(cc, g2, 0.002);
    let on; try { on = runShot(cc, g2, 0.002, undefined, undefined, profileOptions({ chi_e: chi, chi_i: chi })); } catch (e) { assert.match(e.message, /^profile constraint violated/); runs.push({ inputs: { passenger: label({ c: cc, chi }), status: 'threw (listed for FAILSAFE)' }, measurements: [meas('completed shortfall not judged', 0, 0)] }); continue; }
    const rest = Object.fromEntries(ORIGINAL.filter(k => k !== 'modelVersion').map(k => [k, on[k]])), refRest = Object.fromEntries(ORIGINAL.filter(k => k !== 'modelVersion').map(k => [k, off[k]])), d = deepIs(rest, refRest);
    assert.equal(on.modelVersion, '0.2.0'); assert.equal(on.schemaVersion, 1); assert.deepEqual(Object.keys(on), [...ORIGINAL, 'profiles']); assert.deepEqual(Object.keys(off), ORIGINAL);
    runs.push({ inputs: { passenger: label({ c: cc, chi }), N_rho: 64, dt: 0.002 }, measurements: [meas('original fields compared', d.compared, 1, { lower: true }), meas('differing original fields (AC-2)', d.differences, 0), meas('profile samples equal 0-D samples', on.profiles.samples.length - on.samples.length, 0)] });
  }
  const doc = writeEvidence('D2-VER-OFFPATH', 'd2-ver-offpath.json', runs, { note: 'Off-path identity, option validation and passenger identity. The requirement that all existing tests/ and python/tests/ pass unchanged is recorded in the implementer handoff (npm test, npm run pyengine:test), not in this file.' });
  assert.ok(doc.pass, 'D2-VER-OFFPATH failed: see tests/d2/evidence/d2-ver-offpath.json');
});

const status = (threw, steps) => threw ? { status: 'threw', error: threw.message, acceptedSteps: steps } : { status: 'completed', acceptedSteps: steps };

test('D2-VER-PARITY profile integrals equal the 0-D N, We, Wi every step', () => {
  const runs = [];
  for (const pc of PARITY_CASES) for (const N_rho of [32, 64, 128]) for (const dt of [0.004, 0.002, 0.001]) {
    const { par, shot, threw, steps } = traceRun(pc, N_rho, dt, false);
    if (!threw) assert.equal(shot.modelVersion, '0.2.0');
    runs.push({ inputs: { case: label(pc), controls: pc.c, chi_e: pc.chi, chi_i: pc.chi, D: 0.1, N_rho, dt, ...status(threw, steps) }, measurements: [meas('max relative parity |sum x dV - X_0D|/X_0D over N, We, Wi and all steps', par.max, 1e-9)], atMax: { step: par.step, quantity: par.quantity } });
  }
  const completed = runs.filter(r => r.inputs.status === 'completed').length;
  const doc = writeEvidence('D2-VER-PARITY', 'd2-ver-parity.json', runs, { runCount: runs.length, completedRuns: completed, threwRuns: runs.length - completed, note: 'Parity is algebraic; it verifies implementation consistency, not physical accuracy. Threw runs are checked over accepted steps and listed for D2-VER-FAILSAFE.' });
  assert.equal(runs.length, 63); assert.ok(completed > 0);
  assert.ok(doc.pass, `D2-VER-PARITY max ratio ${Math.max(...runs.map(r => r.measurements[0].ratio))}`);
});

test('D2-VER-LEDGER independent cell-resolved oracle closes every ledger and rejects the three AC-4 perturbation families', () => {
  const runs = [], tol = 1e-10;
  for (const pc of PARITY_CASES) for (const N_rho of [32, 64, 128]) for (const dt of [0.004, 0.002, 0.001]) {
    const { led, scan, threw, steps } = traceRun(pc, N_rho, dt, true);
    const m = [];
    for (const sp of ['n', 'we', 'wi']) m.push(meas(`max normalised cell residual ${sp}`, led.resid[sp], tol), meas(`total closure ${sp}`, led.total[sp], tol), meas(`delivered vs prescribed edge flux ${sp}`, led.edgeDelivered[sp], 1e-12), meas(`prescribed edge flux vs oracle N/tauP or W/tauE ${sp}`, led.edgeWiring[sp], 1e-12));
    m.push(meas('shape normalisation |sum h dV - 1| (oracle)', led.shapeOracle, 1e-13), meas('shape normalisation |sum h dV - 1| (production)', led.shapeProduction, 1e-13), meas('steps with a non-zero reported axis flux, Object.is(flux, 0) (AC-7a)', scan.axisNonzeroSteps, 0));
    runs.push({ inputs: { case: label(pc), controls: pc.c, chi_e: pc.chi, chi_i: pc.chi, D: 0.1, N_rho, dt, ...status(threw, steps) }, measurements: m });
  }
  // Anti-tautology (mutation) procedure, DEFAULT trace, N_rho = 64, dt = 0.002, all at step 750 (t = 1.5 s).
  const o = profileOptions(), keep = {}; observedProfileRun(DEFAULT, 0.002, o, (rec, obs) => { if (obs.step === 750) { keep.rec = rec; keep.obs = obs; } });
  const { rec, obs } = keep, N = rec.N_rho, dvOf = i => dVcell(i, N, obs.volume);
  const clean = stepResiduals(DEFAULT, o, rec, obs);
  const copy = () => ({ ...rec, post: { n: rec.post.n.slice(), we: rec.post.we.slice(), wi: rec.post.wi.slice() } });
  const mutants = [];
  { const m = copy(); m.post.n[31] += 1e-6 * obs.postN / dvOf(32); mutants.push(['(a) +1e-6 N added to density cell 32', 'n', m, {}, 'state']); }
  { const m = copy(), d = 1e-6 * obs.postWe; m.post.we[9] -= d / dvOf(10); m.post.we[49] += d / dvOf(50); mutants.push(['(b) 1e-6 We moved w_e cell 10 -> w_e cell 50', 'we', m, {}, 'state']); }
  { const m = copy(), d = 1e-6 * obs.postWe; m.post.we[9] -= d / dvOf(10); m.post.wi[9] += d / dvOf(10); mutants.push(['(b) 1e-6 We moved w_e cell 10 -> w_i cell 10', 'we', m, {}, 'state']); }
  const shapeSpecies = { nbi: 'n', ech: 'we', gas: 'n', br: 'we', ohm: 'we' };
  for (const k of Object.keys(shapeSpecies)) mutants.push([`(c) ${k} shape x (1+1e-6)`, shapeSpecies[k], copy(), { [k]: 1 + 1e-6 }, 'shape']);
  const cleanMax = Math.max(...['n', 'we', 'wi'].map(sp => clean.resid[sp])), mutRuns = [];
  // DD-16/DD-20 rejection bounds: state perturbations (a),(b) >= 1e-8; shape perturbations (c) >= max(1e-10, 100 x r_clean), r_clean = clean max residual at step 750.
  for (const [name, sp, m, scale, family] of mutants) {
    const r = stepResiduals(DEFAULT, o, m, obs, scale), worst = Math.max(...['n', 'we', 'wi'].map(s => r.resid[s])), bound = family === 'state' ? 1e-8 : Math.max(1e-10, 100 * cleanMax);
    mutRuns.push({ inputs: { mutation: name, family, step: 750, t: 1.5, N_rho: 64, dt: 0.002, cleanMaxResidualAtStep: cleanMax, bound: family === 'state' ? '1e-8' : 'max(1e-10, 100 x cleanMaxResidualAtStep)' }, measurements: [meas(`max normalised residual (must be >= bound ${bound})`, worst, bound, { lower: true })], residualByspecies: r.resid });
  }
  assert.equal(mutants.length, 8);
  const doc = writeEvidence('D2-VER-LEDGER', 'd2-ver-ledger.json', [...runs, ...mutRuns], { runCount: runs.length, mutationCount: mutRuns.length, note: 'Ratio for the mutation quantities is residual/bound (>= 1 rejects the perturbation); bounds per DD-16/DD-20. The oracle restates the 0.1.0 and s6 formulas; it never imports production rates or shapes.' });
  assert.ok(doc.pass, 'D2-VER-LEDGER failed: see tests/d2/evidence/d2-ver-ledger.json');
});

test('D2-VER-FAILSAFE explicit fixed-grammar constraint stop, never clipped: (i) all-zero controls, (ii) kernel sources, (iii) 138-run sweep', () => {
  const runs = [], grammar = /^profile constraint violated at t=\d+\.\d{6} s in cell \d+: (n|T_e|T_i) (<= 0|nonfinite)$/;
  { // (i) all-zero auxiliary controls at default coefficients
    const trace = []; const on = observedProfileRun(allZero, 0.002, profileOptions(), (rec, obs) => trace.push(obs.step));
    assert.ok(on.threw, 'profile-on all-zero run must throw'); const msg = on.threw.message, m = msg.match(grammar);
    assert.ok(m, msg); assert.ok(!/left its valid thermal-plasma regime/.test(msg));
    const t = Number(msg.match(/t=(\d+\.\d{6})/)[1]), cell = Number(msg.match(/cell (\d+)/)[1]);
    const off = runShot(allZero, geometry(allZero), 0.002);
    runs.push({ inputs: { part: '(i)', controls: allZero, chi_e: 3, chi_i: 3, N_rho: 64, dt: 0.002, error: msg, profileOff: 'completed' }, measurements: [
      meas('cell index in [1,64] (distance outside range)', Math.max(0, 1 - cell, cell - 64), 0), meas('reported failure time t [s] (reported, not asserted)', t, 5), meas('accepted observer steps minus t/dt (no partial step)', Math.abs(on.steps - Math.round(t / 0.002)), 0),
      meas('grammar match (0 = matches)', 0, 0), meas('profile-off completed sample count', off.samples.length, 1, { lower: true })] });
    assert.equal(trace.length, on.steps);
  }
  const N = 16, cell10 = v => Array.from({ length: N }, (_, i) => i === 9 ? v : 0), ones = new Array(N).fill(1);
  for (const [part, sources, expectQ, expectR] of [['(ii-a) S_e = -1e3 in cell 10', { we: cell10(-1e3) }, 'T_e', '<= 0'], ['(ii-b) S_n = -1e3 in cell 10', { n: cell10(-1e3) }, 'n', '<= 0'], ['(ii-c) S_e = NaN in cell 10', { we: cell10(NaN) }, 'T_e', 'nonfinite']]) {
    const trace = []; let err;
    try { runProfileKernel({ N_rho: N, V: 1, L2: 1, D: 0, chi_e: 0, chi_i: 0, dt: 0.1, steps: 5, energyConst: 1, n0: ones, we0: ones, wi0: ones, sources, edge: { type: 'flux', value: 0 }, observer: rec => trace.push(rec.step) }); } catch (e) { err = e; }
    assert.ok(err, `${part} must throw`); assert.match(err.message, grammar);
    const cell = Number(err.message.match(/cell (\d+)/)[1]), t = Number(err.message.match(/t=(\d+\.\d{6})/)[1]);
    assert.equal(err.message, `profile constraint violated at t=0.000000 s in cell 10: ${expectQ} ${expectR}`);
    runs.push({ inputs: { part, N_rho: N, dt: 0.1, D: 0, chi_e: 0, chi_i: 0, initial: 'n = w_e = w_i = 1 (normalised)', edge: 'zero flux', error: err.message }, measurements: [meas('|cell - 10|', Math.abs(cell - 10), 0), meas('|t - 0| (first step)', Math.abs(t), 0), meas('observer calls (no accepted step, nothing clipped)', trace.length, 0)] });
  }
  // (iii) TypeScript sweep driver: DEFAULT + nine-case C1 grid + 128 LIMITS corners, N_rho = 64, dt = 0.002, default coefficients.
  const sweepRuns = [], sweepList = [], cases = sweepCases();
  assert.equal(cases.length, 138);
  for (const sc of cases) {
    const r = runSweepCase(sc); sweepList.push(r);
    if (r.status === 'completed') sweepRuns.push({ inputs: { id: r.id, group: r.group, controls: r.controls, N_rho: SWEEP.N_rho, dt: SWEEP.dt, chi_e: SWEEP.chi, chi_i: SWEEP.chi, D: 0.1, status: 'completed', acceptedSteps: r.acceptedSteps, minN: r.minN, minTe: r.minTe, minTi: r.minTi, profilesModelVersion: r.profilesModelVersion }, measurements: [
      meas('max relative parity (completion)', r.parityMax, 1e-9), meas('max normalised ledger cell residual (completion)', r.ledgerCellMax, 1e-10), meas('max species total closure (completion)', r.ledgerTotalMax, 1e-10), meas('delivered vs prescribed edge flux (completion)', r.edgeDeliveredMax, 1e-12),
      meas('nonfinite cell values (silent violation)', r.nonfinite, 0), meas('non-positive cell values (silent violation)', r.nonpositive, 0), meas('steps with non-zero axis flux', r.axisNonzeroSteps, 0), meas('original Shot fields differing from the profile-off run (AC-2)', r.passengerDifferences, 0)] });
    else sweepRuns.push({ inputs: { id: r.id, group: r.group, controls: r.controls, N_rho: SWEEP.N_rho, dt: SWEEP.dt, chi_e: SWEEP.chi, chi_i: SWEEP.chi, D: 0.1, status: 'threw', kind: r.kind, error: r.error, t: r.t, cell: r.cell, quantity: r.quantity, acceptedSteps: r.acceptedSteps }, measurements: [
      meas('errors that are not the fixed-grammar constraint error', r.unexpected || r.kind !== 'profile constraint' ? 1 : 0, 0), meas('cell index in [1,64] (distance outside range)', r.cell === null ? 1 : Math.max(0, 1 - r.cell, r.cell - 64), 0), meas('failure time t [s] (reported, not asserted)', r.t ?? 0, 5), meas('parity over the accepted steps before the throw', r.parityMaxAcceptedSteps ?? 0, 1e-9)] });
  }
  const completed = sweepList.filter(r => r.status === 'completed'), threw = sweepList.filter(r => r.status === 'threw');
  assert.equal(sweepRuns.length, 138); assert.equal(sweepList[0].id, 'DEFAULT'); assert.equal(sweepList[0].status, 'completed', 'DEFAULT must complete at default coefficients');
  assert.ok(sweepList.every(r => !r.unexpected));
  const doc = writeEvidence('D2-VER-FAILSAFE', 'd2-ver-failsafe.json', sweepRuns, {
    complete: true, partsImplemented: ['(i)', '(ii-a)', '(ii-b)', '(ii-c)', '(iii)'], sweep: { runCount: sweepRuns.length, expected: 138, completedCount: completed.length, threwCount: threw.length, silentViolations: sweepList.filter(r => r.status === 'completed' && (r.nonfinite || r.nonpositive || r.passengerDifferences || r.axisNonzeroSteps || r.parityMax > 1e-9 || r.ledgerCellMax > 1e-10)).length, threwControlSets: threw.map(r => ({ id: r.id, group: r.group, error: r.error, t: r.t, cell: r.cell, quantity: r.quantity })), groups: { 'default': 1, 'C1-grid': 9, 'LIMITS-corner': 128 } },
    groups: { partsIandII: runs }, note: 'runs = the 138 sweep runs of part (iii); partsIandII holds parts (i) and (ii). Top-level pass = every run of both. Times of failure are reported, not asserted.' });
  assert.ok(doc.pass, 'D2-VER-FAILSAFE failed: see tests/d2/evidence/d2-ver-failsafe.json');
});

// ===============================================================================================================
// PART B: analytic fixtures (F1-F4), convergence, diagnostics. Normalised units unless stated (verification s1).
// ===============================================================================================================
// Long runs start now, in worker threads, so they overlap the serial checks above; each check awaits its own results.
const jobKey = j => `${j.kind}|${j.id}|${j.N}|${j.dt}`;
const heavyJobs = [{ kind: 'observed', id: 'F3', N: 256, dt: 1e-6, t: 1 }, { kind: 'uniform', id: 'F3-uniform', N: 256, dt: 1e-6, t: 1 }, { kind: 'observed', id: 'F2', N: 256, dt: 2e-6, t: 1 }, { kind: 'observed', id: 'F4', N: 128, dt: 1e-5, t: 1 }];
{
  const seen = new Set(['F4|128|0.00001']);
  const add = (id, N, dt) => { const k = `${id}|${N}|${dt}`; if (!seen.has(k)) { seen.add(k); heavyJobs.push({ kind: 'field', id, N, dt, t: 1 }); } };
  for (const id of ['F2', 'F3', 'F4']) { for (const N of spatialRateInputs.Ns) for (const dt of [spatialRateInputs.dt, spatialRateInputs.dt / 2]) add(id, N, dt); for (const dt of temporalDts.slice(0, 2)) add(id, temporalN[id], dt); }
  const cost = j => j.N * (j.t / j.dt); heavyJobs.sort((x, y) => cost(y) - cost(x));
}
const heavy = runJobs(heavyJobs).then(out => new Map(heavyJobs.map((j, i) => [jobKey(j), out[i]])));
heavy.catch(() => {}); // surfaced by the checks that await it
const ac7Rows = (r, { dmp = true } = {}) => [meas('steps with a non-zero reported axis flux, Object.is(flux, 0) (AC-7a)', r.axisNonzeroSteps, 0), meas('delivered vs prescribed edge flux / max(|prescribed|, flux scale) (AC-7b)', r.edgeFluxRelMax, 1e-12), ...(dmp ? [meas('discrete maximum principle excess over M, bounds include the Dirichlet edge value (AC-7d, DD-21)', r.dmpExcessOverM, 0)] : [])];
const stepsOf = (t, dt) => Math.round(t / dt);

test('D2-VER-STEADY F1 steady state (normalised, SI density, SI electron energy) at N_rho = 16, 64, 256', () => {
  const runs = [], cap = 2000, KC = 1.5 * KEV, V = 23.11, L2 = V / (2 * Math.PI ** 2 * R0);
  const fill = (N, v) => new Float64Array(N).fill(v);
  for (const N of [16, 64, 256]) for (const kind of ['a', 'b', 'c']) {
    const tracked = kind === 'c' ? 'we' : 'n', si = kind !== 'a', Vc = si ? V : 1, L2c = si ? L2 : 1;
    const D = kind === 'a' ? 1 : 0.1, chi = 3, S = kind === 'a' ? 1 : 1e19, Se = 1e5, n_fr = 3e19;
    const amplitude = kind === 'c' ? Se * L2c / (4 * KC * n_fr * chi) : S * L2c / (4 * D), dt = kind === 'c' ? 0.05 * L2c / chi : 0.05 * L2c / D;
    const ac = makeAc7({ species: tracked, N, V: Vc, L2: L2c, coef: kind === 'c' ? chi : D, kc: kind === 'c' ? KC : 1, u0: fill(N, 1), dirichlet: 0 });
    let reached = -1, change = NaN, field;
    const spec = { N_rho: N, V: Vc, L2: L2c, dt, steps: cap, edge: { n: { type: kind === 'c' ? 'flux' : 'dirichlet', value: 0 }, we: { type: kind === 'c' ? 'dirichlet' : 'flux', value: 0 }, wi: { type: 'flux', value: 0 } }, observer: rec => {
      ac.observe(rec); if (reached >= 0) return;
      const x = rec.post[tracked], p = rec.pre[tracked]; let d = 0; for (let i = 0; i < N; i++) d = Math.max(d, Math.abs(x[i] - p[i]) / Math.abs(x[i]));
      change = d; if (d <= 1e-14) { reached = rec.step + 1; field = Float64Array.from(x, (w, i) => kind === 'c' ? w / (rec.post.n[i] * KC) : w); }
    } };
    if (kind === 'c') runProfileKernel({ ...spec, D: 0, chi_e: chi, chi_i: 0, energyConst: KC, n0: fill(N, n_fr), we0: fill(N, 0), wi0: fill(N, n_fr * KC), freezeN: true, sources: { we: fill(N, Se) } });
    else runProfileKernel({ ...spec, D, chi_e: 0, chi_i: 0, energyConst: kind === 'b' ? KC : 1, n0: fill(N, 0), we0: fill(N, 1), wi0: fill(N, 1), sources: { n: fill(N, S) } });
    assert.ok(reached > 0, `march ${kind} N=${N} did not reach the 1e-14 stopping rule within ${cap} steps (last change ${change})`);
    const shape = f1Shape(N), expected = Float64Array.from(shape, s => amplitude * s), err = l2rel(field, expected), r = ac.result(), name = { a: 'a normalised', b: 'b SI density', c: 'c SI electron energy' }[kind];
    runs.push({ inputs: { case: name, N_rho: N, V: Vc, L2: L2c, D: kind === 'c' ? 0 : D, chi_e: kind === 'c' ? chi : 0, dt, cap, edge: 'zero-Dirichlet', closedForm: 'centre amplitude S L^2/(4D) (1 - (rho_{i-1}^2+rho_i^2)/2)', amplitude }, measurements: [
      meas('L2rel vs closed-form cell averages', err, 1e-6), meas('steps to the 1e-14 stopping rule (cap 2000)', reached, cap), meas('final max relative cell change (stopping rule)', change, 1e-14),
      meas('steps with a non-zero reported axis flux, Object.is(flux, 0)', r.axisNonzeroSteps, 0), meas('delivered vs prescribed edge flux / flux scale (AC-7b)', r.edgeFluxRelMax, 1e-12), meas('negative-value excess (no new negative values, AC-7d for a non-negative source-driven march)', Math.max(0, -r.minSeen) / amplitude, 1e-14)], reported: { firstCellValue: field[0], analyticCentreValue: amplitude, dtRule: kind === 'a' ? '0.05' : kind === 'b' ? '0.05 L^2/D' : '0.05 L^2/chi_e', discriminationNote: 'a linear half-cell closure gives about 2e-4 (inherited prototype); the check rejects it' } });
  }
  // AC-7(d) on the diffusion-only F1 fixture: the steady shape decays under the same operator with no source; values must stay inside the
  // discrete-maximum-principle bounds (the source-driven marches above start from 0 and rise, so the diffusion-only companion carries DD-21).
  for (const N of [16, 64, 256]) {
    const n0 = Float64Array.from(f1Shape(N), s => 0.25 * s), ac = makeAc7({ species: 'n', N, V: 1, L2: 1, coef: 1, kc: 1, u0: n0, dirichlet: 0 }), ones = fill(N, 1);
    runProfileKernel({ N_rho: N, V: 1, L2: 1, D: 1, chi_e: 0, chi_i: 0, dt: 0.05, steps: 100, energyConst: 1, n0, we0: ones, wi0: ones, edge: { n: { type: 'dirichlet', value: 0 }, we: { type: 'flux', value: 0 }, wi: { type: 'flux', value: 0 } }, observer: rec => ac.observe(rec) });
    const r = ac.result();
    runs.push({ inputs: { case: 'diffusion-only companion (a): steady shape decays, no source', N_rho: N, dt: 0.05, steps: 100, edge: 'zero-Dirichlet' }, measurements: ac7Rows(r), reported: { literalDmpExcessOverM: r.dmpLiteralExcessOverM, bounds: r.dmpBounds, minSeen: r.minSeen, maxSeen: r.maxSeen } });
  }
  const doc = writeEvidence('D2-VER-STEADY', 'd2-ver-steady.json', runs, { note: 'Nine steady runs (3 cases x 3 grids) plus three diffusion-only DMP companions. Analytic comparison against cell averages. The DD-21 bounds include the Dirichlet edge value (the literal [min u(0), max u(0)] interval excludes it and a decaying Dirichlet mode leaves it); the literal excess is reported.' });
  assert.equal(runs.length, 12); assert.ok(doc.pass, 'D2-VER-STEADY failed: see tests/d2/evidence/d2-ver-steady.json');
});

test('D2-VER-EIGEN-DIRICHLET F2 at t = 1, N_rho = 256, dt = 2e-6', async () => {
  const res = (await heavy).get(jobKey({ kind: 'observed', id: 'F2', N: 256, dt: 2e-6 })), N = 256, t = 1, u = res.u, ex = fixtureExact('F2', N, t), err = l2rel(u, ex);
  assert.equal(res.ac7.steps, 500000);
  const point = (u[127] + u[128]) / 2, exactPoint = J0(a1 / 2) * Math.exp(-a1 * a1);
  const runs = [{ inputs: { fixture: 'F2 J0(a1 rho) exp(-a1^2 D t/L^2), zero-Dirichlet, n frozen = 1', N_rho: N, t, dt: 2e-6, steps: res.ac7.steps, a1, amplitudeAtT1: Math.exp(-a1 * a1), wallSeconds: res.seconds }, measurements: [
    meas('L2rel vs cell averages of J0(a1 rho) exp(-a1^2)', err, 1e-4), meas('|J0(a1)| by the test series', Math.abs(J0(a1)), 1e-15), ...ac7Rows(res.ac7)],
    reported: { pointValueAtRho0p5LinearInterpolation: point, analyticPointValue: exactPoint, pointRelativeDifference: Math.abs(point - exactPoint) / exactPoint, literalDmpExcessOverM: res.ac7.dmpLiteralExcessOverM, dmpBounds: res.ac7.dmpBounds, minSeen: res.ac7.minSeen, maxSeen: res.ac7.maxSeen, convergenceRatesIn: 'd2-ver-refinement.json' } }];
  const doc = writeEvidence('D2-VER-EIGEN-DIRICHLET', 'd2-ver-eigen-dirichlet.json', runs, { note: 'A failure here is a defect or a mis-stated fixture, not a reason to loosen (DD-6 rationale). DD-21 discrete maximum principle: for this non-negative mode the bounds reduce to [0, max u(0)] once the zero Dirichlet edge value is included.' });
  assert.ok(doc.pass, `D2-VER-EIGEN-DIRICHLET failed: L2rel ${err}`);
});

test('D2-VER-EIGEN-REFLECT F3 at t = 1, N_rho = 256, dt = 1e-6, with the mandatory 20% rate report (never roundoff-exempt)', async () => {
  const H = await heavy, res = H.get(jobKey({ kind: 'observed', id: 'F3', N: 256, dt: 1e-6 })), uni = H.get(jobKey({ kind: 'uniform', id: 'F3-uniform', N: 256, dt: 1e-6 })), N = 256;
  assert.equal(res.ac7.steps, 1000000);
  const err = l2rel(res.u, fixtureExact('F3', N, 1)), sp = spatialRates('F3'), tp = temporalRates('F3'), rateRows = [];
  for (const r of sp.rates) rateRows.push({ inputs: { rate: 'spatial', from_N_rho: r.N, to_N_rho: r.to, e_N: r.e, e_2N: r.e2, dt: 1e-5, procedure: 'L2rel(2 u_{dt/2} - u_dt, exact)', bandTheory: 2 }, measurements: band(`p_x(${r.N}->${r.to})`, r.p, 1.6, 2.4), reported: { p: r.p } });
  for (const r of tp.rates) rateRows.push({ inputs: { rate: 'temporal', pair: r.pair, N_rho: tp.N, d_k: r.d, d_k1: r.d2, bandTheory: 1 }, measurements: band(`p_t(${r.pair})`, r.p, 0.8, 1.2), reported: { p: r.p } });
  assert.equal(rateRows.length, 5);
  const runs = [{ inputs: { fixture: 'F3 J0(b1 rho) exp(-b1^2 D t/L^2), zero-flux edge, n frozen = 1', N_rho: N, t: 1, dt: 1e-6, steps: res.ac7.steps, b1, amplitudeAtT1: Math.exp(-b1 * b1), wallSeconds: res.seconds }, measurements: [
    meas('L2rel vs cell averages of J0(b1 rho) exp(-b1^2)', err, 1e-3), meas('|J1(b1)| by the test series', Math.abs(J1(b1)), 1e-15), meas('prescribed edge flux max |flux| (identically 0)', res.ac7.prescribedEdgeFluxAbsMax, 0), ...ac7Rows(res.ac7)],
    reported: { literalDmpExcessOverM: res.ac7.dmpLiteralExcessOverM, dmpBounds: res.ac7.dmpBounds, minSeen: res.ac7.minSeen, maxSeen: res.ac7.maxSeen, constraintCheckDisabled: 'enforceConstraint:false, J0(b1 rho) is negative for rho > 0.63 (DD-21)' } },
  { inputs: { fixture: 'uniform mode u = 1, zero-flux edge, n frozen = 1', N_rho: N, t: 1, dt: 1e-6 }, measurements: [meas('max relative drift of sum u dV over all steps', uni.totalRelDrift, 1e-12), meas('prescribed edge flux max |flux| (identically 0)', uni.prescribedEdgeFluxAbsMax, 0)], reported: { maxDeviationFromUniform: uni.maxDeviationFromUniform, deliveredEdgeFluxAbsMax: uni.deliveredEdgeFluxAbsMax, note: 'delivered flux is the cell-balance residual, roundoff eps dV/dt; there is no flux scale for a uniform field' } },
  ...rateRows];
  const doc = writeEvidence('D2-VER-EIGEN-REFLECT', 'd2-ver-eigen-reflect.json', runs, { rateReport: { spatial: sp.rates.map(r => r.p), temporal: tp.rates.map(r => r.p), bands: { spatial: [1.6, 2.4], temporal: [0.8, 1.2] }, theory: { spatial: 2, temporal: 1 } }, note: 'Pass needs every condition; no condition compensates another; a missing rate or one outside its 20% band fails even if L2rel <= 1e-3 (DD-6). The uniform-mode edge condition is the prescribed zero flux; the delivered value is reported.' });
  assert.ok(doc.pass, `D2-VER-EIGEN-REFLECT failed: L2rel ${err}, p_x ${sp.rates.map(r => r.p)}, p_t ${tp.rates.map(r => r.p)}`);
});

test('D2-VER-MMS-CONDUCTION F4 manufactured conduction with frozen non-uniform n', async () => {
  const res = (await heavy).get(jobKey({ kind: 'observed', id: 'F4', N: 128, dt: 1e-5 })), N = 128, err = l2rel(res.u, fixtureExact('F4', N, 1));
  assert.equal(res.ac7.steps, 100000);
  const srcRes = f4SourceResidual();
  const runs = [{ inputs: { fixture: 'F4 n = 3/2 - rho^2/2, T = e^-t (1-rho^2)(1+rho^2/2), w = nT, S_e manufactured (left-endpoint cell averages), zero-Dirichlet T', N_rho: N, t: 1, dt: 1e-5, steps: res.ac7.steps, wallSeconds: res.seconds }, measurements: [
    meas('L2rel on w = nT vs cell averages at t = 1', err, 1e-4), meas('steps with a non-zero reported axis flux, Object.is(flux, 0) (AC-7a)', res.ac7.axisNonzeroSteps, 0), meas('delivered vs prescribed edge flux / flux scale (AC-7b)', res.ac7.edgeFluxRelMax, 1e-12)],
    reported: { sourceResidualFiniteDifferenceMax: srcRes, sourceResidualPoints: 'rho in {0.05,0.2,0.35,0.5,0.65,0.8,0.95}, t = 0.7', convergenceRatesIn: 'd2-ver-refinement.json' } }];
  const doc = writeEvidence('D2-VER-MMS-CONDUCTION', 'd2-ver-mms-conduction.json', runs, { note: 'Recorded: measured L2rel and the finite-difference residual of the manufactured source (about 8e-8, truncation of the finite differences).' });
  assert.ok(doc.pass, `D2-VER-MMS-CONDUCTION failed: L2rel ${err}`);
});

test('D2-VER-REFINEMENT 31 rates: spatial and temporal on F2, F3, F4 and the DEFAULT shot', async () => {
  await heavy;
  const runs = [], EXEMPT = 1e-10, bandSp = [1.8, 2.2], bandTf = [0.85, 1.15], bandTs = [0.7, 1.3];
  let rates = 0;
  for (const id of ['F2', 'F3', 'F4']) {
    const sp = spatialRates(id), tp = temporalRates(id), never = id === 'F3';
    for (const r of sp.rates) { const ex = !never && r.e <= EXEMPT && r.e2 <= EXEMPT; rates++; runs.push({ inputs: { fixture: id, rate: 'spatial', from_N_rho: r.N, to_N_rho: r.to, e_N: r.e, e_2N: r.e2, dt: 1e-5, procedure: 'L2rel(2 u_{dt/2} - u_dt, exact); t = 1', theory: 2 }, measurements: band(`${id} p_x(${r.N}->${r.to})`, r.p, ...bandSp, ex), reported: { p: r.p } }); }
    for (const r of tp.rates) { const ex = !never && r.d <= EXEMPT && r.d2 <= EXEMPT; rates++; runs.push({ inputs: { fixture: id, rate: 'temporal', pair: r.pair, N_rho: tp.N, d_k: r.d, d_k1: r.d2, procedure: 'd_k = L2 norm of successive field differences / exact norm; t = 1', theory: 1 }, measurements: band(`${id} p_t(${r.pair})`, r.p, ...bandTf, ex), reported: { p: r.p } }); }
  }
  // DEFAULT shot, profile-on, N_rho = 64: first- and last-cell T_e at t = 0.5, 2, 3, 4.5 s for dt = 0.004, 0.002, 0.001, 0.0005.
  const dts = [0.004, 0.002, 0.001, 0.0005], times = [0.5, 2, 3, 4.5], N = 64, series = dts.map(dt => runShot(DEFAULT, geometry(DEFAULT), dt, undefined, undefined, profileOptions({ N_rho: N })));
  const at = (shot, t, cell) => { const k = shot.profiles.samples.findIndex(s => Math.abs(s.t - t) < 1e-9); assert.ok(k >= 0, `no sample at t = ${t}`); return shot.profiles.samples[k].te[cell === 'first' ? 0 : N - 1]; };
  for (const t of times) for (const cell of ['first', 'last']) {
    const x = series.map(s => at(s, t, cell)), d = [0, 1, 2].map(k => Math.abs(x[k] - x[k + 1]) / Math.abs(x[3]));
    for (const k of [0, 1]) { const p = Math.log2(d[k] / d[k + 1]), ex = d[k] <= EXEMPT && d[k + 1] <= EXEMPT; rates++; runs.push({ inputs: { fixture: 'DEFAULT shot profile-on', rate: 'temporal', quantity: `${cell}-cell T_e [keV] at t = ${t} s`, N_rho: N, dts, T_e_values: x, d_k: d[k], d_k1: d[k + 1], normalisation: '|x(dt_k) - x(dt_k+1)| / |x(0.0005)|', theory: 1 }, measurements: band(`DEFAULT ${cell} T_e t=${t} p_t(k=${k + 1})`, p, ...bandTs, ex), reported: { p } }); }
  }
  assert.equal(rates, 31);
  const doc = writeEvidence('D2-VER-REFINEMENT', 'd2-ver-refinement.json', runs, { rateCount: rates, bands: { spatial: bandSp, temporalFixtures: bandTf, temporalDefaultShot: bandTs }, note: 'Spatial: N_rho = 32..256, Richardson time-error removal at dt = 1e-5. Temporal fixtures: dt = 4e-5..5e-6 (N_rho 256 for F2/F3, 128 for F4). Default shot: dt = 0.004..0.0005, band widened for the step-function heating at 1 s and 4 s. F3 is never roundoff-exempt.' });
  assert.ok(doc.pass, 'D2-VER-REFINEMENT failed: see tests/d2/evidence/d2-ver-refinement.json');
});

test('D2-VER-DIAGNOSTICS A1-A6 (C_br, C_ohm anchors, edge-value rule, T_e,avg identity, independent recomputation = AC-8)', () => {
  const runs = [], V = 23.11, kc = 1.5 * KEV, ones = N => new Float64Array(N).fill(1), volW = (N, i) => V * (2 * i + 1) / (N * N);
  const feed = (N, n, te, jt, ti = ones(N)) => { let Ntot = 0, We = 0; for (let i = 0; i < N; i++) { Ntot += n[i] * volW(N, i); We += kc * n[i] * te[i] * volW(N, i); } return evaluateDiagnostics({ V, n, te, ti, jt, N: Ntot, We, kc }); };
  const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
  { // (A1)
    const N = 64, d = feed(N, new Float64Array(N).fill(3e19), ones(N), ones(N));
    runs.push({ inputs: { anchor: 'A1', N_rho: N, n: '3e19 m^-3 uniform', T_e: '1 keV uniform (above the 0.02 keV floor)', jt: 1 }, measurements: [meas('|C_br - 1|', Math.abs(d.cBr - 1), 1e-12), meas('|C_ohm - 1|', Math.abs(d.cOhm - 1), 1e-12)], reported: { cBr: d.cBr, cOhm: d.cOhm } });
  }
  // (A2), (A3): judged at N_rho = 256 (relative 2e-4) and by the error ratio err(64)/err(256) >= 4; N_rho = 64 is reported, not judged.
  const anchor = (name, inputs, expected, valueAt) => {
    const at = {}; for (const N of [256, 64]) { const v = valueAt(N); at[N] = { value: v, err: rel(v, expected) }; }
    runs.push({ inputs: { anchor: name, ...inputs, expected }, measurements: [meas('relative error at N_rho = 256', at[256].err, 2e-4), meas('error(N_rho = 64) / error(N_rho = 256) (>= 4; no band on the rate)', at[64].err / at[256].err, 4, { lower: true })], reported: { value256: at[256].value, value64: at[64].value, error64_notJudged: at[64].err, error256: at[256].err } });
  };
  const nU = N => new Float64Array(N).fill(3e19);
  anchor('A2 C_br', { n: '3e19 uniform', T_e: 'T0 (1 - rho^2) cell averages, T0 = 2 keV', V, formula: '2 sqrt(2)/3' }, 2 * Math.SQRT2 / 3, N => feed(N, nU(N), cellAvg(r => 2 * (1 - r * r), N), ones(N)).cBr);
  for (const gamma of [1, 2]) anchor(`A3 C_ohm gamma=${gamma}`, { n: '3e19 uniform', T_e: '1 keV uniform', jt: '(1 - rho^2)^gamma cell averages', formula: '(gamma+1)^2/(2 gamma+1)' }, (gamma + 1) ** 2 / (2 * gamma + 1), N => feed(N, nU(N), ones(N), cellAvg(r => (1 - r * r) ** gamma, N)).cOhm);
  let linearReport;
  { // (A4) edge-value rule
    const N = 64, hand = [[2, 1, 0.5, false], [1, 0.4, 0.1, false], [1, 0.2, 0, true]];
    for (const q of ['n', 'te', 'ti']) for (const [xm1, xn, want, clip] of hand) {
      const arr = ones(N).map(() => 1); arr[N - 2] = xm1; arr[N - 1] = xn;
      const nA = q === 'n' ? arr : ones(N), teA = q === 'te' ? arr : ones(N), tiA = q === 'ti' ? arr : ones(N), d = feed(N, nA, teA, ones(N), tiA), e = d.edge[q], rawWant = 1.5 * xn - 0.5 * xm1;
      runs.push({ inputs: { anchor: 'A4 hand case', quantity: q, x_Nm1: xm1, x_N: xn, expected: want, expectedRaw: rawWant, expectedClip: clip }, measurements: [meas('edge value error (absolute 1e-15 where the value is 0)', want === 0 ? Math.abs(e.value) : Math.abs(e.value - want) / Math.abs(want), want === 0 ? 1e-15 : 1e-12), meas('raw (unclipped) value relative error', Math.abs(e.raw - rawWant) / Math.abs(rawWant), 1e-12), meas('clip flag mismatch (exact)', e.clipped === clip ? 0 : 1, 0)], reported: { value: e.value, raw: e.raw, clipped: e.clipped } });
    }
    const analytic = 1 + -0.5 * 1, lin = {};
    for (const NN of [32, 64, 128]) {
      const x = cellAvg(r => 1 - 0.5 * r, NN), rule = Math.max(1.5 * x[NN - 1] - 0.5 * x[NN - 2], 0); lin[NN] = { rule, diff: Math.abs(rule - analytic) };
      for (const q of ['n', 'te', 'ti']) { const d = feed(NN, q === 'n' ? x : ones(NN), q === 'te' ? x : ones(NN), ones(NN), q === 'ti' ? x : ones(NN)); if (NN === 64) runs.push({ inputs: { anchor: 'A4 linear profile x = a + b rho, a = 1, b = -0.5', quantity: q, N_rho: NN }, measurements: [meas('edge value vs the rule max(1.5 x_N - 0.5 x_{N-1}, 0) on the injected averages', Math.abs(d.edge[q].value - rule) / rule, 1e-12)], reported: { value: d.edge[q].value, analyticEdge: analytic, differenceFromAnalytic: Math.abs(d.edge[q].value - analytic), } }); }
    }
    linearReport = { differencesFromAnalytic: { 32: lin[32].diff, 64: lin[64].diff, 128: lin[128].diff }, rates: [Math.log2(lin[32].diff / lin[64].diff), Math.log2(lin[64].diff / lin[128].diff)], expectedOrder: 2, estimate: 'b h^2 / 12 = 1e-5 at N_rho = 64' };
  }
  // (A5) and (A6): exports of PARITY-style runs and the DEFAULT shot (also AC-8 at t = 0.5, 2, 3, 4.5 s).
  const N = 64, dt = 0.002, wanted = [0.5, 2, 3, 4.5];
  for (const pc of [...variants.map(c => ({ c, chi: 3 })), { c: allZero, chi: 5 }]) {
    const got = [];
    observedProfileRun(pc.c, dt, profileOptions({ N_rho: N, chi_e: pc.chi, chi_i: pc.chi }), (rec, obs) => {
      const tPost = (obs.step + 1) * dt; if (!wanted.some(w => Math.abs(w - tPost) < 1e-9)) return;
      let num = 0, den = 0; for (let i = 0; i < N; i++) { const w = 2 * i + 1; num += rec.post.we[i] * w; den += rec.post.n[i] * w; } // n-weighted mean of T_e = w_e/(n kc): sum w_e dV / (kc sum n dV); dV_i is proportional to 2i+1
      got.push({ t: tPost, profileMean: num / (kc * den), zeroD: obs.postWe / (kc * obs.postN) });
    });
    for (const g of got) runs.push({ inputs: { anchor: 'A5 T_e,avg identity', case: label(pc), N_rho: N, dt, t: g.t }, measurements: [meas('relative |T_e,avg(0-D) - n-weighted profile mean|', Math.abs(g.profileMean - g.zeroD) / g.zeroD, 1e-9)], reported: { profileMean: g.profileMean, zeroD: g.zeroD } });
    assert.ok(got.length > 0);
  }
  {
    const shot = runShot(DEFAULT, geometry(DEFAULT), dt, undefined, undefined, profileOptions({ N_rho: N })), P = shot.profiles, gam = 1, eta = T => 2.8e-8 * Math.max(T, 0.02) ** -1.5, worst = { v: 0, q: '' };
    for (const t of wanted) {
      const k = P.samples.findIndex(s => Math.abs(s.t - t) < 1e-9), s = P.samples[k], z = shot.samples[k], Vv = shot.volume;
      const N0 = z.ne * 1e19 * Vv, We0 = z.we * 1e6, Wi0 = z.wi * 1e6, teAvg = We0 / (1.5 * N0 * KEV), dV = i => Vv * (2 * i + 1) / (N * N);
      let br = 0, j2 = 0, j1 = 0;
      for (let i = 0; i < N; i++) { const rc = (i + 0.5) / N, jt = (1 - rc * rc) ** gam, T = s.te[i]; br += (s.n[i] * 1e19) ** 2 * Math.sqrt(T) * dV(i); j2 += jt * jt * eta(T) * dV(i); j1 += jt * dV(i); }
      const edge = x => { const raw = 1.5 * x[N - 1] - 0.5 * x[N - 2]; return { v: Math.max(raw, 0), clip: raw < 0 }; };
      const ref = { cBr: br / (Vv * (N0 / Vv) ** 2 * Math.sqrt(teAvg)), cOhm: (j2 / Vv) / ((j1 / Vv) ** 2 * eta(teAvg)), 'n(1)': edge(s.n).v, 'T_e(1)': edge(s.te).v, 'T_i(1)': edge(s.ti).v, 'edge flux N/tauP': N0 / 1.6, 'edge flux We/tauE': We0 / z.tauE, 'edge flux Wi/tauE': Wi0 / z.tauE };
      const got = { cBr: s.cBr, cOhm: s.cOhm, 'n(1)': s.edge.n, 'T_e(1)': s.edge.te, 'T_i(1)': s.edge.ti, 'edge flux N/tauP': s.edgeFlux.n, 'edge flux We/tauE': s.edgeFlux.we, 'edge flux Wi/tauE': s.edgeFlux.wi };
      const ms = Object.keys(ref).map(q => { const e = ref[q] === 0 ? Math.abs(got[q]) : Math.abs(got[q] - ref[q]) / Math.abs(ref[q]); if (e > worst.v) Object.assign(worst, { v: e, q: `${q} at t = ${t}` }); return meas(`${q} vs independent recomputation (${ref[q] === 0 ? 'absolute 1e-15' : 'relative'})`, e, ref[q] === 0 ? 1e-15 : 1e-9); });
      ms.push(meas('clip flag mismatches (n, T_e, T_i; exact)', ['n', 'te', 'ti'].filter(q => edge(s[q]).clip !== s.edge.clipped[q]).length, 0));
      runs.push({ inputs: { anchor: 'A6 / AC-8', case: 'DEFAULT profile-on', N_rho: N, dt, t }, measurements: ms, reported: { reference: ref, production: got, clipped: s.edge.clipped } });
    }
    runs.push({ inputs: { anchor: 'A6 / AC-8 summary' }, measurements: [meas('maximum relative difference over all quantities and samples', worst.v, 1e-9)], reported: { at: worst.q } });
  }
  const doc = writeEvidence('D2-VER-DIAGNOSTICS', 'd2-ver-diagnostics.json', runs, { linearProfileReport: linearReport, note: 'A2/A3 at N_rho = 64 are reported (reported.error64_notJudged); judged: N_rho = 256 within 2e-4 and error ratio >= 4. The A4 linear-profile discretisation (difference from a + b, rate about 2) is reported in linearProfileReport, not judged. AC-8 is A6 at t = 0.5, 2, 3, 4.5 s with a test-only recomputation from the exported arrays.' });
  assert.ok(doc.pass, 'D2-VER-DIAGNOSTICS failed: see tests/d2/evidence/d2-ver-diagnostics.json');
});
