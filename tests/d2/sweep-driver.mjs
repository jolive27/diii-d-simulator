// D2-VER-FAILSAFE (iii): TypeScript sweep driver (DD-7, DD-16). Enumerates DEFAULT, the nine-case C1 grid of `expand_cases`
// (python/d3gate/sweep.py: ip in {0.9,1.2,1.5} x nbi in {2,4,6} on the DEFAULT controls) and the 2^7 corners of the LIMITS box,
// 1 + 9 + 128 = 138 runs; default coefficients, N_rho = 64, dt = 0.002. The Python harness is not used for profile-on runs.
import { DEFAULT, LIMITS, geometry, runShot } from '../../physics/engine.ts';
import { traceRun } from './trace.mjs';
import { deepIs } from './util.mjs';

export const SWEEP = { N_rho: 64, dt: 0.002, chi: 3 };
const IP_VALUES = [0.9, 1.2, 1.5], NBI_VALUES = [2, 4, 6];
export function sweepCases() {
  const cases = [{ id: 'DEFAULT', group: 'default', controls: { ...DEFAULT } }];
  for (const ip of IP_VALUES) for (const nbi of NBI_VALUES) cases.push({ id: `grid ip=${ip} nbi=${nbi}`, group: 'C1-grid', controls: { ...DEFAULT, ip, nbi } });
  const keys = Object.keys(LIMITS);
  for (let m = 0; m < 2 ** keys.length; m++) {
    const controls = Object.fromEntries(keys.map((k, b) => [k, LIMITS[k][(m >> b) & 1]]));
    cases.push({ id: `corner ${String(m).padStart(3, '0')} (${keys.map((k, b) => `${k}=${controls[k]}`).join(',')})`, group: 'LIMITS-corner', controls });
  }
  return cases;
}
const ORIGINAL = ['schemaVersion', 'controls', 'volume', 'dt', 'samples', 'assumptions'];
/** One sweep run: status completed|threw, the error text/time/cell, and for completions the parity and ledger maxima. Never throws for model-level failures. */
export function runSweepCase(sc) {
  const rec = { id: sc.id, group: sc.group, controls: sc.controls };
  let tr;
  try { tr = traceRun({ c: sc.controls, chi: SWEEP.chi }, SWEEP.N_rho, SWEEP.dt, true); } catch (e) { return { ...rec, status: 'threw', kind: 'unexpected (not a model error)', error: `${e.message}`, unexpected: true }; }
  if (tr.threw) {
    const m = tr.threw.message.match(/^profile constraint violated at t=(\d+\.\d{6}) s in cell (\d+): (n|T_e|T_i) (<= 0|nonfinite)$/);
    return { ...rec, status: 'threw', kind: 'profile constraint', error: tr.threw.message, t: m ? Number(m[1]) : null, cell: m ? Number(m[2]) : null, quantity: m ? m[3] : null, acceptedSteps: tr.steps, parityMaxAcceptedSteps: tr.par.max };
  }
  // A completing profile-on run must be a pure passenger of its profile-off run (AC-2).
  const off = runShot(sc.controls, geometry(sc.controls), SWEEP.dt), on = tr.shot;
  const d = deepIs(Object.fromEntries(ORIGINAL.map(k => [k, on[k]])), Object.fromEntries(ORIGINAL.map(k => [k, off[k]])));
  const worst = (o) => Math.max(o.n, o.we, o.wi);
  return {
    ...rec, status: 'completed', acceptedSteps: tr.steps, parityMax: tr.par.max, ledgerCellMax: worst(tr.led.resid), ledgerTotalMax: worst(tr.led.total), edgeDeliveredMax: worst(tr.led.edgeDelivered),
    nonfinite: tr.scan.nonfinite, nonpositive: tr.scan.nonpositive, axisNonzeroSteps: tr.scan.axisNonzeroSteps, minN: tr.scan.minN, minTe: tr.scan.minTe, minTi: tr.scan.minTi,
    passengerDifferences: d.differences, passengerFieldsCompared: d.compared, profilesModelVersion: on.modelVersion,
  };
}
