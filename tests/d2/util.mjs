// Shared helpers for the D2 profile tests: evidence writer, deep Object.is comparison, observed profile runs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DEFAULT, geometry, runShot, educationalTransport } from '../../physics/engine.ts';
import { withProfileStepObserver } from '../../physics/profiles.ts';
export const VERIFICATION_VERSION = '0.3.0';
/** The six frozen control sets of tests/m02.test.mjs line 8. */
export const variants = [{ ...DEFAULT }, { ...DEFAULT, nbi: 0 }, { ...DEFAULT, gas: 0 }, { ...DEFAULT, nbi: 8 }, { ...DEFAULT, gas: 5 }, { ...DEFAULT, nbi: 0, ech: 0, gas: 0 }];
export const allZero = variants[5];
const evidenceDir = new URL('./evidence/', import.meta.url), root = new URL('../../', import.meta.url);
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(new URL(f, root))).digest('hex');
/** One measured quantity: measured/tolerance are numbers; ratio = measured/tolerance; pass iff measured <= tolerance (or >= when lower). */
export function meas(quantity, measured, tolerance, { lower = false } = {}) {
  if (typeof measured !== 'number' || !Number.isFinite(measured)) throw new Error(`Bare or non-finite measurement ${quantity}: ${measured}`);
  const ratio = tolerance === 0 ? (measured === 0 ? 0 : null) : measured / tolerance;
  return { quantity, measured, tolerance, ratio, pass: lower ? measured >= tolerance : measured <= tolerance };
}
/** A two-sided band as two rows (lower and upper bound), each with its own ratio; `exempt` (roundoff, verification s1) reports the number but does not judge it. */
export function band(quantity, value, lo, hi, exempt = false) {
  const rows = [meas(`${quantity} >= ${lo}`, value, lo, { lower: true }), meas(`${quantity} <= ${hi}`, value, hi)];
  if (exempt) for (const r of rows) { r.pass = true; r.exempt = 'both differences <= 1e-10 (roundoff-limited): reported, not judged'; }
  return rows;
}
export function writeEvidence(checkId, file, runs, extra = {}) {
  // `extra.groups` = named arrays of further runs (same format) that also count toward the top-level pass.
  const all = [runs, ...Object.values(extra.groups ?? {})];
  for (const list of all) for (const r of list) { r.pass = r.measurements.every(m => m.pass); if (!r.measurements.length) throw new Error('Run without measurements'); }
  const doc = {
    checkId, physicsModelVersion: '0.2.0 (profiles on); 0.1.0 (profiles off)', verificationVersion: VERIFICATION_VERSION,
    sourceSha256: { 'physics/engine.ts': sha('physics/engine.ts'), 'physics/profiles.ts': sha('physics/profiles.ts') }, nodeVersion: process.version,
    ...extra, runs, pass: all.every(list => list.every(r => r.pass)),
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(new URL(file, evidenceDir), JSON.stringify(doc, null, 1) + '\n');
  return doc;
}
/** Deep Object.is comparison (same key sets and order). Returns {compared, differences, first}. */
export function deepIs(a, b, path = '', acc = { compared: 0, differences: 0, first: undefined }) {
  const diff = () => { acc.differences++; acc.first ??= path; return acc; };
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    if (Array.isArray(a) !== Array.isArray(b)) return diff();
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return diff();
    for (const k of ka) deepIs(a[k], b[k], `${path}.${k}`, acc);
    return acc;
  }
  acc.compared++; if (!Object.is(a, b)) diff();
  return acc;
}
export const profileOptions = (over = {}) => ({ enabled: true, N_rho: 64, D: 0.1, chi_e: 3.0, chi_i: 3.0, rho_NBI: 0.5, sigma_NBI: 0.2, rho_ECH: 0.3, sigma_ECH: 0.1, gas_exponent: 4, jshape_gamma: 1.0, ...over });
/**
 * Profile-on shot with both observers. Each accepted step delivers (profileRecord, m02Observation) to onStep in order.
 * A profile constraint error is returned as `threw` (assertion or other errors propagate).
 */
export function observedProfileRun(c, dt, opts, onStep = () => {}) {
  const pending = []; let steps = 0, shot, threw;
  try {
    shot = withProfileStepObserver(rec => pending.push(rec), () => runShot(c, geometry(c), dt, educationalTransport, obs => {
      const rec = pending.shift(); if (!rec || rec.step !== obs.step) throw new Error('Profile record does not pair with the M02 observation');
      steps++; onStep(rec, obs);
    }, opts));
  } catch (e) { if (!/^profile constraint violated/.test(e.message)) throw e; threw = e; }
  return { shot, threw, steps };
}
