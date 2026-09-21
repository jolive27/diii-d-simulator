// Per-run trace of a profile-on shot: parity against the 0-D totals, the independent ledger oracle, positivity/finiteness scan,
// exact-zero axis flux (AC-7a). Shared by PARITY, LEDGER, FAILSAFE and the sweep driver.
import { KEV } from './fixtures.mjs';
import { profileOptions, observedProfileRun } from './util.mjs';
import { dVcell, stepResiduals } from './ledger.mjs';

export function traceRun({ c, chi }, N_rho, dt, ledgerToo) {
  const par = { max: 0, step: -1, quantity: '' }, led = { resid: { n: 0, we: 0, wi: 0 }, total: { n: 0, we: 0, wi: 0 }, edgeDelivered: { n: 0, we: 0, wi: 0 }, edgeWiring: { n: 0, we: 0, wi: 0 }, shapeOracle: 0, shapeProduction: 0 };
  const scan = { nonfinite: 0, nonpositive: 0, axisNonzeroSteps: 0, minN: Infinity, minTe: Infinity, minTi: Infinity };
  const o = profileOptions({ N_rho, chi_e: chi, chi_i: chi }), kc = 1.5 * KEV;
  const tot = (x, V) => { let s = 0; for (let i = 1; i <= N_rho; i++) s += x[i - 1] * dVcell(i, N_rho, V); return s; };
  const { shot, threw, steps } = observedProfileRun(c, dt, o, (rec, obs) => {
    const V = obs.volume;
    if (obs.step === 0) for (const [q, x, X] of [['N', rec.pre.n, obs.initialN], ['We', rec.pre.we, obs.initialWe], ['Wi', rec.pre.wi, obs.initialWi]]) { const e = Math.abs(tot(x, V) - X) / X; if (e > par.max) Object.assign(par, { max: e, step: -1, quantity: `${q} (initial)` }); }
    for (const [q, x, X] of [['N', rec.post.n, obs.postN], ['We', rec.post.we, obs.postWe], ['Wi', rec.post.wi, obs.postWi]]) { const e = Math.abs(tot(x, V) - X) / X; if (e > par.max) Object.assign(par, { max: e, step: obs.step, quantity: q }); }
    if (!(Object.is(rec.axisFlux.n, 0) && Object.is(rec.axisFlux.we, 0) && Object.is(rec.axisFlux.wi, 0))) scan.axisNonzeroSteps++;
    for (let i = 0; i < N_rho; i++) {
      const n = rec.post.n[i], te = rec.post.we[i] / (n * kc), ti = rec.post.wi[i] / (n * kc);
      for (const x of [n, te, ti]) { if (!Number.isFinite(x)) scan.nonfinite++; else if (x <= 0) scan.nonpositive++; }
      scan.minN = Math.min(scan.minN, n); scan.minTe = Math.min(scan.minTe, te); scan.minTi = Math.min(scan.minTi, ti);
    }
    if (!ledgerToo) return;
    const r = stepResiduals(c, o, rec, obs);
    for (const k of ['resid', 'total', 'edgeDelivered', 'edgeWiring']) for (const sp of ['n', 'we', 'wi']) led[k][sp] = Math.max(led[k][sp], r[k][sp]);
    led.shapeOracle = Math.max(led.shapeOracle, r.shapeNormOracle); led.shapeProduction = Math.max(led.shapeProduction, r.shapeNormProduction);
  });
  return { par, led, scan, shot, threw, steps, o };
}
