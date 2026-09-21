// Test-only analytic fixtures F1-F4 and the convergence procedures of specs/proposals/d2-profiles-verification.md s1-s3.
// Everything here is restated independently of production: J0 by its own series, cell averages by Gauss-Legendre, L2rel, rates.
import { runProfileKernel } from '../../physics/profiles.ts';

export const a1 = 2.404825557695773, b1 = 3.831705970207512, KEV = 1.602176634e-16, R0 = 1.66;

/** Bessel J0 and J1 by their power series (converges fast for x <= ~6; the alternating terms are summed to below 1e-18). */
export function J0(x) { let term = 1, sum = 1; const q = -(x * x) / 4; for (let k = 1; k < 80; k++) { term *= q / (k * k); sum += term; if (Math.abs(term) < 1e-19) break; } return sum; }
export function J1(x) { let term = x / 2, sum = term; const q = -(x * x) / 4; for (let k = 1; k < 80; k++) { term *= q / (k * (k + 1)); sum += term; if (Math.abs(term) < 1e-19) break; } return sum; }

/** 10-node Gauss-Legendre nodes and weights on [-1, 1] by Newton iteration on P_10. */
function gaussLegendre(n) {
  const x = [], w = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      dp = n * (z * p1 - p2) / (z * z - 1); const dz = p1 / dp; z -= dz; if (Math.abs(dz) < 1e-16) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * dp * dp));
  }
  return { x, w };
}
const GL = gaussLegendre(10);
/** Volume-weighted cell averages of f(rho) on the normalised grid (V = 1, V' = 2 rho), (1/dV_i) int f 2 rho drho, Gauss-Legendre (10 nodes per cell). */
export function cellAvg(f, N) {
  const out = new Float64Array(N);
  for (let i = 1; i <= N; i++) {
    const a = (i - 1) / N, b = i / N, mid = (a + b) / 2, half = (b - a) / 2; let s = 0;
    for (let k = 0; k < GL.x.length; k++) { const r = mid + half * GL.x[k]; s += GL.w[k] * half * f(r) * 2 * r; }
    out[i - 1] = s * N * N / (2 * i - 1);
  }
  return out;
}
/** L2rel(u, ubar) = sqrt(sum dV (u - ubar)^2 / sum dV ubar^2) with dV_i proportional to 2i - 1. */
export function l2rel(u, ub) {
  let num = 0, den = 0; for (let i = 0; i < u.length; i++) { const w = 2 * (i + 1) - 1, d = u[i] - ub[i]; num += w * d * d; den += w * ub[i] * ub[i]; }
  return Math.sqrt(num / den);
}
export const combine = (a, b, fa, fb) => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = fa * a[i] + fb * b[i]; return o; };
/** Cell-average of rho^2 on [a,b] (volume weight) is (a^2 + b^2)/2; the F1 closed form. */
export const f1Shape = N => Float64Array.from({ length: N }, (_, i) => 1 - (((i / N) ** 2 + ((i + 1) / N) ** 2) / 2));

// ---------------------------------------------------------------------------------------------------------------
// AC-7 per-step accumulator: (a) exact-zero axis flux, (b) delivered vs prescribed edge flux against the flux scale,
// (d) discrete maximum principle (DD-21). Flux scale max_j |Phi_j| is recomputed from the post-step arrays (test-side formula).
// ---------------------------------------------------------------------------------------------------------------
export function makeAc7({ species, N, V, L2, coef, kc, u0, dirichlet }) {
  const acc = { steps: 0, axisNonzero: 0, edgeMax: 0, prescribedAbsMax: 0, excessMax: 0, literalExcessMax: 0, minSeen: Infinity, maxSeen: -Infinity };
  const M = Math.max(...Array.from(u0, Math.abs)), lo0 = Math.min(...u0), hi0 = Math.max(...u0);
  const lo = Math.min(lo0, dirichlet ?? Infinity) - 1e-14 * M, hi = Math.max(hi0, dirichlet ?? -Infinity) + 1e-14 * M, litLo = lo0 - 1e-14 * M, litHi = hi0 + 1e-14 * M;
  const fluxScale = post => {
    let m = 0;
    for (let j = 1; j < N; j++) {
      const A = 2 * V * (j / N), h = 1 / N;
      const phi = species === 'n' ? -A * (coef / L2) * (post.n[j] - post.n[j - 1]) / h
        : -A * (kc * 0.5 * (post.n[j - 1] + post.n[j]) * coef / L2) * (post.we[j] / (post.n[j] * kc) - post.we[j - 1] / (post.n[j - 1] * kc)) / h;
      if (Math.abs(phi) > m) m = Math.abs(phi);
    }
    return m;
  };
  return {
    observe(rec) {
      acc.steps++;
      if (!(Object.is(rec.axisFlux.n, 0) && Object.is(rec.axisFlux.we, 0) && Object.is(rec.axisFlux.wi, 0))) acc.axisNonzero++;
      const key = species === 'n' ? 'n' : 'we', pre = rec.edgeFlux[key], del = rec.edgeFluxDelivered[key];
      const e = Math.abs(del - pre) / Math.max(Math.abs(pre), fluxScale(rec.post)); if (e > acc.edgeMax) acc.edgeMax = e; acc.prescribedAbsMax = Math.max(acc.prescribedAbsMax, Math.abs(pre));
      const x = rec.post[key]; let mn = Infinity, mx = -Infinity; for (let i = 0; i < N; i++) { if (x[i] < mn) mn = x[i]; if (x[i] > mx) mx = x[i]; }
      acc.minSeen = Math.min(acc.minSeen, mn); acc.maxSeen = Math.max(acc.maxSeen, mx);
      acc.excessMax = Math.max(acc.excessMax, lo - mn, mx - hi, 0); acc.literalExcessMax = Math.max(acc.literalExcessMax, litLo - mn, mx - litHi, 0);
    },
    result: () => ({ steps: acc.steps, axisNonzeroSteps: acc.axisNonzero, edgeFluxRelMax: acc.edgeMax, prescribedEdgeFluxAbsMax: acc.prescribedAbsMax, dmpExcessOverM: acc.excessMax / M, dmpLiteralExcessOverM: acc.literalExcessMax / M, minSeen: acc.minSeen, maxSeen: acc.maxSeen, dmpBounds: [lo, hi] }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Normalised energy-conduction runner (V = 1, L^2 = 1, (3/2)KEV = 1, n frozen): F2, F3, F4. The tracked field is w_e = n T.
// ---------------------------------------------------------------------------------------------------------------
export function runEnergy({ N, dt, t, n0, we0, chi = 1, edge, source, enforce = true, observer }) {
  const steps = Math.round(t / dt); if (Math.abs(steps * dt - t) > 1e-9 * t) throw new Error(`t = ${t} is not an integer multiple of dt = ${dt}`);
  const ones = new Float64Array(N).fill(1);
  return runProfileKernel({
    N_rho: N, V: 1, L2: 1, D: 0, chi_e: chi, chi_i: 0, dt, steps, energyConst: 1, n0, we0, wi0: ones, freezeN: true, enforceConstraint: enforce,
    sources: source ? { we: source } : undefined, edge: { n: { type: 'flux', value: 0 }, we: edge, wi: { type: 'flux', value: 0 } }, observer,
  }).we;
}
const ONES = N => new Float64Array(N).fill(1);
export const fixtures = {
  F2: { name: 'F2 Dirichlet eigenmode', n0: N => ONES(N), init: N => cellAvg(r => J0(a1 * r), N), exact: (N, t) => cellAvg(r => J0(a1 * r) * Math.exp(-a1 * a1 * t), N), edge: { type: 'dirichlet', value: 0 }, enforce: true, dirichlet: 0 },
  F3: { name: 'F3 reflecting eigenmode', n0: N => ONES(N), init: N => cellAvg(r => J0(b1 * r), N), exact: (N, t) => cellAvg(r => J0(b1 * r) * Math.exp(-b1 * b1 * t), N), edge: { type: 'flux', value: 0 }, enforce: false, dirichlet: undefined },
  F4: {
    name: 'F4 manufactured conduction, frozen non-uniform n',
    n0: N => cellAvg(r => 1.5 - r * r / 2, N), init: N => cellAvg(r => (1.5 - r * r / 2) * (1 - r * r) * (1 + r * r / 2), N),
    exact: (N, t) => cellAvg(r => (1.5 - r * r / 2) * Math.exp(-t) * (1 - r * r) * (1 + r * r / 2), N), edge: { type: 'dirichlet', value: 0 }, enforce: true, dirichlet: 0,
    // S_e(rho,t) = e^-t (3/2 + 45/4 rho^2 - 11/2 rho^4 - 1/4 rho^6): cell averages of the spatial factor, times e^-t at the left endpoint of each step.
    source: N => { const g = cellAvg(r => 1.5 + 11.25 * r * r - 5.5 * r ** 4 - 0.25 * r ** 6, N); return (s, t) => g.map(v => v * Math.exp(-t)); },
  },
};
/** F4 source residual by finite differences: max |dw/dt - (1/rho) d/drho(rho n T') - S_e| at seven rho in [0.05, 0.95], t = 0.7 (verification s2). */
export function f4SourceResidual() {
  const n = r => 1.5 - r * r / 2, T = (r, t) => Math.exp(-t) * (1 - r * r) * (1 + r * r / 2), w = (r, t) => n(r) * T(r, t), S = (r, t) => Math.exp(-t) * (1.5 + 11.25 * r * r - 5.5 * r ** 4 - 0.25 * r ** 6);
  const h = 1e-4, ht = 1e-5, t = 0.7; let worst = 0;
  for (const r of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
    const flux = x => x * n(x) * (T(x + h, t) - T(x - h, t)) / (2 * h), div = (flux(r + h) - flux(r - h)) / (2 * h) / r, dwdt = (w(r, t + ht) - w(r, t - ht)) / (2 * ht);
    worst = Math.max(worst, Math.abs(dwdt - div - S(r, t)));
  }
  return worst;
}
/** Final w_e at time t for a fixture, N cells, step dt (memoised: the refinement checks and the eigenmode checks share runs). */
const cache = new Map();
export const fixtureCacheSet = (id, N, dt, t, u) => cache.set(`${id}|${N}|${dt}|${t}`, u);
export function fixtureField(id, N, dt, t = 1) {
  const key = `${id}|${N}|${dt}|${t}`; if (cache.has(key)) return cache.get(key);
  const f = fixtures[id], u = runEnergy({ N, dt, t, n0: f.n0(N), we0: f.init(N), edge: f.edge, enforce: f.enforce, source: f.source ? f.source(N) : undefined });
  cache.set(key, u); return u;
}
/** Exact solution in the compared variable w (F4 compares w = nT; F2/F3 have n = 1 so w = T). */
export const fixtureExact = (id, N, t = 1) => fixtures[id].exact(N, t);
export const spatialRateInputs = { Ns: [32, 64, 128, 256], dt: 1e-5 };
export const temporalDts = [4e-5, 2e-5, 1e-5, 5e-6];
export const temporalN = { F2: 256, F3: 256, F4: 128 };
const log2 = Math.log2;
/** Spatial procedure: e_N = L2rel(2 u_{dt/2} - u_{dt}, exact) for N = 32..256, three rates. */
export function spatialRates(id, t = 1) {
  const e = spatialRateInputs.Ns.map(N => ({ N, e: l2rel(combine(fixtureField(id, N, spatialRateInputs.dt / 2, t), fixtureField(id, N, spatialRateInputs.dt, t), 2, -1), fixtureExact(id, N, t)) }));
  return { errors: e, rates: e.slice(0, -1).map((x, i) => ({ N: x.N, to: e[i + 1].N, e: x.e, e2: e[i + 1].e, p: log2(x.e / e[i + 1].e) })) };
}
/** Temporal procedure: d_k = L2rel of successive field differences (spatial error cancels), two rates. */
export function temporalRates(id, t = 1) {
  const N = temporalN[id], u = temporalDts.map(dt => fixtureField(id, N, dt, t)), ex = fixtureExact(id, N, t);
  const dk = temporalDts.slice(0, -1).map((dt, k) => {
    let num = 0, den = 0; for (let i = 0; i < N; i++) { const w = 2 * (i + 1) - 1, x = u[k][i] - u[k + 1][i]; num += w * x * x; den += w * ex[i] * ex[i]; }
    return { dt: `${dt} vs ${temporalDts[k + 1]}`, d: Math.sqrt(num / den) };
  });
  return { N, differences: dk, rates: [0, 1].map(k => ({ pair: `${dk[k].dt} / ${dk[k + 1].dt}`, d: dk[k].d, d2: dk[k + 1].d, p: log2(dk[k].d / dk[k + 1].d) })) };
}
