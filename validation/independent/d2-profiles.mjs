// Independent validation of TeamFlow unit d2-profiles, PART A (AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-9).
// Validation lane (claude-opus). Imports ONLY production entry points from physics/ (runShot, geometry, DEFAULT,
// LIMITS, the verification-only kernel entry, the step-observer hook, the diagnostics evaluator/edgeValue for the
// A1-A4 anchors). Nothing from tests/ is imported or reused: every oracle, formula, shape, cell average, Bessel
// function and comparison below is restated here from specs/proposals/d2-profiles.md s4, s6, s8, s9 and
// specs/proposals/d2-profiles-verification.md.
// Run: node --experimental-strip-types validation/independent/d2-profiles.mjs [all|ac1|sweep|fixtures|probe|ac5|rates|adv|assemble]
// PART B adds: DD-24 floored parity, DD-25 edge bound, AC-5 (ac5), AC-6 (rates), adversarial cases (adv).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runShot, geometry, DEFAULT, LIMITS } from '../../physics/engine.ts';
import { withProfileStepObserver, runProfileKernel, evaluateDiagnostics, edgeValue } from '../../physics/profiles.ts';

const root = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(root, 'validation/evidence/d2-profiles');
const CMD = 'node --experimental-strip-types validation/independent/d2-profiles.mjs';
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const writeOut = (name, obj) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2) + '\n'); };
const physicsHashes = () => Object.fromEntries(['physics/engine.ts', 'physics/profiles.ts'].map(p => [p, sha(fs.readFileSync(path.join(root, p)))]));
const header = checkId => ({ checkId, validationModel: 'claude-opus', role: 'validation', physicsModelVersion: '0.2.0', verificationVersion: '0.3.0', node: process.version, physicsSha256: physicsHashes(), harness: 'validation/independent/d2-profiles.mjs', harnessSha256: sha(fs.readFileSync(import.meta.filename)), generated: new Date().toISOString() });

// ---------------------------------------------------------------------------------------------------------------
// Restated constants and 0-D formulas (engine.ts 0.1.0 as specified; not imported)
// ---------------------------------------------------------------------------------------------------------------
const KEV = 1.602176634e-16, R0 = 1.66, KC = 1.5 * KEV;
const PDEF = Object.freeze({ enabled: true, N_rho: 64, D: 0.1, chi_e: 3.0, chi_i: 3.0, rho_NBI: 0.5, sigma_NBI: 0.2, rho_ECH: 0.3, sigma_ECH: 0.1, gas_exponent: 4, jshape_gamma: 1.0 });
const REGEX = /^profile constraint violated at t=\d+\.\d{6} s in cell \d+: (n|T_e|T_i) (<= 0|nonfinite)$/;
function wave(c, t) { const ip = t < 1 ? 0.4 + (c.ip - 0.4) * t : t > 4 ? c.ip + (0.4 - c.ip) * (t - 4) : c.ip; const on = t >= 1 && t < 4 ? 1 : 0; return { ip, nbi: c.nbi * on, ech: c.ech * on }; }
const etaOf = T => 2.8e-8 * Math.pow(Math.max(T, 0.02), -1.5);
function zeroD(c, V, N, We, Wi, t) {
  const w = wave(c, t), ne = N / V, te = We / (1.5 * N * KEV);
  const tauE = 0.12 * Math.pow(w.ip / 1.2, 0.7) * Math.pow(c.bt / 2, 0.2) * Math.pow(Math.max(ne, 1e18) / 4e19, 0.2) * Math.pow(Math.max(w.nbi + w.ech, 0.5) / 5, -0.35);
  const tauP = 1.6, pOhm = etaOf(te) * Math.pow(2 * Math.PI * R0, 2) / V * Math.pow(w.ip * 1e6, 2), pRad = 1.69e-38 * ne * ne * Math.sqrt(te * 1000) * V;
  const gas = 0.3 * c.gas * 1e21, beam = 0.8 * w.nbi * 1e6 / (80 * KEV), pIon = 0.0136 * KEV * gas;
  return { tauE, tauP, pOhm, pRad, gas, beam, pIon, pNe: 0.8 * 0.35 * w.nbi * 1e6, pNi: 0.8 * 0.65 * w.nbi * 1e6, pEch: 0.9 * w.ech * 1e6, edge: { n: N / tauP, we: We / tauE, wi: Wi / tauE } };
}

// ---------------------------------------------------------------------------------------------------------------
// Own cell-resolved oracle (spec s4, s6, s8; verification D2-VER-LEDGER)
// ---------------------------------------------------------------------------------------------------------------
function makeOracle(c, P, V) {
  const N = P.N_rho, L2 = V / (2 * Math.PI * Math.PI * R0), dV = new Float64Array(N), rc = new Float64Array(N);
  for (let i = 1; i <= N; i++) { dV[i - 1] = V * (2 * i - 1) / (N * N); rc[i - 1] = (i - 0.5) / N; }
  const norm = g => { let s = 0; for (let i = 0; i < N; i++) s += g[i] * dV[i]; const h = g.map(x => x / s); return h; };
  const gaussShape = (mu, sg) => norm(Float64Array.from(rc, r => Math.exp(-Math.pow((r - mu) / sg, 2))));
  const hN = gaussShape(P.rho_NBI, P.sigma_NBI), hE = gaussShape(P.rho_ECH, P.sigma_ECH), hG = norm(Float64Array.from(rc, r => Math.pow(r, P.gas_exponent)));
  const jt = Float64Array.from(rc, r => Math.pow(1 - r * r, P.jshape_gamma));
  const integ = h => { let s = 0; for (let i = 0; i < N; i++) s += h[i] * dV[i]; return s; };
  const ownNorm = { nbi: integ(hN), ech: integ(hE), gas: integ(hG) };
  // One step: pre (x^k), post (x^{k+1}) cell arrays; z = 0-D pre-step rates; returns residuals etc.
  function step(pre, post, z, dt, mut = {}) {
    const sc = k => (mut.shape === k ? 1 + 1e-6 : 1);
    const teK = new Float64Array(N), gBr = new Float64Array(N), gOhm = new Float64Array(N);
    for (let i = 0; i < N; i++) { teK[i] = pre.we[i] / (KC * pre.n[i]); gBr[i] = pre.n[i] * pre.n[i] * Math.sqrt(teK[i]); gOhm[i] = jt[i] * jt[i] * etaOf(teK[i]); }
    const hB = norm(gBr), hO = norm(gOhm);
    const brNorm = integ(hB), ohmNorm = integ(hO);
    const contrib = { n: [], we: [], wi: [] }; // per cell arrays of per-volume contributions
    for (let i = 0; i < N; i++) {
      const ex = (pre.we[i] - pre.wi[i]) / 0.25;
      contrib.n.push([z.gas * hG[i] * sc('gas'), z.beam * hN[i] * sc('nbi')]);
      contrib.we.push([z.pNe * hN[i] * sc('nbi'), z.pEch * hE[i] * sc('ech'), z.pOhm * hO[i] * sc('ohm'), -z.pRad * hB[i] * sc('br'), -z.pIon * hG[i] * sc('gas'), -ex]);
      contrib.wi.push([z.pNi * hN[i] * sc('nbi'), ex]);
    }
    const out = { res: {}, total: {}, delivered: {}, prescribed: z.edge, worstCell: {}, fluxScale: {} };
    const Tpost = { we: Float64Array.from(post.we, (w, i) => w / (KC * post.n[i])), wi: Float64Array.from(post.wi, (w, i) => w / (KC * post.n[i])) };
    for (const s of ['n', 'we', 'wi']) {
      const Phi = new Float64Array(N + 1); // Phi[0] = 0 (A_0 = 0)
      for (let j = 1; j < N; j++) {
        const A = 2 * V * (j / N), inv = N; // A_j / h
        Phi[j] = s === 'n' ? -A * (P.D / L2) * (post.n[j] - post.n[j - 1]) * inv
          : -A * ((s === 'we' ? P.chi_e : P.chi_i) / L2) * KC * 0.5 * (post.n[j - 1] + post.n[j]) * (Tpost[s][j] - Tpost[s][j - 1]) * inv;
      }
      Phi[N] = z.edge[s];
      let worst = 0, wc = -1, sumR = 0, sumAbs = 0, inv0 = 0, fs = 0;
      for (let i = 0; i < N; i++) {
        let cs = 0, ca = 0; for (const q of contrib[s][i]) { cs += q; ca += Math.abs(q); }
        const R = (post[s][i] - pre[s][i]) * dV[i] - dt * (Phi[i] - Phi[i + 1] + cs * dV[i]);
        const scale = Math.max(Math.abs(pre[s][i] * dV[i]), dt * ca * dV[i] + dt * Math.abs(Phi[i]) + dt * Math.abs(Phi[i + 1]));
        const r = Math.abs(R) / scale; if (!(r <= worst)) { worst = r; wc = i + 1; }
        sumR += R; sumAbs += dt * ca * dV[i]; inv0 += pre[s][i] * dV[i]; fs = Math.max(fs, Math.abs(Phi[i + 1]));
      }
      sumAbs += dt * Math.abs(Phi[N]);
      out.res[s] = worst; out.worstCell[s] = wc; out.total[s] = Math.abs(sumR) / Math.max(Math.abs(inv0), sumAbs);
      const k = N - 1; let cN = 0; for (const q of contrib[s][k]) cN += q;
      out.delivered[s] = Phi[k] + cN * dV[k] - (post[s][k] - pre[s][k]) * dV[k] / dt;
      out.fluxScale[s] = fs;
    }
    out.shapeNormOwn = { ...ownNorm, br: brNorm, ohm: ohmNorm };
    return out;
  }
  return { N, dV, rc, jt, L2, step };
}

// ---------------------------------------------------------------------------------------------------------------
// Shot runner with the verification-only step hook + M02 observer, streaming all Part A checks
// ---------------------------------------------------------------------------------------------------------------
function runCase(c, P, dt, opts = {}) {
  const g = geometry(c), V = g.volume;
  const r = { controls: c, profiles: P ? { N_rho: P.N_rho, chi_e: P.chi_e, chi_i: P.chi_i } : null, dt, status: 'completed', steps: 0,
    parity: { max: 0, step: null, qty: null, step0: null, floored: 0, flooredStep: null, flooredQty: null, absOverX0: 0 }, ledger: { max: 0, step: null, species: null, cell: null }, totals: { max: 0 },
    edgeDelivered: { maxRel: 0, step: null, species: null }, prescribedVsExported: { maxRel: 0 }, axisNonZero: 0, shapeNormProd: { maxDev: 0 }, shapeNormOwn: { maxDev: 0 },
    preMismatch: 0, badCells: 0, minCell: { n: Infinity, Te: Infinity, Ti: Infinity }, internal: [] };
  const orc = P ? makeOracle(c, P, V) : null; let pending = null, prev = null; const kept = {};
  const hook = rec => { pending = rec; };
  const obs = o => {
    if (!P) return;
    const rec = pending; pending = null;
    if (!rec || rec.step !== o.step) { r.internal.push(`step ${o.step}: no matching profile record`); return; }
    const N = orc.N, dV = orc.dV;
    if (prev === null) { // step 0: own uniform initial state from the 0-D initial totals
      prev = { n: new Float64Array(N).fill(o.initialN / V), we: new Float64Array(N).fill(o.initialWe / V), wi: new Float64Array(N).fill(o.initialWi / V) };
      const tot = x => x.reduce((s, v, i) => s + v * dV[i], 0);
      r.parity.step0 = Math.max(Math.abs(tot(rec.pre.n) - o.initialN) / o.initialN, Math.abs(tot(rec.pre.we) - o.initialWe) / o.initialWe, Math.abs(tot(rec.pre.wi) - o.initialWi) / o.initialWi);
    }
    for (const s of ['n', 'we', 'wi']) for (let i = 0; i < N; i++) if (!Object.is(rec.pre[s][i], prev[s][i])) r.preMismatch++;
    // AC-3 parity
    for (const [s, X, X0] of [['n', o.postN, o.initialN], ['we', o.postWe, o.initialWe], ['wi', o.postWi, o.initialWi]]) {
      let t = 0; for (let i = 0; i < N; i++) t += rec.post[s][i] * dV[i];
      const e = Math.abs(t - X) / X; if (!(e <= r.parity.max)) { r.parity.max = e; r.parity.step = o.step; r.parity.qty = s; }
      // DD-24: normaliser max(X_0D(t), X_0D(0)); the un-floored ratio above is kept and reported
      const ef = Math.abs(t - X) / Math.max(X, X0); if (!(ef <= r.parity.floored)) { r.parity.floored = ef; r.parity.flooredStep = o.step; r.parity.flooredQty = s; }
      r.parity.absOverX0 = Math.max(r.parity.absOverX0, Math.abs(t - X) / X0);
    }
    // AC-4 oracle (pre-step 0-D rates restated here)
    const z = zeroD(c, V, o.preN, o.preWe, o.preWi, o.t);
    const L = orc.step(prev, rec.post, z, o.dt);
    for (const s of ['n', 'we', 'wi']) {
      if (!(L.res[s] <= r.ledger.max)) { r.ledger.max = L.res[s]; r.ledger.step = o.step; r.ledger.species = s; r.ledger.cell = L.worstCell[s]; }
      r.totals.max = Math.max(r.totals.max, L.total[s]);
      // AC-7(b): delivered (own) vs prescribed (own), scale = prescribed loss (N/tauP, We/tauE, Wi/tauE)
      const pres = z.edge[s], e = Math.abs(L.delivered[s] - pres) / Math.max(Math.abs(pres), Math.abs(pres));
      if (!(e <= r.edgeDelivered.maxRel)) { r.edgeDelivered.maxRel = e; r.edgeDelivered.step = o.step; r.edgeDelivered.species = s; }
      r.prescribedVsExported.maxRel = Math.max(r.prescribedVsExported.maxRel, Math.abs(rec.edgeFlux[s] - pres) / Math.abs(pres));
      if (!Object.is(rec.axisFlux[s], 0)) r.axisNonZero++;
    }
    for (const v of Object.values(rec.shapeNorm ?? {})) r.shapeNormProd.maxDev = Math.max(r.shapeNormProd.maxDev, Math.abs(v - 1));
    if (!rec.shapeNorm) r.internal.push(`step ${o.step}: no shapeNorm`);
    for (const v of Object.values(L.shapeNormOwn)) r.shapeNormOwn.maxDev = Math.max(r.shapeNormOwn.maxDev, Math.abs(v - 1));
    for (let i = 0; i < N; i++) {
      const n = rec.post.n[i], te = rec.post.we[i] / (KC * n), ti = rec.post.wi[i] / (KC * n);
      if (!(Number.isFinite(n) && n > 0 && Number.isFinite(te) && te > 0 && Number.isFinite(ti) && ti > 0)) r.badCells++;
      if (n < r.minCell.n) r.minCell.n = n; if (te < r.minCell.Te) r.minCell.Te = te; if (ti < r.minCell.Ti) r.minCell.Ti = ti;
    }
    if (opts.keep && opts.keep.includes(o.step)) kept[o.step] = { o, pre: prev, post: rec.post, z, L, rec };
    prev = rec.post; r.steps++;
  };
  let shot;
  try { shot = P ? withProfileStepObserver(hook, () => runShot(c, g, dt, undefined, obs, P)) : runShot(c, g, dt, undefined, obs); }
  catch (e) {
    r.status = 'threw'; r.error = String(e.message); r.grammarOk = REGEX.test(r.error);
    const m = /t=(\d+\.\d{6}) s in cell (\d+): (\S+) (.*)$/.exec(r.error);
    if (m) { r.errorTime = Number(m[1]); r.errorCell = Number(m[2]); r.errorQty = m[3]; r.errorKind = m[4]; const dtEff = 5 / Math.round(5 / dt); r.acceptedStepsConsistent = Math.round(r.errorTime / dtEff) === r.steps; }
  }
  if (shot && P) {
    let bad = 0; for (const s of shot.profiles.samples) for (const a of [s.n, s.te, s.ti]) for (const x of a) if (!(Number.isFinite(x) && x > 0)) bad++;
    r.exportedBadValues = bad; r.edgeClipFlags = shot.profiles.samples.reduce((k, s) => k + Object.values(s.edge.clipped).filter(Boolean).length, 0);
    r.reportedMaxParity = shot.profiles.maxParity; r.reportedMaxLedger = shot.profiles.maxLedger;
  }
  if (!opts.keepShot) return { r, kept };
  return { r, kept, shot, orc };
}

// ---------------------------------------------------------------------------------------------------------------
// Deep Object.is comparison (same key sets and order)
// ---------------------------------------------------------------------------------------------------------------
function deepIs(a, b, p = '', acc = { compared: 0, differences: 0, first: [] }) {
  const diff = why => { acc.differences++; if (acc.first.length < 5) acc.first.push(`${p || '<root>'}: ${why}`); };
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    if (Array.isArray(a) !== Array.isArray(b)) { diff('array/object mismatch'); return acc; }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) { diff(`keys [${ka}] vs [${kb}]`); return acc; }
    for (const k of ka) deepIs(a[k], b[k], `${p}.${k}`, acc);
  } else { acc.compared++; if (!Object.is(a, b)) diff(`${String(a)} vs ${String(b)}`); }
  return acc;
}
const SHOT_KEYS = ['schemaVersion', 'modelVersion', 'controls', 'volume', 'dt', 'samples', 'assumptions'];

// ---------------------------------------------------------------------------------------------------------------
// AC-1 off path
// ---------------------------------------------------------------------------------------------------------------
function ac1() {
  const frozen = read('experiments/baseline/m01-regression.json'), m01 = read('experiments/baseline/m01-shot.json');
  const variants = [['absent', (c, g) => runShot(c, g)], ['undefined', (c, g) => runShot(c, g, 0.002, undefined, undefined, undefined)], ['{enabled:false}', (c, g) => runShot(c, g, 0.002, undefined, undefined, { enabled: false })],
    ['{enabled:false,N_rho:-1,chi_e:NaN} (extra)', (c, g) => runShot(c, g, 0.002, undefined, undefined, { enabled: false, N_rho: -1, chi_e: NaN })]];
  const runs = [];
  const cases = frozen.cases.map(e => ({ name: e.name, c: e.c, ref: e.shot, refName: 'experiments/baseline/m01-regression.json cases[].shot' }));
  cases.push({ name: 'm01-shot', c: m01.controls, dt: m01.dt, ref: Object.fromEntries(SHOT_KEYS.map(k => [k, m01[k]])), refName: 'experiments/baseline/m01-shot.json (Shot fields; equilibriumCheckpoints excluded, not a Shot field)' });
  for (const cs of cases) {
    const live = {};
    for (const [vn, f] of variants) {
      const g = geometry(cs.c), shot = f(cs.c, g), d = deepIs(shot, cs.ref);
      live[vn] = shot;
      runs.push({ case: cs.name, variant: vn, reference: cs.refName, fieldsCompared: d.compared, differences: d.differences, firstDifferences: d.first, modelVersion: shot.modelVersion, schemaVersion: shot.schemaVersion, hasProfilesKey: 'profiles' in shot, tolerance: 'Object.is, 0 differences', pass: d.differences === 0 && d.compared > 0 && shot.modelVersion === '0.1.0' && shot.schemaVersion === 1 && !('profiles' in shot) });
    }
    const x = deepIs(live['undefined'], live['absent']), y = deepIs(live['{enabled:false}'], live['absent']);
    runs.push({ case: cs.name, variant: 'live cross-check undefined/{enabled:false} vs absent', fieldsCompared: x.compared + y.compared, differences: x.differences + y.differences, tolerance: 'Object.is, 0 differences', pass: x.differences + y.differences === 0 });
  }
  // non-boolean enabled must throw
  const nb = [0, 1, 'true', null, [], {}].map(v => { try { runShot(DEFAULT, geometry(DEFAULT), 0.002, undefined, undefined, { enabled: v }); return { enabled: JSON.stringify(v), threw: false }; } catch (e) { return { enabled: JSON.stringify(v), threw: true, message: e.message }; } });
  const pass = runs.every(x => x.pass) && nb.every(x => x.threw);
  const res = { ...header('AC-1 / D2-VER-OFFPATH (validation re-execution)'), command: `${CMD} ac1`, runs, nonBooleanEnabled: nb,
    totals: { runs: runs.length, fieldsCompared: runs.reduce((s, x) => s + x.fieldsCompared, 0), differences: runs.reduce((s, x) => s + x.differences, 0) },
    notCoveredHere: 'The "all existing tests/ and python/tests/ unchanged and passing" clause is executed separately (see falsification file, AC-1 suite run).', pass };
  writeOut('d2-ver-offpath.json', res); return res;
}

// ---------------------------------------------------------------------------------------------------------------
// Sweep: AC-2, AC-3, AC-4 (clean), AC-7 on DEFAULT, AC-9
// ---------------------------------------------------------------------------------------------------------------
const KEYS = Object.keys(LIMITS);
function sweepCases() {
  const cases = [{ id: 'DEFAULT', c: { ...DEFAULT }, group: 'default' }];
  for (const ip of [0.9, 1.2, 1.5]) for (const nbi of [2, 4, 6]) cases.push({ id: `grid-ip-${ip}-nbi-${nbi}`, c: { ...DEFAULT, ip, nbi }, group: 'grid' });
  for (let m = 0; m < 128; m++) { const c = {}; KEYS.forEach((k, b) => { c[k] = (m >> b) & 1 ? LIMITS[k][1] : LIMITS[k][0]; }); cases.push({ id: `corner-${m.toString(2).padStart(7, '0')}`, c, group: 'corner' }); }
  return cases;
}
function sweep() {
  const t0 = performance.now();
  const ac9 = sweepCases(); // 138 runs
  const m02 = [{ nbi: 0 }, { gas: 0 }, { nbi: 8 }, { gas: 5 }, { nbi: 0, ech: 0, gas: 0 }].map((d, k) => ({ id: `m02-variant-${k + 1}`, c: { ...DEFAULT, ...d }, group: 'm02' }));
  const extra = [{ id: 'm02-all-zero-chi5', c: { ...DEFAULT, nbi: 0, ech: 0, gas: 0 }, group: 'parity-extra', P: { ...PDEF, chi_e: 5, chi_i: 5 } }];
  const all = [...ac9, ...m02, ...extra];
  const grid = []; for (const N of [32, 64, 128]) for (const dt of [0.004, 0.002, 0.001]) grid.push({ N, dt });
  const parityRuns = [], sweepRuns = [], passenger = [];
  let keptDefault = null;
  for (const cs of all) {
    for (const gd of grid) {
      const P = { ...(cs.P ?? PDEF), N_rho: gd.N };
      const isBase = gd.N === 64 && gd.dt === 0.002;
      const wantKeep = cs.id === 'DEFAULT' && isBase;
      const { r, kept, shot } = runCase(cs.c, P, gd.dt, { keep: wantKeep ? [250, 750, 1000, 1500, 2250] : undefined, keepShot: isBase });
      if (wantKeep) keptDefault = { kept, shot, r };
      const row = { id: cs.id, group: cs.group, N_rho: gd.N, dt: gd.dt, status: r.status, steps: r.steps, parityMax: r.parity.max, parityAt: [r.parity.step, r.parity.qty], parityFloored: r.parity.floored, parityFlooredAt: [r.parity.flooredStep, r.parity.flooredQty], parityAbsOverX0: r.parity.absOverX0, parityStep0: r.parity.step0,
        ledgerMax: r.ledger.max, ledgerAt: [r.ledger.step, r.ledger.species, r.ledger.cell], speciesTotalMax: r.totals.max, preMismatch: r.preMismatch, badCells: r.badCells, internal: r.internal,
        error: r.error, grammarOk: r.grammarOk, errorTime: r.errorTime, errorCell: r.errorCell, acceptedStepsConsistent: r.acceptedStepsConsistent };
      parityRuns.push(row);
      if (isBase && cs.group !== 'parity-extra' && cs.group !== 'm02') sweepRuns.push({ ...row, controls: cs.c, exportedBadValues: r.exportedBadValues, edgeClipFlags: r.edgeClipFlags, minCell: r.minCell, reportedMaxParity: r.reportedMaxParity, reportedMaxLedger: r.reportedMaxLedger });
      // AC-2 passenger: AC-1 cases (DEFAULT + m02 variants) and every completing AC-9 case, at the base grid
      if (isBase && cs.group !== 'parity-extra' && r.status === 'completed') {
        const g = geometry(cs.c), off = runShot(cs.c, g);
        const on = shot, onKeys = Object.keys(on), offKeys = Object.keys(off);
        let fields = 0, differing = 0, leaves = 0, leafDiff = 0, first = [];
        for (const k of SHOT_KEYS) { if (k === 'modelVersion') continue; const d = deepIs(on[k], off[k], k); fields++; leaves += d.compared; leafDiff += d.differences; if (d.differences) { differing++; first.push(...d.first); } }
        passenger.push({ id: cs.id, group: cs.group, originalFieldsCompared: fields, differingFields: differing, leavesCompared: leaves, differingLeaves: leafDiff, firstDifferences: first.slice(0, 3),
          keysOk: JSON.stringify(onKeys) === JSON.stringify([...offKeys, 'profiles']), modelVersionOn: on.modelVersion, modelVersionOff: off.modelVersion, schemaVersionOn: on.schemaVersion });
      }
      if (isBase && r.status !== 'completed' && cs.group !== 'parity-extra') { // off-path status for the same controls
        let offStatus = 'completed'; try { runShot(cs.c, geometry(cs.c)); } catch (e) { offStatus = 'threw: ' + e.message; }
        if (cs.group !== 'm02') sweepRuns.at(-1).profileOffStatus = offStatus; if (cs.group === 'm02') passenger.push({ id: cs.id, group: cs.group, note: 'profile-on threw; AC-2 applies to completing cases only', error: r.error, profileOffStatus: offStatus });
      }
    }
  }
  const secs = (performance.now() - t0) / 1000;
  return { parityRuns, sweepRuns, passenger, keptDefault, secs };
}

// AC-4 mutations on the kept DEFAULT trace at step 750 (t = 1.5 s)
function mutations(keptDefault) {
  const k = keptDefault.kept[750]; const c = { ...DEFAULT }, V = geometry(c).volume, orc = makeOracle(c, PDEF, V), dV = orc.dV;
  const clean = orc.step(k.pre, k.post, k.z, k.o.dt), rClean = Math.max(clean.res.n, clean.res.we, clean.res.wi);
  const cp = x => ({ n: Float64Array.from(x.n), we: Float64Array.from(x.we), wi: Float64Array.from(x.wi) });
  const rows = [];
  const judge = (name, L, bound, kind, detail) => { const res = Math.max(L.res.n, L.res.we, L.res.wi); rows.push({ mutation: name, kind, detail, residual: res, perSpecies: L.res, speciesTotals: L.total, bound, ratio: res / bound, rejected: res >= bound }); };
  { const p = cp(k.post); p.n[31] += 1e-6 * k.o.postN / dV[31]; judge('(a) +1e-6 N into density cell 32', orc.step(k.pre, p, k.z, k.o.dt), 1e-8, 'state', 'n[32] += 1e-6*N/dV_32'); }
  { const p = cp(k.post), q = 1e-6 * k.o.postWe; p.we[9] -= q / dV[9]; p.we[49] += q / dV[49]; judge('(b1) 1e-6 We moved w_e cell 10 -> w_e cell 50', orc.step(k.pre, p, k.z, k.o.dt), 1e-8, 'state', 'total conserved'); }
  { const p = cp(k.post), q = 1e-6 * k.o.postWe; p.we[9] -= q / dV[9]; p.wi[9] += q / dV[9]; judge('(b2) 1e-6 We moved w_e cell 10 -> w_i cell 10', orc.step(k.pre, p, k.z, k.o.dt), 1e-8, 'state', 'total conserved'); }
  const shapeBound = Math.max(1e-10, 100 * rClean);
  for (const s of ['nbi', 'ech', 'gas', 'br', 'ohm']) judge(`(c) shape ${s} x (1+1e-6)`, orc.step(k.pre, k.post, k.z, k.o.dt, { shape: s }), shapeBound, 'shape', 'oracle shape mis-normalised by 1e-6');
  return { step: 750, t: k.o.t, rClean, cleanPerSpecies: clean.res, shapeBound, rows, allRejected: rows.every(x => x.rejected), minRatio: Math.min(...rows.map(x => x.ratio)) };
}

// AC-8 diagnostics from the exported profiles block of the DEFAULT run + A1-A5
function diagnostics(keptDefault, parityShots) {
  const { shot } = keptDefault; const c = { ...DEFAULT }, V = geometry(c).volume, orc = makeOracle(c, PDEF, V), N = 64;
  const rel = (a, b) => (b === 0 ? Math.abs(a - b) : Math.abs(a - b) / Math.abs(b));
  const tol = (a, b) => (b === 0 ? 1e-15 : 1e-9);
  const rows = []; let maxRel = 0, allOk = true;
  const gridOk = shot.profiles.grid.rho.every((x, i) => Math.abs(x - (i + 0.5) / N) <= 1e-15);
  for (const T of [0.5, 2, 3, 4.5]) {
    const s = shot.profiles.samples.find(x => Math.abs(x.t - T) < 1e-9), stepIdx = Math.round(T / 0.002), kk = keptDefault.kept[stepIdx];
    const o = kk.o; // 0-D pre-step state of the step that starts at the sample time == 0-D state at the sample
    const n = s.n.map(x => x * 1e19), te = s.te, ti = s.ti;
    const teAvg = o.preWe / (1.5 * o.preN * KEV);
    let br = 0, j2 = 0, j1 = 0; for (let i = 0; i < N; i++) { const dv = orc.dV[i]; br += n[i] * n[i] * Math.sqrt(te[i]) * dv; j2 += orc.jt[i] * orc.jt[i] * etaOf(te[i]) * dv; j1 += orc.jt[i] * dv; }
    const cBr = br / (V * Math.pow(o.preN / V, 2) * Math.sqrt(teAvg)), cOhm = (j2 / V) / (Math.pow(j1 / V, 2) * etaOf(teAvg));
    const ev = x => { const raw = 1.5 * x[N - 1] - 0.5 * x[N - 2]; return { v: Math.max(raw, 0), clip: raw < 0 }; };
    const eN = ev(s.n), eTe = ev(te), eTi = ev(ti);
    const z = zeroD(c, V, o.preN, o.preWe, o.preWi, o.t);
    const q = [['C_br', s.cBr, cBr], ['C_ohm', s.cOhm, cOhm], ['n(1) [1e19]', s.edge.n, eN.v], ['T_e(1)', s.edge.te, eTe.v], ['T_i(1)', s.edge.ti, eTi.v],
      ['edgeFlux n (exported vs own prescribed)', s.edgeFlux.n, z.edge.n], ['edgeFlux we', s.edgeFlux.we, z.edge.we], ['edgeFlux wi', s.edgeFlux.wi, z.edge.wi],
      ['edgeFlux n (exported vs own delivered)', s.edgeFlux.n, kk.L.delivered.n], ['edgeFlux we (vs delivered)', s.edgeFlux.we, kk.L.delivered.we], ['edgeFlux wi (vs delivered)', s.edgeFlux.wi, kk.L.delivered.wi]];
    const meas = q.map(([name, exported, own]) => { const r = rel(exported, own), t = tol(exported, own); maxRel = Math.max(maxRel, r); if (!(r <= t)) allOk = false; return { name, exported, own, relDiff: r, tolerance: t, ratio: r / t }; });
    const clips = { n: [s.edge.clipped.n, eN.clip], te: [s.edge.clipped.te, eTe.clip], ti: [s.edge.clipped.ti, eTi.clip] };
    const clipOk = Object.values(clips).every(([a, b]) => a === b); if (!clipOk) allOk = false;
    rows.push({ t: T, sampleT: s.t, teAvg, measurements: meas, clipFlags: clips, clipOk });
  }
  // A1-A4 anchors through the production evaluator on independently constructed cell arrays
  const anchors = [];
  const avgFn = (N, f) => { const out = []; for (let i = 1; i <= N; i++) { const a = (i - 1) / N, b = i / N; out.push(cellAvgGL(f, a, b)); } return out; };
  const dVn = (N, V) => Array.from({ length: N }, (_, k) => V * (2 * k + 1) / (N * N));
  const diag = (N, V, n, te, jt) => { const Ntot = n.reduce((s, x, i) => s + x * dVn(N, V)[i], 0), We = KC * n.reduce((s, x, i) => s + x * te[i] * dVn(N, V)[i], 0); return evaluateDiagnostics({ V, n, te, ti: te, jt, N: Ntot, We, kc: KC }); };
  { const N = 64, V = 23.11, n = Array(N).fill(3e19), te = Array(N).fill(1), jt = Array(N).fill(1), d = diag(N, V, n, te, jt);
    anchors.push({ id: 'A1', N_rho: N, cBr: d.cBr, cOhm: d.cOhm, errBr: Math.abs(d.cBr - 1), errOhm: Math.abs(d.cOhm - 1), tolerance: 1e-12, pass: Math.abs(d.cBr - 1) <= 1e-12 && Math.abs(d.cOhm - 1) <= 1e-12 }); }
  { const e = {}; for (const N of [64, 256]) { const V = 23.11, T0 = 2, n = Array(N).fill(3e19), te = avgFn(N, r => T0 * (1 - r * r)), d = diag(N, V, n, te, Array(N).fill(1)); e[N] = { cBr: d.cBr, relErr: Math.abs(d.cBr - 2 * Math.SQRT2 / 3) / (2 * Math.SQRT2 / 3), teAvg: d.teAvg }; }
    anchors.push({ id: 'A2', expected: 2 * Math.SQRT2 / 3, runs: e, tolerance: '2e-4 relative at N_rho=256; error ratio 64/256 >= 4', errorRatio: e[64].relErr / e[256].relErr, pass: e[256].relErr <= 2e-4 && e[64].relErr / e[256].relErr >= 4 }); }
  for (const gam of [1, 2]) { const e = {}, exp = gam === 1 ? 4 / 3 : 9 / 5; for (const N of [64, 256]) { const V = 23.11, n = Array(N).fill(3e19), te = Array(N).fill(1), jt = avgFn(N, r => Math.pow(1 - r * r, gam)), d = diag(N, V, n, te, jt); e[N] = { cOhm: d.cOhm, relErr: Math.abs(d.cOhm - exp) / exp }; }
    anchors.push({ id: `A3 gamma=${gam}`, expected: exp, runs: e, tolerance: '2e-4 relative at N_rho=256; error ratio >= 4', errorRatio: e[64].relErr / e[256].relErr, pass: e[256].relErr <= 2e-4 && e[64].relErr / e[256].relErr >= 4 }); }
  { const hand = [[[2, 1], 0.5, false, 0.5], [[1, 0.4], 0.1, false, 0.1], [[1, 0.2], 0, true, -0.2]].map(([[xm, xn], v, clip, raw]) => { const e = edgeValue(xn, xm); const ok = (v === 0 ? Math.abs(e.value) <= 1e-15 : Math.abs(e.value - v) / v <= 1e-12) && e.clipped === clip && Math.abs(e.raw - raw) <= 1e-12 * Math.abs(raw); return { input: { x_Nm1: xm, x_N: xn }, expected: v, expectedRaw: raw, expectedClip: clip, value: e.value, raw: e.raw, clipped: e.clipped, pass: ok }; });
    // evaluator path for each species on injected arrays (hand case (1,0.2) in te/ti/n)
    const N = 64, arr = (xm, xn) => { const a = Array(N).fill(1); a[N - 2] = xm; a[N - 1] = xn; return a; };
    const d = evaluateDiagnostics({ V: 1, n: arr(2, 1), te: arr(1, 0.4), ti: arr(1, 0.2), jt: Array(N).fill(1), N: 1, We: KC, kc: KC });
    const evalPath = { n: [d.edge.n.value, 0.5], te: [d.edge.te.value, 0.1], ti: [d.edge.ti.value, 0, d.edge.ti.clipped] };
    const evalOk = Math.abs(d.edge.n.value - 0.5) <= 0.5e-12 && Math.abs(d.edge.te.value - 0.1) <= 0.1e-12 && Math.abs(d.edge.ti.value) <= 1e-15 && d.edge.ti.clipped === true;
    const lin = {}; for (const NN of [32, 64, 128]) { const x = avgFn(NN, r => 1 - 0.5 * r), rule = Math.max(1.5 * x[NN - 1] - 0.5 * x[NN - 2], 0); const dd = evaluateDiagnostics({ V: 1, n: x, te: x, ti: x, jt: Array(NN).fill(1), N: 1, We: KC, kc: KC }); lin[NN] = { rule, evaluator: dd.edge.te.value, relDiff: Math.abs(dd.edge.te.value - rule) / rule, offsetFromAnalytic0p5: rule - 0.5 }; }
    anchors.push({ id: 'A4', hand, evaluatorPath: evalPath, linearProfile: lin, linearOffsetRate_32_64: Math.log2(Math.abs(lin[32].offsetFromAnalytic0p5 / lin[64].offsetFromAnalytic0p5)), linearOffsetRate_64_128: Math.log2(Math.abs(lin[64].offsetFromAnalytic0p5 / lin[128].offsetFromAnalytic0p5)), tolerance: '1e-12 relative (1e-15 absolute at 0); clip flag exact', pass: hand.every(h => h.pass) && evalOk && Object.values(lin).every(l => l.relDiff <= 1e-12) }); }
  { // A5: T_e,avg identity on exports of the base-grid PARITY runs (DEFAULT + m02 variants that completed)
    let maxA5 = 0, count = 0; for (const sh of parityShots) for (const [k, s] of sh.profiles.samples.entries()) { const S = sh.samples[k]; if (Math.abs(S.t - s.t) > 1e-12) { maxA5 = Infinity; continue; } const n = s.n, dv = x => (2 * x + 1); let a = 0, b = 0; for (let i = 0; i < n.length; i++) { a += n[i] * s.te[i] * dv(i); b += n[i] * dv(i); } maxA5 = Math.max(maxA5, Math.abs(a / b - S.te) / S.te); count++; }
    anchors.push({ id: 'A5', samplesCompared: count, maxRel: maxA5, tolerance: 1e-9, pass: maxA5 <= 1e-9 }); }
  return { gridOk, samples: rows, maxRel, a6Pass: allOk && gridOk, anchors, pass: allOk && gridOk && anchors.every(a => a.pass) };
}

// ---------------------------------------------------------------------------------------------------------------
// Fixtures for AC-7 (verification-only kernel entry)
// ---------------------------------------------------------------------------------------------------------------
function gauleg(n) { const x = [], w = []; for (let i = 1; i <= n; i++) { let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp = 1; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = n * (z * p1 - p2) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-16) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; }
const GL = gauleg(10);
function cellAvgGL(f, a, b) { let s = 0; for (let k = 0; k < GL.x.length; k++) { const r = 0.5 * (a + b) + 0.5 * (b - a) * GL.x[k]; s += GL.w[k] * f(r) * 2 * r; } return s * 0.5 * (b - a) / (b * b - a * a); }
function J0(x) { const q = x * x / 4; let s = 0, term = 1; for (let k = 1; k < 60; k++) { s += term; term *= -q / (k * k); if (Math.abs(term) < 1e-20) break; } return s; }
const A1 = 2.404825557695773, B1 = 3.831705970207512;

function runFixture(name, spec, judgeSpecies, dmp) {
  const N = spec.N_rho, V = spec.V, dV = Array.from({ length: N }, (_, k) => V * (2 * k + 1) / (N * N)), kc = spec.energyConst;
  const u0 = {}; for (const s of judgeSpecies) u0[s] = Array.from(s === 'n' ? spec.n0 : s === 'we' ? spec.we0 : spec.wi0);
  const bounds = {}; for (const s of judgeSpecies) { const bv = dmp?.boundary ?? []; const M = Math.max(...u0[s].map(Math.abs)); bounds[s] = { lo: Math.min(...u0[s], ...bv) - 1e-14 * M, hi: Math.max(...u0[s], ...bv) + 1e-14 * M, M }; }
  const EPS = 2 ** -52, edgeOf = s => ('type' in spec.edge ? spec.edge : spec.edge[s] ?? { type: 'flux', value: 0 });
  const st = { steps: 0, axisNonZero: 0, edge: { maxRatio: 0, worst: null }, edgeDD25: { maxRatio: 0, worst: null }, prodZeroFlux: { checked: 0, nonExactZero: 0, maxAbsProdDelivered: 0 }, dmp: { maxViolation: 0, minV: Infinity, maxV: -Infinity }, negatives: 0 };
  let prev = { n: Float64Array.from(spec.n0), we: Float64Array.from(spec.we0), wi: Float64Array.from(spec.wi0) };
  const src = (s, step, t) => { const p = spec.sources?.[s]; if (!p) return null; return typeof p === 'function' ? p(step, t) : p; };
  const userObs = spec.observer;
  const observer = rec => {
    for (const s of ['n', 'we', 'wi']) if (!Object.is(rec.axisFlux[s], 0)) st.axisNonZero++;
    for (const s of judgeSpecies) {
      const post = rec.post[s], pre = prev[s], coef = s === 'n' ? spec.D : s === 'we' ? spec.chi_e : spec.chi_i;
      const y = s === 'n' ? post : Float64Array.from(post, (w, i) => w / (kc * rec.post.n[i]));
      let fs = 0, Phi = 0; for (let j = 1; j < N; j++) { const A = 2 * V * j / N, m = s === 'n' ? 1 : kc * 0.5 * (rec.post.n[j - 1] + rec.post.n[j]); const F = -A * (coef / spec.L2) * m * (y[j] - y[j - 1]) * N; fs = Math.max(fs, Math.abs(F)); if (j === N - 1) Phi = F; }
      const q = src(s, rec.step, rec.t), qN = q ? q[N - 1] : 0;
      const delivered = Phi + qN * dV[N - 1] - (post[N - 1] - pre[N - 1]) * dV[N - 1] / rec.dt, prescribed = rec.edgeFlux[s];
      fs = Math.max(fs, Math.abs(prescribed));
      const ratio = Math.abs(delivered - prescribed) / (1e-12 * Math.max(Math.abs(prescribed), fs));
      if (!(ratio <= st.edge.maxRatio)) st.edge = { maxRatio: ratio, worst: { step: rec.step, species: s, delivered, prescribed, fluxScale: fs, absDiff: Math.abs(delivered - prescribed), relToScale: Math.abs(delivered - prescribed) / Math.max(Math.abs(prescribed), fs) } };
      // DD-25 bound: 1e-12 max(|prescribed|, flux scale) + 100 eps M dV_N / dt, M = max_i |x_i| (post-step)
      let M = 0; for (let i = 0; i < N; i++) M = Math.max(M, Math.abs(post[i]));
      const floor = 100 * EPS * M * dV[N - 1] / rec.dt, tolNew = 1e-12 * Math.max(Math.abs(prescribed), fs) + floor, r25 = Math.abs(delivered - prescribed) / tolNew;
      if (!(r25 <= st.edgeDD25.maxRatio)) st.edgeDD25 = { maxRatio: r25, worst: { step: rec.step, species: s, absDiff: Math.abs(delivered - prescribed), relTerm: 1e-12 * Math.max(Math.abs(prescribed), fs), roundoffFloor: floor, M, dV_N: dV[N - 1], dt: rec.dt, oldRatio: ratio } };
      const e = edgeOf(s); if (e.type === 'flux' && e.value === 0) { st.prodZeroFlux.checked++; if (!Object.is(rec.edgeFlux[s], 0)) st.prodZeroFlux.nonExactZero++; st.prodZeroFlux.maxAbsProdDelivered = Math.max(st.prodZeroFlux.maxAbsProdDelivered, Math.abs(rec.edgeFluxDelivered[s])); }
      for (let i = 0; i < N; i++) { const v = post[i]; if (v < st.dmp.minV) st.dmp.minV = v; if (v > st.dmp.maxV) st.dmp.maxV = v; if (v < 0) st.negatives++; if (dmp) { const viol = Math.max(bounds[s].lo - v, v - bounds[s].hi, 0) / bounds[s].M; st.dmp.maxViolation = Math.max(st.dmp.maxViolation, viol); } }
    }
    prev = rec.post; st.steps++;
    if (userObs) userObs(rec);
  };
  const t0 = performance.now(); let final, stopped = false;
  try { final = runProfileKernel({ ...spec, observer }); } catch (e) { if (e && e.__stop) { stopped = true; final = e.state; } else throw e; }
  return { name, inputs: { N_rho: N, dt: spec.dt, steps: spec.steps, edge: spec.edge, freezeN: !!spec.freezeN, enforceConstraint: spec.enforceConstraint !== false }, stoppedEarly: stopped, stepsRun: st.steps, seconds: (performance.now() - t0) / 1000,
    axisNonZero: st.axisNonZero, edgeFlux: st.edge, edgeFluxDD25: st.edgeDD25, productionZeroFlux: st.prodZeroFlux, dmp: dmp ? { bounds, maxViolationOverM: st.dmp.maxViolation, observedMin: st.dmp.minV, observedMax: st.dmp.maxV, pass: st.dmp.maxViolation === 0 } : null, negatives: st.negatives, final: prev, dV };
}
const L2rel = (u, ub, dV) => { let a = 0, b = 0; for (let i = 0; i < u.length; i++) { a += dV[i] * (u[i] - ub[i]) ** 2; b += dV[i] * ub[i] ** 2; } return Math.sqrt(a / b); };

function fixtures() {
  const out = []; const one = N => new Array(N).fill(1), zero = N => new Array(N).fill(0), cav = (N, f) => Array.from({ length: N }, (_, k) => cellAvgGL(f, k / N, (k + 1) / N));
  const steadyStop = N => { let last = null; return rec => { if (last) { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(rec.post.n[i] - last[i]) / Math.abs(rec.post.n[i])); if (m <= 1e-14) { const e = new Error('stop'); e.__stop = true; throw e; } } last = rec.post.n; }; };
  // F1 source-driven (a): n evolves, S=1, zero-Dirichlet; energy species zero & reflecting (not judged)
  for (const N of [16, 64, 256]) {
    const f = runFixture(`F1 STEADY (a) N=${N}`, { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt: 0.05, steps: 2000, energyConst: 1, n0: zero(N), we0: zero(N), wi0: zero(N), sources: { n: one(N) }, edge: { n: { type: 'dirichlet', value: 0 }, we: { type: 'flux', value: 0 }, wi: { type: 'flux', value: 0 } }, enforceConstraint: false, observer: steadyStop(N) }, ['n'], null);
    const ub = Array.from({ length: N }, (_, k) => 0.25 * (1 - ((k / N) ** 2 + ((k + 1) / N) ** 2) / 2));
    f.informationalL2rel = L2rel(f.final.n, ub, f.dV); f.nonNegativityPass = f.negatives === 0; delete f.final; delete f.dV; out.push(f);
  }
  // F1 diffusion-only companion (DMP), N=64: start from the F1 cell averages, no source
  { const N = 64, u = Array.from({ length: N }, (_, k) => 0.25 * (1 - ((k / N) ** 2 + ((k + 1) / N) ** 2) / 2));
    const f = runFixture('F1 diffusion-only companion N=64 (DMP)', { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt: 0.05, steps: 200, energyConst: 1, n0: u, we0: zero(N), wi0: zero(N), edge: { n: { type: 'dirichlet', value: 0 }, we: { type: 'flux', value: 0 }, wi: { type: 'flux', value: 0 } }, enforceConstraint: false }, ['n'], { boundary: [0] });
    delete f.final; delete f.dV; out.push(f); }
  // F2 Dirichlet eigenmode, N=256, dt=2e-6, t=1 (500000 steps)
  { const N = 256, u = cav(N, r => J0(A1 * r));
    const f = runFixture('F2 EIGEN-DIRICHLET N=256 dt=2e-6 t=1', { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt: 2e-6, steps: 500000, energyConst: 1, n0: one(N), we0: u, wi0: u, freezeN: true, edge: { n: { type: 'flux', value: 0 }, we: { type: 'dirichlet', value: 0 }, wi: { type: 'dirichlet', value: 0 } } }, ['we', 'wi'], { boundary: [0] });
    f.informationalL2rel = L2rel(f.final.we, u.map(x => x * Math.exp(-A1 * A1)), f.dV); delete f.final; delete f.dV; out.push(f); }
  // F3 reflecting eigenmode, N=256, t=1, dt=1e-6 (spec) and dt=5e-7 (probe of the known marginal edge-flux margin; still within dt<=1e-6)
  for (const [dt, steps] of [[1e-6, 1000000], [5e-7, 2000000]]) {
    const N = 256, u = cav(N, r => J0(B1 * r));
    const f = runFixture(`F3 EIGEN-REFLECT N=256 dt=${dt} t=1`, { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt, steps, energyConst: 1, n0: one(N), we0: u, wi0: u, freezeN: true, edge: { type: 'flux', value: 0 }, enforceConstraint: false }, ['we', 'wi'], { boundary: [] });
    f.informationalL2rel = L2rel(f.final.we, u.map(x => x * Math.exp(-B1 * B1)), f.dV); delete f.final; delete f.dV; out.push(f);
  }
  // F4 MMS conduction, N=128, dt=1e-5, t=1
  { const N = 128, n = cav(N, r => 1.5 - r * r / 2), w0 = cav(N, r => (1.5 - r * r / 2) * (1 - r * r) * (1 + r * r / 2));
    const Sshape = cav(N, r => 1.5 + 11.25 * r * r - 5.5 * r ** 4 - 0.25 * r ** 6), src = (s, t) => Sshape.map(x => x * Math.exp(-t));
    const f = runFixture('F4 MMS-CONDUCTION N=128 dt=1e-5 t=1', { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt: 1e-5, steps: 100000, energyConst: 1, n0: n, we0: w0, wi0: w0, freezeN: true, sources: { we: src, wi: src }, edge: { n: { type: 'flux', value: 0 }, we: { type: 'dirichlet', value: 0 }, wi: { type: 'dirichlet', value: 0 } } }, ['we', 'wi'], null);
    f.informationalL2rel = L2rel(f.final.we, w0.map(x => x * Math.exp(-1)), f.dV); delete f.final; delete f.dV; out.push(f); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// PART B: AC-5 analytic fixtures, AC-6 convergence rates, adversarial cases (own fixtures, own J0 series, own GL)
// ---------------------------------------------------------------------------------------------------------------
const cavN = (N, f) => Array.from({ length: N }, (_, k) => cellAvgGL(f, k / N, (k + 1) / N));
const EDGE_D0 = { type: 'dirichlet', value: 0 }, EDGE_F0 = { type: 'flux', value: 0 };
const F4w = (r, t) => (1.5 - r * r / 2) * Math.exp(-t) * (1 - r * r) * (1 + r * r / 2);
const F4S = r => 1.5 + 11.25 * r * r - 5.5 * r ** 4 - 0.25 * r ** 6;
// normalised fixture spec (V = 1, L2 = 1, D = chi = 1, energyConst = 1); judged field: w_e (w_i identical)
function fixSpec(F, N, dt, steps) {
  const one = new Array(N).fill(1), base = { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt, steps, energyConst: 1, freezeN: true };
  if (F === 'F2') { const u = cavN(N, r => J0(A1 * r)); return { spec: { ...base, n0: one, we0: u, wi0: u, edge: { n: EDGE_F0, we: EDGE_D0, wi: EDGE_D0 } }, exact: t => u.map(x => x * Math.exp(-A1 * A1 * t)) }; }
  if (F === 'F3') { const u = cavN(N, r => J0(B1 * r)); return { spec: { ...base, n0: one, we0: u, wi0: u, edge: EDGE_F0, enforceConstraint: false }, exact: t => u.map(x => x * Math.exp(-B1 * B1 * t)) }; }
  if (F === 'F4') { const n = cavN(N, r => 1.5 - r * r / 2), w0 = cavN(N, r => F4w(r, 0)), Sh = cavN(N, F4S), src = (s, t) => Sh.map(x => x * Math.exp(-t));
    return { spec: { ...base, n0: n, we0: w0, wi0: w0, sources: { we: src, wi: src }, edge: { n: EDGE_F0, we: EDGE_D0, wi: EDGE_D0 } }, exact: t => w0.map(x => x * Math.exp(-t)) }; }
  throw new Error(F);
}
const dVnorm = N => Array.from({ length: N }, (_, k) => (2 * k + 1) / (N * N));
const kernelWe = (F, N, dt, T = 1) => Float64Array.from(runProfileKernel(fixSpec(F, N, dt, Math.round(T / dt)).spec).we);
const dNorm = (a, b, ub, dV) => { let x = 0, y = 0; for (let i = 0; i < a.length; i++) { x += dV[i] * (a[i] - b[i]) ** 2; y += dV[i] * ub[i] ** 2; } return Math.sqrt(x / y); };

function ac5() {
  const t0 = performance.now(), out = {};
  const zero = N => new Array(N).fill(0), one = N => new Array(N).fill(1);
  const stopOn = (N, s) => { let last = null; return rec => { if (last) { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(rec.post[s][i] - last[i]) / Math.abs(rec.post[s][i])); if (m <= 1e-14) { const e = new Error('stop'); e.__stop = true; throw e; } } last = rec.post[s]; }; };
  // F1 STEADY: (a) normalised, (b) SI density, (c) SI electron energy; N = 16, 64, 256
  const Vsi = 23.11, L2si = Vsi / (2 * Math.PI * Math.PI * R0);
  const steady = [];
  for (const N of [16, 64, 256]) {
    const cavQ = (A) => Array.from({ length: N }, (_, k) => A * (1 - ((k / N) ** 2 + ((k + 1) / N) ** 2) / 2)); // exact cell average of A(1 - rho^2)
    const cases = [
      ['(a) normalised S=1, D/L2=1', { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt: 0.05, energyConst: 1, n0: zero(N), we0: zero(N), wi0: zero(N), sources: { n: one(N) }, edge: { n: EDGE_D0, we: EDGE_F0, wi: EDGE_F0 } }, 'n', cavQ(1 / 4)],
      ['(b) SI density V=23.11, D=0.1, S=1e19', { N_rho: N, V: Vsi, L2: L2si, D: 0.1, chi_e: 1, chi_i: 1, dt: 0.05 * L2si / 0.1, energyConst: KC, n0: zero(N), we0: zero(N), wi0: zero(N), sources: { n: new Array(N).fill(1e19) }, edge: { n: EDGE_D0, we: EDGE_F0, wi: EDGE_F0 } }, 'n', cavQ(1e19 * L2si / (4 * 0.1))],
      ['(c) SI electron energy n=3e19, chi_e=3, S_e=1e5 W/m3', { N_rho: N, V: Vsi, L2: L2si, D: 0.1, chi_e: 3, chi_i: 3, dt: 0.05 * L2si / 3, energyConst: KC, n0: new Array(N).fill(3e19), we0: zero(N), wi0: zero(N), freezeN: true, sources: { we: new Array(N).fill(1e5) }, edge: { n: EDGE_F0, we: EDGE_D0, wi: EDGE_F0 } }, 'we', cavQ(1e5 * L2si / (4 * 3))],
    ];
    for (const [label, sp, sName, ub] of cases) {
      let steps = 0, axisNZ = 0, fin = null; const stop = stopOn(N, sName);
      let reached = false;
      try { runProfileKernel({ ...sp, steps: 2000, enforceConstraint: false, observer: rec => { steps++; for (const q of ['n', 'we', 'wi']) if (!Object.is(rec.axisFlux[q], 0)) axisNZ++; fin = rec.post[sName]; stop(rec); } }); }
      catch (e) { if (e && e.__stop) reached = true; else throw e; }
      const dV = dVnorm(N).map(x => x * sp.V), l2 = L2rel(fin, ub, dV);
      steady.push({ fixture: `F1 ${label}`, N_rho: N, dt: sp.dt, stepsRun: steps, stopRuleReached: reached, cap: 2000, axisFaceFluxNonZero: axisNZ, L2rel: l2, tolerance: 1e-6, ratio: l2 / 1e-6, pass: l2 <= 1e-6 && reached && axisNZ === 0 });
    }
  }
  const steadyDoc = { ...header('AC-5 D2-VER-STEADY (validation re-execution)'), command: `${CMD} ac5`, expected: 'exact cell averages of A(1 - rho^2): A (1 - (rho_{i-1}^2 + rho_i^2)/2), A = S L^2/(4D) (density) or S_e L^2/(4 chi) (w_e = (3/2) KEV n T)', runs: steady, pass: steady.every(r => r.pass) };
  writeOut('d2-ver-steady.json', steadyDoc); out.steady = steadyDoc;
  // F2 Dirichlet eigenmode, N = 256, dt = 2e-6, t = 1 (with DMP and point value at rho = 0.5)
  { const N = 256, { spec, exact } = fixSpec('F2', N, 2e-6, 500000);
    const f = runFixture('F2 EIGEN-DIRICHLET N=256 dt=2e-6 t=1', spec, ['we', 'wi'], { boundary: [0] });
    const ub = exact(1), l2 = L2rel(f.final.we, ub, f.dV), l2i = L2rel(f.final.wi, ub, f.dV);
    const pv = 0.5 * (f.final.we[127] + f.final.we[128]), pvExact = J0(A1 * 0.5) * Math.exp(-A1 * A1);
    delete f.final; delete f.dV;
    const doc = { ...header('AC-5 D2-VER-EIGEN-DIRICHLET (validation re-execution)'), command: `${CMD} ac5`, amplitudeAtT1: Math.exp(-A1 * A1), L2rel_we: l2, L2rel_wi: l2i, tolerance: 1e-4, ratio: Math.max(l2, l2i) / 1e-4, pointValueRho0p5: { interpolated: pv, analytic: pvExact, relDiff: Math.abs(pv - pvExact) / Math.abs(pvExact), judged: false }, run: f, pass: Math.max(l2, l2i) <= 1e-4 && f.dmp.pass };
    writeOut('d2-ver-eigen-dirichlet.json', doc); out.f2 = doc; }
  // F3 reflecting eigenmode, N = 256, dt = 1e-6, t = 1, plus uniform-mode companion
  { const N = 256, { spec, exact } = fixSpec('F3', N, 1e-6, 1000000);
    const f = runFixture('F3 EIGEN-REFLECT N=256 dt=1e-6 t=1', spec, ['we', 'wi'], { boundary: [] });
    const ub = exact(1), l2 = L2rel(f.final.we, ub, f.dV), l2i = L2rel(f.final.wi, ub, f.dV); delete f.final; delete f.dV;
    const dV = dVnorm(N); let tot0 = 0, tot1 = 0;
    const comp = runProfileKernel({ ...spec, we0: one(N), wi0: one(N) }); for (let i = 0; i < N; i++) { tot0 += dV[i]; tot1 += comp.we[i] * dV[i]; }
    let maxDevUniform = 0; for (let i = 0; i < N; i++) maxDevUniform = Math.max(maxDevUniform, Math.abs(comp.we[i] - 1));
    const doc = { ...header('AC-5 D2-VER-EIGEN-REFLECT tolerance part (validation re-execution; rates in d2-ver-refinement.json)'), command: `${CMD} ac5`, b1: B1, J1ofB1_ownSeriesCheck: null, amplitudeAtT1: Math.exp(-B1 * B1), L2rel_we: l2, L2rel_wi: l2i, tolerance: 1e-3, ratio: Math.max(l2, l2i) / 1e-3,
      uniformCompanion: { steps: 1000000, total0: tot0, total1: tot1, relChange: Math.abs(tot1 - tot0) / tot0, tolerance: 1e-12, maxCellDeviationFrom1: maxDevUniform },
      edgeFlux: { productionReported: f.productionZeroFlux, reconstructedDD25: f.edgeFluxDD25 }, run: f };
    doc.pass = Math.max(l2, l2i) <= 1e-3 && doc.uniformCompanion.relChange <= 1e-12 && f.productionZeroFlux.nonExactZero === 0 && f.edgeFluxDD25.maxRatio <= 1;
    writeOut('d2-ver-eigen-reflect.json', doc); out.f3 = doc; }
  // F4 manufactured conduction, N = 128, dt = 1e-5, t = 1; own finite-difference residual of the manufactured source
  { const N = 128, { spec, exact } = fixSpec('F4', N, 1e-5, 100000), fin = runProfileKernel(spec), dV = dVnorm(N);
    const l2 = L2rel(fin.we, exact(1), dV), l2i = L2rel(fin.wi, exact(1), dV);
    const h = 1e-4, t = 0.7, T = (r, tt) => Math.exp(-tt) * (1 - r * r) * (1 + r * r / 2), n = r => 1.5 - r * r / 2;
    const res = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95].map(r => { const flux = rr => rr * n(rr) * (T(rr + h, t) - T(rr - h, t)) / (2 * h); const div = (flux(r + h) - flux(r - h)) / (2 * h) / r; const dwdt = (F4w(r, t + h) - F4w(r, t - h)) / (2 * h); return Math.abs(dwdt - div - F4S(r) * Math.exp(-t)); });
    const doc = { ...header('AC-5 D2-VER-MMS-CONDUCTION (validation re-execution)'), command: `${CMD} ac5`, L2rel_we: l2, L2rel_wi: l2i, tolerance: 1e-4, ratio: Math.max(l2, l2i) / 1e-4, sourceResidualOwnFD: { rho: [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95], t, max: Math.max(...res) }, pass: Math.max(l2, l2i) <= 1e-4 };
    writeOut('d2-ver-mms-conduction.json', doc); out.f4 = doc; }
  // own J0 series sanity: J0(a1) and J1(b1) (via J0' = -J1) at the stated roots
  const J1 = x => (J0(x - 1e-6) - J0(x + 1e-6)) / 2e-6;
  const j = { J0_a1: J0(A1), J1_b1_fd: J1(B1), J0_1: J0(1), J0_1_ref: 0.7651976865579666 };
  out.besselSanity = j; out.seconds = (performance.now() - t0) / 1000;
  writeOut('.ac5-summary.json', { bessel: j, seconds: out.seconds });
  return out;
}

function rates() {
  const t0 = performance.now(), fx = [];
  const band = { sp: [1.8, 2.2], tp: [0.85, 1.15], spOuter: [1.6, 2.4], tpOuter: [0.8, 1.2] };
  for (const [F, Nt] of [['F2', 256], ['F3', 256], ['F4', 128]]) {
    const exempt = F !== 'F3';
    const sp = {};
    for (const N of [32, 64, 128, 256]) { const u1 = kernelWe(F, N, 1e-5), u2 = kernelWe(F, N, 5e-6), ub = fixSpec(F, N, 1e-5, 0).exact(1), R = u2.map((x, i) => 2 * x - u1[i]); sp[N] = { e: L2rel(R, ub, dVnorm(N)), u1, u2 }; }
    const spatial = [[32, 64], [64, 128], [128, 256]].map(([a, b]) => { const p = Math.log2(sp[a].e / sp[b].e), rex = exempt && sp[a].e <= 1e-10 && sp[b].e <= 1e-10; return { N: [a, b], e: [sp[a].e, sp[b].e], p, band: band.sp, judged: !rex, pass: rex || (p >= band.sp[0] && p <= band.sp[1]), passOuterDD6: p >= band.spOuter[0] && p <= band.spOuter[1] }; });
    const dts = [4e-5, 2e-5, 1e-5, 5e-6], ubT = fixSpec(F, Nt, 1e-5, 0).exact(1), dV = dVnorm(Nt);
    const fields = dts.map(dt => (dt === 1e-5 && sp[Nt] ? sp[Nt].u1 : dt === 5e-6 && sp[Nt] ? sp[Nt].u2 : kernelWe(F, Nt, dt)));
    const d = [0, 1, 2].map(k => dNorm(fields[k], fields[k + 1], ubT, dV));
    const temporal = [0, 1].map(k => { const p = Math.log2(d[k] / d[k + 1]), rex = exempt && d[k] <= 1e-10 && d[k + 1] <= 1e-10; return { dt: [dts[k], dts[k + 1], dts[k + 2]], d: [d[k], d[k + 1]], p, band: band.tp, judged: !rex, pass: rex || (p >= band.tp[0] && p <= band.tp[1]), passOuterDD6: p >= band.tpOuter[0] && p <= band.tpOuter[1] }; });
    fx.push({ fixture: F, spatialDt: [1e-5, 5e-6], spatialProcedure: 'e_N = L2rel(2 u_{dt/2} - u_dt, cell-average exact) at t=1', temporalN: Nt, spatial, temporal, pass: [...spatial, ...temporal].every(r => r.pass) });
  }
  // DEFAULT shot temporal: N_rho = 64, first/last-cell T_e at 0.5, 2, 3, 4.5 s
  const dts = [0.004, 0.002, 0.001, 0.0005], shots = dts.map(dt => runShot(DEFAULT, geometry(DEFAULT), dt, undefined, undefined, PDEF));
  const shotRates = [];
  for (const T of [0.5, 2, 3, 4.5]) for (const [cell, idx] of [['first', 0], ['last', 63]]) {
    const x = shots.map(sh => { const s = sh.profiles.samples.find(q => Math.abs(q.t - T) < 1e-9); return s.te[idx]; });
    const d = [0, 1, 2].map(k => Math.abs(x[k] - x[k + 1]) / Math.abs(x[3]));
    const rr = [0, 1].map(k => { const p = Math.log2(d[k] / d[k + 1]), rex = d[k] <= 1e-10 && d[k + 1] <= 1e-10; return { p, d: [d[k], d[k + 1]], judged: !rex, pass: rex || (p >= 0.7 && p <= 1.3) }; });
    shotRates.push({ t: T, cell, Te: x, rates: rr, band: [0.7, 1.3] });
  }
  const doc = { ...header('AC-6 D2-VER-REFINEMENT (validation re-execution; own Richardson/difference procedure)'), command: `${CMD} rates`, bands: { spatial: band.sp, temporalFixtures: band.tp, defaultShot: [0.7, 1.3], F3OuterDD6: { spatial: band.spOuter, temporal: band.tpOuter } }, fixtures: fx, defaultShot: shotRates,
    counts: { fixtureRates: fx.reduce((s, f) => s + f.spatial.length + f.temporal.length, 0), shotRates: shotRates.reduce((s, q) => s + q.rates.length, 0) }, seconds: (performance.now() - t0) / 1000 };
  doc.pass = fx.every(f => f.pass) && shotRates.every(q => q.rates.every(r => r.pass)) && doc.counts.fixtureRates === 15 && doc.counts.shotRates === 16;
  doc.f3DD6 = fx.find(f => f.fixture === 'F3');
  writeOut('d2-ver-refinement.json', doc); return doc;
}

function adversarial() {
  const cases = [], t0 = performance.now();
  // ADV-1: bremsstrahlung (and every) shape-mutation margin across the shot, not only at step 750
  { const steps = [50, 250, 450, 500, 750, 1000, 1500, 1999, 2000, 2250, 2450];
    const { kept } = runCase({ ...DEFAULT }, PDEF, 0.002, { keep: steps }); const V = geometry(DEFAULT).volume, orc = makeOracle({ ...DEFAULT }, PDEF, V);
    const rows = steps.map(st => { const k = kept[st]; const clean = orc.step(k.pre, k.post, k.z, k.o.dt), rc = Math.max(clean.res.n, clean.res.we, clean.res.wi), bound = Math.max(1e-10, 100 * rc);
      const m = Object.fromEntries(['nbi', 'ech', 'gas', 'br', 'ohm'].map(sh => { const L = orc.step(k.pre, k.post, k.z, k.o.dt, { shape: sh }); const r = Math.max(L.res.n, L.res.we, L.res.wi); return [sh, { residual: r, ratio: r / bound }]; }));
      const active = { nbi: k.z.beam > 0, ech: k.z.pEch > 0, gas: k.z.gas > 0, br: k.z.pRad > 0, ohm: k.z.pOhm > 0 };
      return { step: st, t: k.o.t, rClean: rc, bound, activeTerms: active, ratios: Object.fromEntries(Object.entries(m).map(([a, b]) => [a, b.ratio])), brMinDetectableRelError: 1e-6 / m.br.ratio }; });
    const brMin = Math.min(...rows.map(r => r.ratios.br)), anyUndetected = rows.flatMap(r => Object.entries(r.ratios).filter(([k, v]) => r.activeTerms[k] && v < 1).map(([k, v]) => ({ step: r.step, t: r.t, shape: k, ratio: v })));
    const inactive = rows.flatMap(r => Object.entries(r.activeTerms).filter(([, a]) => !a).map(([k]) => `${k}@${r.t}s`));
    cases.push({ id: 'ADV-1', title: 'Shape-mutation detectability across the whole DEFAULT shot (AC-4(c) is specified at step 750 only)', input: 'DEFAULT, N_rho=64, dt=0.002; each of NBI/ECH/gas/bremsstrahlung/Ohmic oracle shape x (1+1e-6) at steps ' + steps.join(','), expected: 'residual >= max(1e-10, 100 r_clean) (ratio >= 1) at every step where the shape carries power; ratio at step 750 reproduces Part A (br 2.12)',
      observed: { rows, brMinRatio: brMin, brMinAtStep: rows.find(r => r.ratios.br === brMin).step, undetectedActiveTerms: anyUndetected, inactiveTermsNotJudged: inactive }, verdict: anyUndetected.length === 0 ? 'pass (marginal for bremsstrahlung)' : 'fail',
      note: `Every mutation of a shape that carries power at that step is rejected. Bremsstrahlung is the weakest: minimum ratio ${brMin.toFixed(2)} over the sampled steps, i.e. the smallest normalisation error of the bremsstrahlung shape the ledger detects is about ${(1e-6 / brMin).toExponential(2)}; step 750 (the specified step) is the worst sampled step. NBI/ECH shapes at steps where those sources are off carry zero power, so a mis-normalisation there is physically inert and undetectable by any ledger; they are listed, not judged.` });
  }
  // ADV-2: F3 reconstructed edge flux at far smaller dt than allowed, under the DD-25 bound; production flux exactly 0
  { const rows = [];
    for (const dt of [1e-8, 1e-10, 1e-12]) { const { spec } = fixSpec('F3', 256, dt, 20000); const f = runFixture(`F3 N=256 dt=${dt} 20000 steps`, spec, ['we', 'wi'], { boundary: [] });
      rows.push({ dt, steps: f.stepsRun, oldRatio1e12: f.edgeFlux.maxRatio, dd25Ratio: f.edgeFluxDD25.maxRatio, dd25Worst: f.edgeFluxDD25.worst, productionReportedNonExactZero: f.productionZeroFlux.nonExactZero, productionChecked: f.productionZeroFlux.checked, productionDeliveredMaxAbs: f.productionZeroFlux.maxAbsProdDelivered, dmpMaxViolationOverM: f.dmp.maxViolationOverM }); }
    const ok = rows.every(r => r.dd25Ratio <= 1 && r.productionReportedNonExactZero === 0 && r.dmpMaxViolationOverM === 0);
    cases.push({ id: 'ADV-2', title: 'F3 edge flux at dt 1e-8, 1e-10, 1e-12 (100x to 1e6x below the fixture minimum used in AC-7)', input: 'F3 reflecting eigenmode N=256, 20000 steps each, observer reconstruction delivered = Phi_{N-1} + q dV_N - (x_N^{k+1} - x_N^k) dV_N/dt', expected: 'DD-25 ratio <= 1 at every step; production-reported face flux Object.is 0; DMP violation 0', observed: rows, verdict: ok ? 'pass' : 'fail' });
  }
  // ADV-3: kappa=1.95 failure cluster: is the constraint stop numerical or model-driven?
  { const failing = JSON.parse(fs.readFileSync(path.join(OUT, 'd2-ver-failsafe.json'), 'utf8')).summary.failing;
    const probe = (c, P, dt = 0.002) => { const { r } = runCase(c, P, dt); return { status: r.status, error: r.error, errorTime: r.errorTime, errorCell: r.errorCell, parityFloored: r.parity.floored, ledgerMax: r.ledger.max, badCells: r.badCells, minTe: r.minCell.Te }; };
    const chi10 = failing.map(f => ({ id: f.id, kappa: f.controls.kappa, gas: f.controls.gas, defaultChi: { errorTime: f.errorTime, errorCell: f.errorCell }, chi10: probe(f.controls, { ...PDEF, chi_e: 10, chi_i: 10 }) }));
    const pick = failing.find(f => f.controls.kappa === 1.95 && f.controls.gas === 0), c = pick.controls;
    const resolution = [];
    for (const [N, dt] of [[32, 0.002], [64, 0.002], [128, 0.002], [256, 0.002], [64, 0.001], [64, 0.0005]]) resolution.push({ N_rho: N, dt, ...probe(c, { ...PDEF, N_rho: N }, dt) });
    const chiScan = [1.5, 3, 5, 7, 10].map(ch => ({ chi: ch, ...probe(c, { ...PDEF, chi_e: ch, chi_i: ch }) }));
    let offStatus = 'completed'; try { runShot(c, geometry(c)); } catch (e) { offStatus = e.message; }
    const done = chi10.filter(x => x.chi10.status === 'completed'), silent = [...chi10.map(x => x.chi10), ...resolution, ...chiScan].filter(x => x.status === 'completed' && (x.parityFloored > 1e-9 || x.ledgerMax > 1e-10 || x.badCells > 0));
    const badGrammar = [...chi10.map(x => x.chi10), ...resolution, ...chiScan].filter(x => x.status !== 'completed' && !REGEX.test(x.error));
    cases.push({ id: 'ADV-3', title: 'LIMITS corners that throw (kappa=1.95 cluster): chi raised to the range maximum, N_rho and dt refinement', input: `all ${failing.length} failing AC-9 corners at chi_e=chi_i=10; corner ${pick.id} ${JSON.stringify(c)} at N_rho 32..256 and dt 0.002..0.0005, chi 1.5..10`,
      expected: 'every run completes with floored parity <= 1e-9, ledger <= 1e-10 and positive finite cells, or throws the fixed-grammar constraint error; a model-driven stop should persist under grid/dt refinement at a converging time and be removed by stronger edge conduction',
      observed: { completedAtChi10: done.length, of: failing.length, chi10, resolution, chiScan, profileOffStatus: offStatus, silentViolations: silent.length, badGrammar: badGrammar.length }, verdict: silent.length === 0 && badGrammar.length === 0 ? 'pass' : 'fail' });
  }
  // ADV-4: conservation at the extremes of the option ranges
  { const opts = [
      ['narrow edge ECH, narrow NBI, coarse grid', { ...PDEF, N_rho: 16, D: 0.03, chi_e: 1.5, chi_i: 1.5, rho_NBI: 0.7, sigma_NBI: 0.1, rho_ECH: 0.8, sigma_ECH: 0.05, gas_exponent: 8, jshape_gamma: 2 }],
      ['central wide deposition, finest grid, max transport', { ...PDEF, N_rho: 256, D: 1, chi_e: 10, chi_i: 10, rho_NBI: 0, sigma_NBI: 0.4, rho_ECH: 0, sigma_ECH: 0.25, gas_exponent: 2, jshape_gamma: 0 }],
      ['asymmetric chi_e min / chi_i max', { ...PDEF, N_rho: 128, chi_e: 1.5, chi_i: 10, D: 0.03 }]];
    const ctl = [['DEFAULT', { ...DEFAULT }], ['max heating ip=1.5 nbi=6', { ...DEFAULT, ip: 1.5, nbi: 6 }]];
    const rows = [];
    for (const [ol, P] of opts) for (const [cl, c] of ctl) { const { r } = runCase(c, P, 0.002); rows.push({ options: ol, controls: cl, status: r.status, error: r.error, parityFloored: r.parity.floored, parityUnfloored: r.parity.max, ledgerMax: r.ledger.max, speciesTotalMax: r.totals.max, shapeNormProdMaxDev: r.shapeNormProd.maxDev, axisNonZero: r.axisNonZero, badCells: r.badCells, preMismatch: r.preMismatch, internal: r.internal.length }); }
    const ok = rows.every(x => (x.status === 'completed' ? x.parityFloored <= 1e-9 && x.ledgerMax <= 1e-10 && x.speciesTotalMax <= 1e-10 && x.shapeNormProdMaxDev <= 1e-13 && x.axisNonZero === 0 && x.badCells === 0 : REGEX.test(x.error)) && x.preMismatch === 0 && x.internal === 0);
    cases.push({ id: 'ADV-4', title: 'Conservation, ledger and shape normalisation at the corners of the profile option ranges', input: opts.map(o => `${o[0]}: ${JSON.stringify(o[1])}`).join(' | ') + ' x controls DEFAULT and ip=1.5,nbi=6; dt=0.002', expected: 'completing runs: floored parity <= 1e-9, own-oracle ledger and species totals <= 1e-10, shape norms <= 1e-13, axis flux Object.is 0, all cells finite positive, oracle pre-state == production pre-state; else explicit constraint error', observed: rows, verdict: ok ? 'pass' : 'fail' });
  }
  // ADV-5: off-path guarantee under hostile call sequences (leaked state, hook leakage, input mutation)
  { const ref = read('experiments/baseline/m01-regression.json').cases.find(e => e.name === 'default' || JSON.stringify(e.c) === JSON.stringify(DEFAULT)) ?? read('experiments/baseline/m01-regression.json').cases[0];
    const c0 = ref.c, g = () => geometry(c0), log = [];
    const cmp = (label, shot) => { const d = deepIs(shot, ref.shot); log.push({ step: label, fieldsCompared: d.compared, differences: d.differences, first: d.first }); };
    cmp('1 fresh off run', runShot(c0, g()));
    const failing = JSON.parse(fs.readFileSync(path.join(OUT, 'd2-ver-failsafe.json'), 'utf8')).summary.failing[0];
    let threw = false; try { runShot(failing.controls, geometry(failing.controls), 0.002, undefined, undefined, PDEF); } catch { threw = true; }
    cmp('2 off run after a profile-on run that threw a constraint error', runShot(c0, g()));
    let hookErr = false, hookCalls = 0; try { withProfileStepObserver(() => { hookCalls++; if (hookCalls === 10) throw new Error('hostile hook'); }, () => runShot(c0, g(), 0.002, undefined, undefined, PDEF)); } catch (e) { hookErr = e.message === 'hostile hook'; }
    let leaked = 0; runShot(c0, g(), 0.002, undefined, undefined, PDEF); // no hook installed now: the hostile hook must not be called again
    leaked = hookCalls - 10;
    let offHookCalls = 0; const offInHook = withProfileStepObserver(() => { offHookCalls++; }, () => runShot(c0, g()));
    cmp('3 off run inside withProfileStepObserver', offInHook);
    const frozenOpts = Object.freeze({ ...PDEF }), ctlCopy = JSON.stringify(c0), optCopy = JSON.stringify(frozenOpts), mutable = { ...PDEF };
    const onA = runShot(c0, g(), 0.002, undefined, undefined, frozenOpts), onB = runShot(c0, g(), 0.002, undefined, undefined, mutable);
    const inputMutated = JSON.stringify(c0) !== ctlCopy || JSON.stringify(mutable) !== optCopy;
    const onSame = deepIs(onA, onB), optSnap = JSON.parse(JSON.stringify(onB.profiles.options)); mutable.chi_e = 9; const onAfterMutate = deepIs(onB.profiles.options, optSnap); // exported options must not alias the caller's object
    cmp('4 off run after profile-on runs', runShot(c0, g()));
    cmp('5 off run with {enabled:false} after all of the above', runShot(c0, g(), 0.002, undefined, undefined, { enabled: false }));
    const ok = log.every(x => x.differences === 0 && x.fieldsCompared > 0) && threw && hookErr && leaked === 0 && offHookCalls === 0 && !inputMutated && onSame.differences === 0 && onAfterMutate.differences === 0;
    cases.push({ id: 'ADV-5', title: 'Off-path guarantee under hostile sequences: prior throw, throwing observer hook, off run inside the hook scope, frozen/mutated option objects', input: `frozen M02 case '${ref.name}' reference shot; sequence listed in observed.log`, expected: 'every off run Object.is-identical to the frozen reference (0 differences); throwing hook propagates and is uninstalled (0 later calls); off run inside hook scope calls the hook 0 times; inputs not mutated; frozen and mutable option objects give identical profile-on shots; exported options not aliased to the caller object',
      observed: { log, constraintRunThrew: threw, hostileHookPropagated: hookErr, hookCallsAfterScope: leaked, hookCallsDuringOffRun: offHookCalls, inputMutated, frozenVsMutableDifferences: onSame.differences, exportedOptionsAliasDifferences: onAfterMutate.differences }, verdict: ok ? 'pass' : 'fail' });
  }
  const doc = { ...header('AC-10 adversarial cases (validation, beyond AC-4)'), command: `${CMD} adv`, cases, seconds: (performance.now() - t0) / 1000 };
  writeOut('d2-ver-adversarial.json', doc); return doc;
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------
const mode = process.argv[2] ?? 'all';
const T0 = performance.now();
if (mode === 'ac1' || mode === 'all') { const r = ac1(); console.log('AC-1', r.pass, JSON.stringify(r.totals)); }
if (mode === 'sweep' || mode === 'all') {
  const S = sweep(); console.log(`sweep ${S.parityRuns.length} runs in ${S.secs.toFixed(1)} s`);
  const completing = S.parityRuns.filter(x => x.status === 'completed');
  const parity = { ...header('AC-3 / D2-VER-PARITY (validation re-execution, DD-24 normaliser)'), command: `${CMD} sweep`, tolerance: 1e-9, formula: 'judged (DD-24): |sum_i x_i dV_i - X_0D(t)| / max(X_0D(t), X_0D(0)); reported alongside: un-floored |.| / X_0D(t); every accepted step, X = N, We, Wi; dV_i = V(2i-1)/N_rho^2 (own)',
    cases: 'AC-9 138 control sets + five M02 variants + all-zero at chi=5, each x N_rho {32,64,128} x dt {0.004,0.002,0.001}', runs: S.parityRuns.map(x => ({ id: x.id, N_rho: x.N_rho, dt: x.dt, status: x.status, steps: x.steps, parityFloored: x.parityFloored, parityFlooredAt: x.parityFlooredAt, ratioFloored: x.parityFloored / 1e-9, parityUnfloored: x.parityMax, parityAt: x.parityAt, ratioUnfloored: x.parityMax / 1e-9, parityStep0: x.parityStep0, preMismatch: x.preMismatch, internal: x.internal })),
    summary: { runs: S.parityRuns.length, completing: completing.length, threw: S.parityRuns.length - completing.length, maxFlooredCompleting: Math.max(...completing.map(x => x.parityFloored)), maxFlooredAllAcceptedSteps: Math.max(...S.parityRuns.map(x => x.parityFloored)), maxUnflooredCompleting: Math.max(...completing.map(x => x.parityMax)), maxUnflooredAllAcceptedSteps: Math.max(...S.parityRuns.map(x => x.parityMax)), unflooredOver1e9: S.parityRuns.filter(x => x.parityMax > 1e-9).map(x => ({ id: x.id, N_rho: x.N_rho, dt: x.dt, status: x.status, unfloored: x.parityMax, floored: x.parityFloored, absOverX0: x.parityAbsOverX0, at: x.parityAt })), maxStep0: Math.max(...S.parityRuns.map(x => x.parityStep0 ?? 0)), preStateMismatches: S.parityRuns.reduce((s, x) => s + x.preMismatch, 0), internalIssues: S.parityRuns.reduce((s, x) => s + x.internal.length, 0) } };
  parity.pass = parity.summary.maxFlooredAllAcceptedSteps <= 1e-9 && parity.summary.internalIssues === 0;
  writeOut('d2-ver-parity.json', parity);
  const mut = mutations(S.keptDefault);
  const ledger = { ...header('AC-4 / D2-VER-LEDGER (validation re-execution, own oracle)'), command: `${CMD} sweep`, tolerance: { perCell: 1e-10, speciesTotal: 1e-10 },
    oracle: 'makeOracle() in validation/independent/d2-profiles.mjs: restated 0-D rates (waveform, tauE/tauP closure, Pohm, Pbr, gas, beam, ionisation, exchange) from the M02 pre-step totals; restated shapes (Gaussian NBI/ECH, rho^m gas, n^2 sqrt(Te) bremsstrahlung, jt^2 eta(Te) Ohmic) at cell centres normalised on own dV; face fluxes from post-step profiles; edge flux = own N/tauP, We/tauE, Wi/tauE. x^k is the previous accepted post-step state (step 0: own uniform initial state).',
    runs: S.parityRuns.map(x => ({ id: x.id, N_rho: x.N_rho, dt: x.dt, status: x.status, ledgerMax: x.ledgerMax, ledgerAt: x.ledgerAt, speciesTotalMax: x.speciesTotalMax, ratio: x.ledgerMax / 1e-10 })),
    summary: { runs: S.parityRuns.length, maxLedgerCompleting: Math.max(...completing.map(x => x.ledgerMax)), maxLedgerAllAcceptedSteps: Math.max(...S.parityRuns.map(x => x.ledgerMax)), maxSpeciesTotal: Math.max(...S.parityRuns.map(x => x.speciesTotalMax)) }, mutations: mut };
  ledger.pass = ledger.summary.maxLedgerAllAcceptedSteps <= 1e-10 && ledger.summary.maxSpeciesTotal <= 1e-10 && mut.allRejected;
  writeOut('d2-ver-ledger.json', ledger);
  // AC-7 on DEFAULT (base grid)
  const dr = S.keptDefault.r;
  const struct = { axisNonZero: dr.axisNonZero, edgeDeliveredMaxRel: dr.edgeDelivered.maxRel, edgeDeliveredAt: [dr.edgeDelivered.step, dr.edgeDelivered.species], edgeTol: 1e-12, prescribedOwnVsExportedMaxRel: dr.prescribedVsExported.maxRel, shapeNormProdMaxDev: dr.shapeNormProd.maxDev, shapeNormOwnMaxDev: dr.shapeNormOwn.maxDev, shapeTol: 1e-13, steps: dr.steps };
  fs.writeFileSync(path.join(OUT, '.ac7-default.json'), JSON.stringify(struct));
  // AC-2
  const pas = { ...header('AC-2 passenger (validation re-execution)'), command: `${CMD} sweep`, tolerance: '0 differing original Shot fields (Object.is deep), modelVersion and profiles excepted', runs: S.passenger,
    summary: { casesCompared: S.passenger.filter(x => x.originalFieldsCompared).length, differingFields: S.passenger.reduce((s, x) => s + (x.differingFields ?? 0), 0), leavesCompared: S.passenger.reduce((s, x) => s + (x.leavesCompared ?? 0), 0), keyOrderFailures: S.passenger.filter(x => x.originalFieldsCompared && !x.keysOk).length, modelVersionWrong: S.passenger.filter(x => x.originalFieldsCompared && (x.modelVersionOn !== '0.2.0' || x.modelVersionOff !== '0.1.0' || x.schemaVersionOn !== 1)).length } };
  pas.pass = pas.summary.differingFields === 0 && pas.summary.keyOrderFailures === 0 && pas.summary.modelVersionWrong === 0 && pas.summary.casesCompared > 0;
  writeOut('d2-ver-passenger.json', pas);
  // AC-9 sweep
  const sw = S.sweepRuns; const done = sw.filter(x => x.status === 'completed'), thr = sw.filter(x => x.status !== 'completed');
  const silent = done.filter(x => x.parityFloored > 1e-9 || x.ledgerMax > 1e-10 || x.badCells > 0 || x.exportedBadValues > 0);
  const badThrows = thr.filter(x => !x.grammarOk || !x.acceptedStepsConsistent);
  const fsafe = { ...header('AC-9 / D2-VER-FAILSAFE (iii) sweep, own driver'), command: `${CMD} sweep`, driver: 'sweepCases() in validation/independent/d2-profiles.mjs: DEFAULT; ip {0.9,1.2,1.5} x nbi {2,4,6} (expand_cases order, ip outer); 128 LIMITS corners (bit b of the corner index selects max of LIMITS key b in order ip,bt,nbi,ech,gas,kappa,delta)', settings: { N_rho: 64, dt: 0.002, coefficients: 'defaults' }, regex: REGEX.source,
    runs: sw, summary: { runs: sw.length, completed: done.length, threw: thr.length, silentViolations: silent.length, badThrows: badThrows.length, defaultCompleted: sw[0].id === 'DEFAULT' && sw[0].status === 'completed', maxParityFlooredCompleted: Math.max(...done.map(x => x.parityFloored)), maxParityUnflooredCompleted: Math.max(...done.map(x => x.parityMax)), maxLedgerCompleted: Math.max(...done.map(x => x.ledgerMax)), edgeClipFlagsTotal: done.reduce((s, x) => s + x.edgeClipFlags, 0), minTeCompleted: Math.min(...done.map(x => x.minCell.Te)), minTiCompleted: Math.min(...done.map(x => x.minCell.Ti)), failing: thr.map(x => ({ id: x.id, controls: x.controls, errorTime: x.errorTime, errorCell: x.errorCell, error: x.error, profileOffStatus: x.profileOffStatus })) } };
  fsafe.pass = sw.length === 138 && silent.length === 0 && badThrows.length === 0 && fsafe.summary.defaultCompleted;
  writeOut('d2-ver-failsafe.json', fsafe);
  // AC-8 diagnostics
  const baseShots = [S.keptDefault.shot];
  { for (const d of [{ nbi: 0 }, { gas: 0 }, { nbi: 8 }, { gas: 5 }]) { try { baseShots.push(runShot({ ...DEFAULT, ...d }, geometry({ ...DEFAULT, ...d }), 0.002, undefined, undefined, PDEF)); } catch { /* reported in parity */ } } }
  const dg = diagnostics(S.keptDefault, baseShots);
  writeOut('d2-ver-diagnostics.json', { ...header('AC-8 / D2-VER-DIAGNOSTICS (validation re-execution)'), command: `${CMD} sweep`, ...dg });
  console.log('AC-2', pas.pass, JSON.stringify(pas.summary)); console.log('AC-3', parity.pass, JSON.stringify(parity.summary)); console.log('AC-4', ledger.pass, JSON.stringify(ledger.summary), 'mut minRatio', mut.minRatio);
  console.log('AC-8', dg.pass, dg.maxRel); console.log('AC-9', fsafe.pass, JSON.stringify({ ...fsafe.summary, failing: fsafe.summary.failing.length })); console.log('AC-7 default', JSON.stringify(struct));
}
if (mode === 'fixtures' || mode === 'all') {
  const F = fixtures();
  const f7 = path.join(OUT, '.ac7-default.json'), since = Date.now() - performance.now();
  for (let w = 0; w < 600 && !(fs.existsSync(f7) && fs.statSync(f7).mtimeMs > since); w++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000); // wait for this session's sweep
  const ac7def = JSON.parse(fs.readFileSync(path.join(OUT, '.ac7-default.json'), 'utf8'));
  const res = { ...header('AC-7 structure (validation re-execution)'), command: `${CMD} fixtures`, default: ac7def, fixtures: F,
    tolerances: { a: 'Object.is(axisFlux, 0) every species every step', b: 'DD-25: |delivered - prescribed| <= 1e-12 * max(|prescribed|, flux scale) + 100 eps M dV_N/dt (reconstructed); production-reported face flux for a prescribed 0 is Object.is 0', c: '|sum h_i dV_i - 1| <= 1e-13', d: 'values within [min u0 - 1e-14 M, max u0 + 1e-14 M] incl. Dirichlet boundary value' } };
  res.sub = {
    a: ac7def.axisNonZero === 0 && F.every(f => f.axisNonZero === 0),
    b_default: ac7def.edgeDeliveredMaxRel <= 1e-12, b_fixtures: F.map(f => ({ name: f.name, ratioDD25: f.edgeFluxDD25.maxRatio, ratioPreDD25: f.edgeFlux.maxRatio, worstDD25: f.edgeFluxDD25.worst, productionZeroFlux: f.productionZeroFlux, pass: f.edgeFluxDD25.maxRatio <= 1 && f.productionZeroFlux.nonExactZero === 0 })),
    c: ac7def.shapeNormProdMaxDev <= 1e-13 && ac7def.shapeNormOwnMaxDev <= 1e-13,
    d: F.filter(f => f.dmp).map(f => ({ name: f.name, maxViolationOverM: f.dmp.maxViolationOverM, pass: f.dmp.pass })),
    nonNegativitySourceDrivenF1: F.filter(f => f.nonNegativityPass !== undefined).every(f => f.nonNegativityPass) };
  res.pass = res.sub.a && res.sub.b_default && res.sub.b_fixtures.every(x => x.pass) && res.sub.c && res.sub.d.every(x => x.pass) && res.sub.nonNegativitySourceDrivenF1;
  writeOut('d2-ver-structure.json', res);
  console.log('AC-7', res.pass, JSON.stringify(res.sub));
  for (const f of F) console.log(f.name, f.seconds.toFixed(1) + 's', 'steps', f.stepsRun, 'edgeRatio', f.edgeFlux.maxRatio, 'DD25', f.edgeFluxDD25.maxRatio, 'prodZero', JSON.stringify(f.productionZeroFlux), 'dmp', f.dmp?.maxViolationOverM, 'L2', f.informationalL2rel);
}
if (mode === 'probe') { // F3 delivered-edge-flux marginal: smallest-dt probe inside the fixture's allowed range (dt <= 1e-6)
  const N = 256, cav = f => Array.from({ length: N }, (_, k) => cellAvgGL(f, k / N, (k + 1) / N)), u = cav(r => J0(B1 * r));
  const f = runFixture('F3 EIGEN-REFLECT N=256 dt=2.5e-7 t=1 (probe)', { N_rho: N, V: 1, L2: 1, D: 1, chi_e: 1, chi_i: 1, dt: 2.5e-7, steps: 4000000, energyConst: 1, n0: new Array(N).fill(1), we0: u, wi0: u, freezeN: true, edge: { type: 'flux', value: 0 }, enforceConstraint: false }, ['we', 'wi'], { boundary: [] });
  f.informationalL2rel = L2rel(f.final.we, u.map(x => x * Math.exp(-B1 * B1)), f.dV); delete f.final; delete f.dV;
  writeOut('d2-ver-structure-f3-probe.json', { ...header('AC-7(b) F3 edge-flux marginal probe'), command: `${CMD} probe`, tolerance: 'DD-25: |delivered - 0| <= 1e-12 * flux scale + 100 eps M dV_N/dt; production face flux Object.is 0', fixture: f, pass: f.edgeFluxDD25.maxRatio <= 1 && f.productionZeroFlux.nonExactZero === 0 && f.dmp.pass });
  console.log(f.name, f.seconds.toFixed(1) + 's', 'edgeRatio', f.edgeFlux.maxRatio, 'DD25', f.edgeFluxDD25.maxRatio, JSON.stringify(f.edgeFluxDD25.worst), JSON.stringify(f.productionZeroFlux), 'dmp', f.dmp.maxViolationOverM);
}
if (mode === 'ac5') { const r = ac5(); console.log('AC-5 steady', r.steady.pass, 'F2', r.f2.L2rel_we, r.f2.pass, 'F3', r.f3.L2rel_we, r.f3.pass, JSON.stringify(r.f3.uniformCompanion), 'F4', r.f4.L2rel_we, r.f4.pass, JSON.stringify(r.besselSanity)); }
if (mode === 'rates') { const r = rates(); console.log('AC-6', r.pass, JSON.stringify(r.fixtures.map(f => [f.fixture, f.spatial.map(x => x.p), f.temporal.map(x => x.p)])), JSON.stringify(r.defaultShot.map(q => [q.t, q.cell, q.rates.map(x => x.p)]))); }
if (mode === 'adv') { const r = adversarial(); for (const c of r.cases) console.log(c.id, c.verdict); }
if (mode === 'assemble') {
  const { fingerprint } = await import('../../tools/workflow.mjs');
  const ev = n => JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8'));
  const files = fs.readdirSync(OUT).filter(n => n.endsWith('.json')).sort();
  const hashes = Object.fromEntries(files.map(n => [`validation/evidence/d2-profiles/${n}`, sha(fs.readFileSync(path.join(OUT, n)))]));
  const off = ev('d2-ver-offpath.json'), pas = ev('d2-ver-passenger.json'), par = ev('d2-ver-parity.json'), led = ev('d2-ver-ledger.json'), st = ev('d2-ver-structure.json'), dg = ev('d2-ver-diagnostics.json'), fsf = ev('d2-ver-failsafe.json');
  const probe = ev('d2-ver-structure-f3-probe.json'), ste = ev('d2-ver-steady.json'), f2 = ev('d2-ver-eigen-dirichlet.json'), f3 = ev('d2-ver-eigen-reflect.json'), f4 = ev('d2-ver-mms-conduction.json'), ref = ev('d2-ver-refinement.json'), adv = ev('d2-ver-adversarial.json');
  const suite = JSON.parse(process.env.SUITE_EVIDENCE ?? 'null');
  const f3Edge = [...st.sub.b_fixtures.filter(x => x.name.startsWith('F3')), { name: probe.fixture.name, ratioDD25: probe.fixture.edgeFluxDD25.maxRatio, ratioPreDD25: probe.fixture.edgeFlux.maxRatio, worstDD25: probe.fixture.edgeFluxDD25.worst, productionZeroFlux: probe.fixture.productionZeroFlux, pass: probe.pass }]
    .map(x => ({ fixture: x.name, reconstructedRatioUnderDD25Bound: x.ratioDD25, ratioAgainstPreDD25Bound_1e12Only: x.ratioPreDD25, worst: x.worstDD25, productionFaceFluxExactZero: `${x.productionZeroFlux.checked - x.productionZeroFlux.nonExactZero}/${x.productionZeroFlux.checked} steps x species Object.is 0`, pass: x.pass }));
  const f3r = ref.fixtures.find(f => f.fixture === 'F3'), f2r = ref.fixtures.find(f => f.fixture === 'F2'), f4r = ref.fixtures.find(f => f.fixture === 'F4');
  const rateRow = f => ({ spatial: f.spatial.map(x => ({ N: x.N, e: x.e, p: x.p, pass: x.pass })), temporal: f.temporal.map(x => ({ dt: x.dt, d: x.d, p: x.p, pass: x.pass })) });
  const ac5pass = ste.pass && f2.pass && f3.pass && f4.pass && f3r.spatial.every(x => x.passOuterDD6) && f3r.temporal.every(x => x.passOuterDD6);
  const checks = [
    { id: 'AC-1', title: 'off path', command: `${CMD} ac1; node --experimental-strip-types --test tests/api.test.mjs tests/capability-policy.test.mjs tests/jev-gate.test.mjs tests/m02.test.mjs tests/physics.test.mjs; python3 -m unittest discover -s python/tests; git diff 99b6a1f HEAD -- <those tests> (empty)`,
      measured: { runs: off.totals.runs, leafFieldsCompared: off.totals.fieldsCompared, differences: off.totals.differences, nonBooleanEnabledThrows: `${off.nonBooleanEnabled.filter(x => x.threw).length}/${off.nonBooleanEnabled.length}`, existingSuites: suite },
      tolerance: 'Object.is deep, 0 differences, modelVersion 0.1.0, schemaVersion 1, no profiles key; existing suites unchanged and passing', verdict: off.pass && suite?.pass ? 'pass' : 'fail', evidence: 'validation/evidence/d2-profiles/d2-ver-offpath.json' },
    { id: 'AC-2', title: 'passenger', command: `${CMD} sweep`, measured: pas.summary, tolerance: '0 differing original Shot fields', verdict: pas.pass ? 'pass' : 'fail', evidence: 'validation/evidence/d2-profiles/d2-ver-passenger.json' },
    { id: 'AC-3', title: 'integral parity (DD-24 normaliser)', command: `${CMD} sweep`,
      measured: { runs: par.summary.runs, completing: par.summary.completing, maxFlooredAllAcceptedSteps: par.summary.maxFlooredAllAcceptedSteps, maxUnflooredAllAcceptedSteps: par.summary.maxUnflooredAllAcceptedSteps, unflooredOver1e9: par.summary.unflooredOver1e9, maxStep0: par.summary.maxStep0, preStateMismatches: par.summary.preStateMismatches },
      tolerance: '|sum x dV - X_0D(t)| / max(X_0D(t), X_0D(0)) <= 1e-9 every step, N_rho {32,64,128} x dt {0.004,0.002,0.001}, every completing AC-9 case (+ M02 variants, all-zero chi=5); un-floored ratio reported, not judged (DD-24)',
      verdict: par.pass ? 'pass' : 'fail', note: `Re-verdict under DD-24 from a full re-run (1296 runs). Floored maximum ${par.summary.maxFlooredAllAcceptedSteps.toExponential(3)} (margin ${(1e-9 / par.summary.maxFlooredAllAcceptedSteps).toFixed(1)}x). Un-floored maximum ${par.summary.maxUnflooredAllAcceptedSteps.toExponential(4)} still exceeds 1e-9 in exactly one run (corner-0001001, N_rho=128, dt=0.002, last step, W_i), whose floored value is 1.77e-11: the Part A failure is amplification by a 100x-decayed inventory, as DD-24 states. Pass is conditional on the DD-24 amendment; under the pre-amendment normaliser this run would still fail.`, evidence: 'validation/evidence/d2-profiles/d2-ver-parity.json' },
    { id: 'AC-4', title: 'ledger and anti-tautology (own oracle)', command: `${CMD} sweep`, measured: { ...led.summary, mutationStep: led.mutations.step, rClean: led.mutations.rClean, shapeBound: led.mutations.shapeBound, mutations: led.mutations.rows.map(r => ({ mutation: r.mutation, residual: r.residual, bound: r.bound, ratio: r.ratio, rejected: r.rejected })) },
      tolerance: 'per-cell and species-total <= 1e-10; mutations (a),(b) residual >= 1e-8; (c) >= max(1e-10, 100 r_clean) (DD-20)', verdict: led.pass ? 'pass' : 'fail', marginal: `bremsstrahlung shape mutation ratio ${led.mutations.rows.find(r => r.mutation.includes('br')).ratio.toFixed(3)} (rejected with ~2x margin); ADV-1 shows step 750 is the worst sampled step for it`, evidence: 'validation/evidence/d2-profiles/d2-ver-ledger.json' },
    { id: 'AC-5', title: 'analytic fixtures (own cell averages, 10-node Gauss-Legendre per cell, own J0 power series, verification-only kernel entry)', command: `${CMD} ac5; ${CMD} rates`,
      measured: { F1_steady: ste.runs.map(r => ({ fixture: r.fixture, N_rho: r.N_rho, L2rel: r.L2rel, stepsRun: r.stepsRun, stopRuleReached: r.stopRuleReached, axisFaceFluxNonZero: r.axisFaceFluxNonZero })),
        F2_dirichlet: { N_rho: 256, dt: 2e-6, L2rel_we: f2.L2rel_we, L2rel_wi: f2.L2rel_wi, pointValueRho0p5_reportedNotJudged: f2.pointValueRho0p5, dmpMaxViolationOverM: f2.run.dmp.maxViolationOverM },
        F3_reflect: { N_rho: 256, dt: 1e-6, L2rel_we: f3.L2rel_we, L2rel_wi: f3.L2rel_wi, uniformCompanionRelChange: f3.uniformCompanion.relChange, edgeFluxProductionExactZero: `${f3.edgeFlux.productionReported.checked - f3.edgeFlux.productionReported.nonExactZero}/${f3.edgeFlux.productionReported.checked}`, edgeFluxReconstructedDD25Ratio: f3.edgeFlux.reconstructedDD25.maxRatio, rates: rateRow(f3r) },
        F4_mms: { N_rho: 128, dt: 1e-5, L2rel_we: f4.L2rel_we, L2rel_wi: f4.L2rel_wi, ownSourceResidualFD: f4.sourceResidualOwnFD.max } },
      tolerance: 'F1 L2rel <= 1e-6 (9 runs), stop rule within 2000 steps, axis flux exactly 0; F2 L2rel <= 1e-4 and DMP; F3 L2rel <= 1e-3 AND p_x in [1.6,2.4] (3 rates) AND p_t in [0.8,1.2] (2 rates) AND uniform total <= 1e-12 AND edge flux (production exactly 0; reconstructed <= DD-25 bound); F4 L2rel <= 1e-4',
      ratios: { F1_worst: Math.max(...ste.runs.map(r => r.L2rel)) / 1e-6, F2: f2.ratio, F3: f3.ratio, F4: f4.ratio }, verdict: ac5pass ? 'pass' : 'fail',
      note: `Closest to its limit: F2 at ${(f2.ratio).toFixed(3)} of 1e-4 (margin ${(1 / f2.ratio).toFixed(2)}x), as the spec anticipated.`, evidence: 'validation/evidence/d2-profiles/d2-ver-steady.json, d2-ver-eigen-dirichlet.json, d2-ver-eigen-reflect.json, d2-ver-mms-conduction.json, d2-ver-refinement.json' },
    { id: 'AC-6', title: 'convergence rates', command: `${CMD} rates`,
      measured: { F2: rateRow(f2r), F3: rateRow(f3r), F4: rateRow(f4r), defaultShot: ref.defaultShot.map(q => ({ t: q.t, cell: q.cell, Te: q.Te, rates: q.rates.map(r => r.p) })), ratesReported: ref.counts },
      tolerance: 'spatial [1.8,2.2] (N_rho 32..256, Richardson time-error removal at dt 1e-5/5e-6); temporal fixtures [0.85,1.15] (dt 4e-5..5e-6, N_rho 256 for F2/F3, 128 for F4); default shot [0.7,1.3] (dt 0.004..0.0005, N_rho 64, first/last-cell T_e at 0.5, 2, 3, 4.5 s)', verdict: ref.pass ? 'pass' : 'fail',
      note: 'All 31 rates computed (15 fixture + 16 default-shot), none exempted as roundoff-limited. Extremes: fixture spatial 1.940 (F4, 32/64) to 2.009 (F3, 32/64); fixture temporal 1.000-1.002; default shot 0.976-1.182 (last-cell T_e at 0.5 s, 0.004/0.002/0.001 triple).', evidence: 'validation/evidence/d2-profiles/d2-ver-refinement.json' },
    { id: 'AC-7', title: 'structure (a)-(d), DD-25 edge bound', command: `${CMD} fixtures; ${CMD} probe`, measured: { default: st.default, a_axisFluxNonExactZeroCount: { default: st.default.axisNonZero, fixtures: Object.fromEntries(st.fixtures.map(f => [f.name, f.axisNonZero])), probe: probe.fixture.axisNonZero, tolerance: 0 }, c_shapeNormMaxDeviation: { production: st.default.shapeNormProdMaxDev, ownOracle: st.default.shapeNormOwnMaxDev, tolerance: 1e-13, ratio: Math.max(st.default.shapeNormProdMaxDev, st.default.shapeNormOwnMaxDev) / 1e-13 }, b_default: { edgeDeliveredMaxRel: st.default.edgeDeliveredMaxRel, tolerance: 1e-12, ratio: st.default.edgeDeliveredMaxRel / 1e-12 }, d_dmp: st.sub.d, b_fixtures: st.sub.b_fixtures.map(x => ({ name: x.name, ratioDD25: x.ratioDD25, ratioPreDD25: x.ratioPreDD25, productionZeroFlux: x.productionZeroFlux })), F3_edgeFlux_dt_1e6_5e7_2p5e7: f3Edge },
      tolerance: st.tolerances, verdict: st.pass && probe.pass ? 'pass' : 'fail',
      note: 'Re-verdict under DD-25 from a full re-run. F3 reconstructed-flux ratio against the amended bound: ' + f3Edge.map(x => `${x.fixture.replace(/ t=1.*$/, '')}: ${x.reconstructedRatioUnderDD25Bound.toExponential(2)} (pre-DD-25 ${x.ratioAgainstPreDD25Bound_1e12Only.toFixed(3)})`).join('; ') + '. The production-reported face flux for the prescribed 0 is Object.is 0 on every step and species. Pass is conditional on the DD-25 amendment; against the pre-amendment 1e-12-only bound the dt=2.5e-7 run still fails (1.83).', evidence: 'validation/evidence/d2-profiles/d2-ver-structure.json, d2-ver-structure-f3-probe.json' },
    { id: 'AC-8', title: 'diagnostics', command: `${CMD} sweep`, measured: { maxRelA6: dg.maxRel, samples: dg.samples.map(s => s.t), gridOk: dg.gridOk, anchors: dg.anchors.map(a => ({ id: a.id, pass: a.pass, errBr: a.errBr, errOhm: a.errOhm, errorRatio: a.errorRatio, maxRel: a.maxRel, rel256: a.runs?.[256]?.relErr, rel64: a.runs?.[64]?.relErr })) },
      tolerance: 'A6 <= 1e-9 relative (1e-15 abs at 0), clip flags exact; A1 1e-12; A2/A3 2e-4 at N=256 with ratio >= 4; A4 1e-12; A5 1e-9', verdict: dg.pass ? 'pass' : 'fail', evidence: 'validation/evidence/d2-profiles/d2-ver-diagnostics.json' },
    { id: 'AC-9', title: 'sweep (own driver)', command: `${CMD} sweep`, measured: fsf.summary, tolerance: '138 runs; completions floored parity <= 1e-9 (DD-24), ledger <= 1e-10, finite positive; throws match regex; 0 silent violations; DEFAULT completes', verdict: fsf.pass ? 'pass' : 'fail',
      note: 'Pattern as recorded in DD-26: 31 corners throw (29 at kappa=1.95 & gas=0, 1 at kappa=1.95 & gas=8, 1 at kappa=1 & gas=0 [corner-0001100, T_e at t=1.016 s]); the all-minimum corner completes. ADV-3 examines the cluster.', evidence: 'validation/evidence/d2-profiles/d2-ver-failsafe.json' },
  ];
  const nine = checks.every(c => c.verdict === 'pass'), advOk = adv.cases.length >= 3 && adv.cases.every(c => c.verdict.startsWith('pass'));
  checks.push({ id: 'AC-10', title: 'independent falsification', command: `${CMD} ac1|sweep|fixtures|probe|ac5|rates|adv|assemble`, measured: { reExecutedChecksPassing: checks.filter(c => c.verdict === 'pass').length, of: 9, adversarialCases: adv.cases.length, adversarialVerdicts: Object.fromEntries(adv.cases.map(c => [c.id, c.verdict])), validationModel: 'claude-opus', softwareModel: 'claude-sonnet' },
    tolerance: 'all nine AC-1..AC-9 pass from own code; >= 3 adversarial cases with input/expected/observed/verdict; validation model claude-opus != software claude-sonnet; validate-stage Jev audit PASS (recorded by the Director/TeamFlow eval, outside this file)', verdict: nine && advOk ? 'pass (pending validate-stage Jev audit)' : 'fail' });
  const doc = { unit: 'd2-profiles', stage: 'validate', part: 'B (final, supersedes Part A file)', validationModel: 'claude-opus', ownAgentId: 'validation lane (claude-opus), TeamFlow d2-profiles validate parts A and B', implementationAgentId: 'software lane (claude-sonnet), TeamFlow d2-profiles implement', modelIndependence: 'claude-opus (validation) differs from claude-sonnet (software implementation)',
    bindingDecisionsApplied: ['DD-24 (AC-3 normaliser max(X_0D(t), X_0D(0)), un-floored reported)', 'DD-25 (AC-7(b) roundoff floor 100 eps M dV_N/dt for reconstructed fluxes; production face flux exactly 0)', 'DD-26 (AC-9 informational note)'],
    sourceFingerprint: fingerprint(), physicsSha256: physicsHashes(), harness: { path: 'validation/independent/d2-profiles.mjs', sha256: sha(fs.readFileSync(import.meta.filename)), imports: 'physics/engine.ts (runShot, geometry, DEFAULT, LIMITS), physics/profiles.ts (withProfileStepObserver, runProfileKernel, evaluateDiagnostics, edgeValue); nothing from tests/' },
    node: process.version, generated: new Date().toISOString(), runtime: process.env.RUNTIME_NOTE ?? null, checks,
    adversarialCases: adv.cases.map(c => ({ id: c.id, title: c.title, input: c.input, expected: c.expected, observed: c.id === 'ADV-3' ? { completedAtChi10: c.observed.completedAtChi10, of: c.observed.of, resolution: c.observed.resolution.map(r => ({ N_rho: r.N_rho, dt: r.dt, status: r.status, errorTime: r.errorTime, errorCell: r.errorCell })), chiScan: c.observed.chiScan.map(r => ({ chi: r.chi, status: r.status, errorTime: r.errorTime })), stillThrowingAtChi10: c.observed.chi10.filter(x => x.chi10.status !== 'completed').map(x => ({ id: x.id, error: x.chi10.error })), profileOffStatus: c.observed.profileOffStatus, silentViolations: c.observed.silentViolations, badGrammar: c.observed.badGrammar } : c.id === 'ADV-1' ? { brMinRatio: c.observed.brMinRatio, brMinAtStep: c.observed.brMinAtStep, perStep: c.observed.rows.map(r => ({ step: r.step, t: r.t, ratios: r.ratios })), undetectedActiveTerms: c.observed.undetectedActiveTerms, inactiveTermsNotJudged: c.observed.inactiveTermsNotJudged } : c.observed, verdict: c.verdict, note: c.note })),
    marginalOrConditional: [
      'AC-3 passes only under the DD-24 normaliser; the un-floored ratio is 1.1156e-9 > 1e-9 in one run (corner-0001001, N_rho=128, dt=0.002).',
      'AC-7(b) passes only under the DD-25 roundoff floor; the pre-amendment ratio at dt=2.5e-7 is 1.83.',
      'AC-4 bremsstrahlung shape mutation is rejected by ratio 2.12 (the weakest of all mutations; also the minimum over the whole shot, ADV-1).',
      'AC-5 F2 L2rel 7.57e-5 against 1e-4 (margin 1.32x), as anticipated by the spec.',
      'ADV-3: the kappa=1.95 constraint stop moves with N_rho (t_stop 2.080, 1.894, 1.812, 1.772 s at N_rho 32, 64, 128, 256; differences halve, first-order convergence to about 1.73 s) and is insensitive to dt (1.894, 1.899, 1.901 s); chi=10 removes it in 29 of 31 corners. It is a property of the converged discrete model (prescribed edge loss Wi/tauE draining the edge cell faster than conduction resupplies it), not a timestep artefact; the stop time at the default N_rho=64 carries a ~9% resolution error.'],
    summary: { pass: checks.filter(c => c.verdict.startsWith('pass')).map(c => c.id), fail: checks.filter(c => c.verdict === 'fail').map(c => c.id), overall: nine && advOk ? 'PASS (AC-1..AC-9 pass from own code under DD-24/DD-25; 5 adversarial cases pass; AC-10 pending the validate-stage Jev audit)' : 'FAIL' },
    evidenceSha256: hashes, limits: ['Parity and ledger checks verify implementation consistency with the 0-D balances, not physical accuracy of profile shapes (spec s9).', 'The oracle restates the 0-D formulas from the spec and 0.1.0 code reading; a shared misreading of an unchanged 0.1.0 formula would not be caught by AC-4 (it is caught for totals by AC-3 against the authoritative 0-D state).', 'Analytic fixtures test the transport operator and boundary closures on normalised or SI fixtures; they do not validate transport coefficients, which remain illustrative and uncalibrated.', 'Part A evidence files are superseded by this run; the Part A falsification file is not retained under validation/.'] };
  fs.writeFileSync(path.join(root, 'validation/evidence/d2-profiles-falsification.json'), JSON.stringify(doc, null, 2) + '\n');
  console.log(JSON.stringify(doc.summary));
}
console.log(`total ${((performance.now() - T0) / 1000).toFixed(1)} s`);
