/**
 * D2 profiles: 1-D flux-surface-averaged diffusion of n, w_e, w_i on rho = sqrt(V(rho)/V), run as a
 * passenger of the unchanged 0-D balances (specs/proposals/d2-profiles.md, change request D2-PROFILES-001).
 * Illustrative, uncalibrated, experimentally unvalidated. Never imported by runShot's off path.
 *
 * Scheme (spec s8): finite volume on rho, N cells, cell volumes V(2i-1)/N^2, face areas A_j = 2 V rho_j (A_0 = 0),
 * backward-Euler conduction (one tridiagonal solve per species), explicit left-endpoint sources and edge fluxes,
 * density first, then w_e and w_i with face n = mean of the adjacent n^{k+1}.
 * Conventions: cells are 0-based here (cell k <-> spec cell i = k+1); face j lies between cells j-1 and j;
 * face fluxes are outward rates (particles s^-1, energy W).
 */
export type ProfilesOptions = {
  enabled: boolean; N_rho?: number; D?: number; chi_e?: number; chi_i?: number;
  rho_NBI?: number; sigma_NBI?: number; rho_ECH?: number; sigma_ECH?: number; gas_exponent?: number; jshape_gamma?: number;
};
export type ResolvedProfiles = Readonly<{ N_rho: number; D: number; chi_e: number; chi_i: number; rho_NBI: number; sigma_NBI: number; rho_ECH: number; sigma_ECH: number; gas_exponent: number; jshape_gamma: number }>;
/** Approved C-D2-* defaults (D2-PROFILES-001 approvedNewConstants). Callers must pass them explicitly; nothing is defaulted silently. */
export const PROFILES_DEFAULTS: Readonly<ProfilesOptions & ResolvedProfiles> = Object.freeze({ enabled: true, N_rho: 64, D: 0.1, chi_e: 3.0, chi_i: 3.0, rho_NBI: 0.5, sigma_NBI: 0.2, rho_ECH: 0.3, sigma_ECH: 0.1, gas_exponent: 4, jshape_gamma: 1.0 });
/** Enforced inclusive ranges (spec s5-s6, change request approvedNewConstants). N_rho is an integer in [16,256]. */
export const PROFILES_RANGES: Readonly<Record<Exclude<keyof ResolvedProfiles, 'N_rho'>, readonly [number, number]>> = Object.freeze({
  D: [0.03, 1], chi_e: [1.5, 10], chi_i: [1.5, 10], rho_NBI: [0, 0.7], sigma_NBI: [0.1, 0.4], rho_ECH: [0, 0.8], sigma_ECH: [0.05, 0.25], gas_exponent: [2, 8], jshape_gamma: [0, 2],
});
const OPTION_KEYS = ['enabled', 'N_rho', 'D', 'chi_e', 'chi_i', 'rho_NBI', 'sigma_NBI', 'rho_ECH', 'sigma_ECH', 'gas_exponent', 'jshape_gamma'];

/** Returns undefined when profiles are off (no other field is read); otherwise validates every field and returns the resolved set. */
export function resolveProfiles(p: ProfilesOptions | undefined): ResolvedProfiles | undefined {
  if (p === undefined) return undefined;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) throw new Error('profiles option must be an object');
  const enabled = (p as { enabled?: unknown }).enabled;
  if (typeof enabled !== 'boolean') throw new Error('profiles.enabled must be a boolean');
  if (!enabled) return undefined;
  for (const k of Object.keys(p)) if (!OPTION_KEYS.includes(k)) throw new Error(`Unknown profiles option ${k}`);
  const v = p as Record<string, unknown>;
  for (const k of OPTION_KEYS.slice(1)) if (v[k] === undefined) throw new Error(`profiles.${k} is required when profiles are enabled (no silent defaults)`);
  const N = v.N_rho as number;
  if (typeof N !== 'number' || !Number.isInteger(N) || N < 16 || N > 256) throw new Error('Invalid profiles.N_rho (integer 16–256)');
  for (const k of Object.keys(PROFILES_RANGES) as (keyof typeof PROFILES_RANGES)[]) {
    const x = v[k], [lo, hi] = PROFILES_RANGES[k];
    if (typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi) throw new Error(`Invalid profiles.${k} (${lo}–${hi})`);
  }
  return Object.freeze({ N_rho: N, D: v.D as number, chi_e: v.chi_e as number, chi_i: v.chi_i as number, rho_NBI: v.rho_NBI as number, sigma_NBI: v.sigma_NBI as number, rho_ECH: v.rho_ECH as number, sigma_ECH: v.sigma_ECH as number, gas_exponent: v.gas_exponent as number, jshape_gamma: v.jshape_gamma as number });
}

// ---------------------------------------------------------------------------------------------------------------
// Kernel
// ---------------------------------------------------------------------------------------------------------------
type Arr = Float64Array;
export type Edge = { type: 'flux'; value: number } | { type: 'dirichlet'; value: number };
export type Species = 'n' | 'we' | 'wi';
/** Post-step record for the verification observer (arrays are copies). */
export type StepRecord = Readonly<{
  step: number; t: number; dt: number; N_rho: number; V: number; L2: number;
  pre: { n: Arr; we: Arr; wi: Arr }; post: { n: Arr; we: Arr; wi: Arr };
  /** Prescribed outward edge flux applied this step (s^-1, W, W). */
  edgeFlux: { n: number; we: number; wi: number };
  /** Edge flux recomputed from the last cell's balance and the post-step face flux; equals edgeFlux to roundoff. */
  edgeFluxDelivered: { n: number; we: number; wi: number };
  /** Axis face flux: literally 0 (V'(0)=0). */
  axisFlux: { n: number; we: number; wi: number };
  /** Discrete integral of each shape, sum h_i dV_i (production passenger only). */
  shapeNorm?: Record<string, number>;
  /** Per-species max over cells of |cell residual| / max(|x^k dV|, dt(|c dV|+|F_in|+|F_out|)) from this kernel's own fluxes (not independent). */
  ledger: { n: number; we: number; wi: number };
}>;
type Core = {
  N: number; V: number; L2: number; D: number; chi_e: number; chi_i: number; kc: number;
  dV: Arr; gam: [number, number, number]; extrap: [number, number, number];
  lo: Arr; di: Arr; up: Arr; rhs: Arr; cp: Arr; dp: Arr; y: Arr; s: Arr; g: Arr; F: Arr;
};

function solve3(M: number[][], b: number[]): number[] {
  const A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < 3; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) { let a = A[r][3]; for (let k = r + 1; k < 3; k++) a -= A[r][k] * x[k]; x[r] = a / A[r][r]; }
  return x;
}
/** Volume-weighted (weight 1-t, t = 1-rho) moments of 1, t, t^2 over t in [p,q], as cell averages. */
function edgeMoments(p: number, q: number) {
  const w = (q - p) - (q * q - p * p) / 2, m1 = ((q * q - p * p) / 2 - (q ** 3 - p ** 3) / 3) / w, m2 = ((q ** 3 - p ** 3) / 3 - (q ** 4 - p ** 4) / 4) / w;
  return [m1, m2] as const;
}
function makeCore(N: number, V: number, L2: number, D: number, chi_e: number, chi_i: number, kc: number): Core {
  if (!(Number.isInteger(N) && N >= 3)) throw new Error('N_rho must be an integer >= 3');
  const dV = new Float64Array(N); for (let i = 0; i < N; i++) dV[i] = V * (2 * i + 1) / (N * N);
  const h = 1 / N, [a1, b1] = edgeMoments(0, h), [a2, b2] = edgeMoments(h, 2 * h), det = a1 * b2 - a2 * b1;
  // Quadratic-exact one-sided Dirichlet closure: y'(rho=1) = g_D y_D + g_1 y_{N-1} + g_2 y_{N-2} from two cell averages and the edge value.
  const gam: [number, number, number] = [(b2 - b1) / det, -b2 / det, b1 / det];
  // Quadratic-exact edge extrapolation of a frozen coefficient from three cell averages: x(1) = sum w_k xbar_k.
  const [a3, b3] = edgeMoments(2 * h, 3 * h);
  const w = solve3([[1, 1, 1], [a1 / h, a2 / h, a3 / h], [b1 / (h * h), b2 / (h * h), b3 / (h * h)]], [1, 0, 0]);
  const z = () => new Float64Array(N);
  return { N, V, L2, D, chi_e, chi_i, kc, dV, gam, extrap: [w[0], w[1], w[2]], lo: z(), di: z(), up: z(), rhs: z(), cp: z(), dp: z(), y: z(), s: z(), g: new Float64Array(N + 1), F: new Float64Array(N + 1) };
}
/** Thomas algorithm for an M-matrix; exactly-zero couplings are skipped so a NaN in one row cannot spread through 0*NaN. */
function thomas(c: Core, x: Arr) {
  const { N, lo, di, up, rhs, cp, dp } = c;
  cp[0] = up[0] / di[0]; dp[0] = rhs[0] / di[0];
  for (let i = 1; i < N; i++) {
    if (lo[i] === 0) { cp[i] = up[i] / di[i]; dp[i] = rhs[i] / di[i]; } else { const den = di[i] - lo[i] * cp[i - 1]; cp[i] = up[i] / den; dp[i] = (rhs[i] - lo[i] * dp[i - 1]) / den; }
  }
  x[N - 1] = dp[N - 1];
  for (let i = N - 2; i >= 0; i--) x[i] = cp[i] === 0 ? dp[i] : dp[i] - cp[i] * x[i + 1];
}
/**
 * One backward-Euler conduction step of one species.
 * x is n (y = x, m = 1) or w (y = w/n, face m = mean of adjacent n^{k+1}, so the (3/2)KEV factor cancels: F = -A chi m dy/drho / L2).
 * q is the per-volume explicit source, sNew the coefficient array (n^{k+1}) for w; result written to out. Returns the prescribed/closed edge flux used.
 */
function conduct(c: Core, x: Arr, q: Arr, coef: number, sNew: Arr | undefined, edge: Edge, dt: number, out: Arr): number {
  const { N, V, L2, dV, lo, di, up, rhs, g, gam, extrap, kc } = c;
  const energy = sNew !== undefined;
  for (let j = 1; j < N; j++) g[j] = 2 * V * j * (coef / L2) * (energy ? 0.5 * (sNew![j - 1] + sNew![j]) : 1);
  for (let i = 0; i < N; i++) {
    const si = energy ? sNew![i] : 1, gl = i > 0 ? g[i] : 0, gu = i < N - 1 ? g[i + 1] : 0;
    di[i] = dV[i] + dt * (gl + gu) / si;
    lo[i] = i > 0 ? -dt * gl / (energy ? sNew![i - 1] : 1) : 0;
    up[i] = i < N - 1 ? -dt * gu / (energy ? sNew![i + 1] : 1) : 0;
    rhs[i] = dV[i] * x[i] + dt * q[i] * dV[i];
  }
  // Dirichlet: F_edge = -e (g_D y_D + g_1 y_{N-1} + g_2 y_{N-2}), implicit in the two cell values; e carries A_N, the coefficient and the edge n.
  const dir = edge.type === 'dirichlet', yD = dir ? (energy ? kc * edge.value : edge.value) : 0;
  const e = dir ? 2 * V * (coef / L2) * (energy ? extrap[0] * sNew![N - 1] + extrap[1] * sNew![N - 2] + extrap[2] * sNew![N - 3] : 1) : 0;
  if (!dir) rhs[N - 1] -= dt * edge.value; else {
    di[N - 1] += -dt * e * gam[1] / (energy ? sNew![N - 1] : 1); lo[N - 1] += -dt * e * gam[2] / (energy ? sNew![N - 2] : 1); rhs[N - 1] += dt * e * gam[0] * yD;
  }
  thomas(c, out);
  if (!dir) return edge.value;
  const yN = energy ? out[N - 1] / sNew![N - 1] : out[N - 1], yM = energy ? out[N - 2] / sNew![N - 2] : out[N - 2];
  return -e * (gam[0] * yD + gam[1] * yN + gam[2] * yM);
}
/** Post-step interior face flux F_j (outward), j = 1..N-1, into c.F; F_0 = 0 literally. */
function faceFluxes(c: Core, xNew: Arr, sNew: Arr | undefined) {
  const { N, g, F } = c;
  F[0] = 0;
  for (let j = 1; j < N; j++) F[j] = sNew ? -g[j] * (xNew[j] / sNew[j] - xNew[j - 1] / sNew[j - 1]) : -g[j] * (xNew[j] - xNew[j - 1]);
}
function ledgerResidual(c: Core, x: Arr, xNew: Arr, q: Arr, Fedge: number, dt: number): { residual: number; delivered: number } {
  const { N, dV, F } = c; let worst = 0;
  for (let i = 0; i < N; i++) {
    const Fin = F[i], Fout = i === N - 1 ? Fedge : F[i + 1], r = (xNew[i] - x[i]) * dV[i] - dt * (Fin - Fout + q[i] * dV[i]);
    const scale = Math.max(Math.abs(x[i] * dV[i]), dt * (Math.abs(q[i] * dV[i]) + Math.abs(Fin) + Math.abs(Fout)));
    const rel = Math.abs(r) / scale; if (!(rel <= worst)) worst = rel;
  }
  const i = N - 1, delivered = F[i] + q[i] * dV[i] - (xNew[i] - x[i]) * dV[i] / dt;
  return { residual: worst, delivered };
}
function checkConstraint(c: Core, n: Arr, we: Arr, wi: Arr, t: number) {
  const { N, kc } = c;
  for (let i = 0; i < N; i++) {
    const bad = (q: string, x: number) => new Error(`profile constraint violated at t=${t.toFixed(6)} s in cell ${i + 1}: ${q} ${Number.isFinite(x) ? '<= 0' : 'nonfinite'}`);
    if (!Number.isFinite(n[i]) || n[i] <= 0) throw bad('n', n[i]);
    const te = we[i] / (n[i] * kc); if (!Number.isFinite(te) || te <= 0) throw bad('T_e', te);
    const ti = wi[i] / (n[i] * kc); if (!Number.isFinite(ti) || ti <= 0) throw bad('T_i', ti);
  }
}
type Sources = { n: Arr; we: Arr; wi: Arr };
type Edges = { n: Edge; we: Edge; wi: Edge };
/** Advance the cell arrays in place by one step; throws the constraint error without modifying the caller's arrays on failure. */
function advance(c: Core, st: { n: Arr; we: Arr; wi: Arr }, q: Sources, edges: Edges, freezeN: boolean, dt: number, t: number, step: number, shapeNorm?: Record<string, number>, enforce = true): StepRecord {
  const N = c.N, pre = { n: st.n.slice(), we: st.we.slice(), wi: st.wi.slice() }, nn = new Float64Array(N), we = new Float64Array(N), wi = new Float64Array(N);
  const led = { n: 0, we: 0, wi: 0 }, del = { n: 0, we: 0, wi: 0 }, edgeFlux = { n: 0, we: 0, wi: 0 };
  if (freezeN) nn.set(st.n); else {
    const Fe = conduct(c, st.n, q.n, c.D, undefined, edges.n, dt, nn); edgeFlux.n = Fe; faceFluxes(c, nn, undefined);
    const r = ledgerResidual(c, st.n, nn, q.n, Fe, dt); led.n = r.residual; del.n = r.delivered;
  }
  for (const [key, out, coef] of [['we', we, c.chi_e], ['wi', wi, c.chi_i]] as const) {
    const Fe = conduct(c, st[key], q[key], coef, nn, edges[key], dt, out); edgeFlux[key] = Fe; faceFluxes(c, out, nn);
    const r = ledgerResidual(c, st[key], out, q[key], Fe, dt); led[key] = r.residual; del[key] = r.delivered;
  }
  if (enforce) checkConstraint(c, nn, we, wi, t);
  st.n.set(nn); st.we.set(we); st.wi.set(wi);
  return { step, t, dt, N_rho: N, V: c.V, L2: c.L2, pre, post: { n: nn.slice(), we: we.slice(), wi: wi.slice() }, edgeFlux, edgeFluxDelivered: del, axisFlux: { n: 0, we: 0, wi: 0 }, shapeNorm, ledger: led };
}

// ---------------------------------------------------------------------------------------------------------------
// Diagnostics (spec s4, s6; DD-10)
// ---------------------------------------------------------------------------------------------------------------
/** Edge value by linear extrapolation from the last two cell centres, clipped to >= 0 (diagnostic only; clip flag = raw < 0). */
export function edgeValue(xN: number, xNm1: number): { value: number; raw: number; clipped: boolean } {
  const raw = 1.5 * xN - 0.5 * xNm1;
  return { value: Math.max(raw, 0), raw, clipped: raw < 0 };
}
export type DiagnosticsInput = { V: number; n: ArrayLike<number>; te: ArrayLike<number>; ti: ArrayLike<number>; jt: ArrayLike<number>; N: number; We: number; kc: number };
/** C_br, C_ohm, T_e,avg and edge values on supplied cell arrays. kc = (3/2)KEV in the caller's units; eta uses C-M01-eta_ref 2.8e-8 and the C-M01-Te_floor 0.02 keV clamp. */
export function evaluateDiagnostics(a: DiagnosticsInput) {
  const N = a.n.length, { V } = a, dV = (i: number) => V * (2 * i + 1) / (N * N), teAvg = a.We / (a.N * a.kc), eta = (T: number) => 2.8e-8 * Math.max(T, 0.02) ** -1.5;
  let br = 0, j2 = 0, j1 = 0;
  for (let i = 0; i < N; i++) { const w = dV(i); br += a.n[i] * a.n[i] * Math.sqrt(a.te[i]) * w; j2 += a.jt[i] * a.jt[i] * eta(a.te[i]) * w; j1 += a.jt[i] * w; }
  const cBr = br / (V * (a.N / V) ** 2 * Math.sqrt(teAvg)), cOhm = (j2 / V) / ((j1 / V) ** 2 * eta(teAvg));
  return { cBr, cOhm, teAvg, edge: { n: edgeValue(a.n[N - 1], a.n[N - 2]), te: edgeValue(a.te[N - 1], a.te[N - 2]), ti: edgeValue(a.ti[N - 1], a.ti[N - 2]) } };
}

// ---------------------------------------------------------------------------------------------------------------
// Verification-only kernel entry (not reachable through runShot options)
// ---------------------------------------------------------------------------------------------------------------
type PerCell = ArrayLike<number> | ((step: number, t: number) => ArrayLike<number>);
export type KernelSpec = {
  N_rho: number; V: number; L2: number; D: number; chi_e: number; chi_i: number; dt: number; steps: number;
  /** (3/2)KEV in the caller's units (T = w/(n kc)); Dirichlet values for energy are T values. */
  energyConst: number;
  n0: ArrayLike<number>; we0: ArrayLike<number>; wi0: ArrayLike<number>;
  /** Per-volume per-cell explicit source rates (pre-step level), static or a function of (step, t). Absent = 0. */
  sources?: { n?: PerCell; we?: PerCell; wi?: PerCell };
  /** Edge closure: one for all species or per species. Dirichlet uses the quadratic-exact closure. */
  edge: Edge | { n?: Edge; we?: Edge; wi?: Edge };
  freezeN?: boolean;
  /** Default true. false only for sign-changing analytic fixtures (the reflecting eigenmode J0(b1 rho) is negative for rho > 0.63); never available to runShot. */
  enforceConstraint?: boolean;
  /** Called after each accepted step with copies of the post-step arrays; a run that later throws leaves a trace of accepted steps. */
  observer?: (rec: StepRecord) => void;
};
const cellArray = (x: ArrayLike<number> | undefined, N: number): Arr => { if (x === undefined) return new Float64Array(N); if (x.length !== N) throw new Error('Cell array length must equal N_rho'); return Float64Array.from(x); };
export function runProfileKernel(k: KernelSpec) {
  const N = k.N_rho, core = makeCore(N, k.V, k.L2, k.D, k.chi_e, k.chi_i, k.energyConst);
  const st = { n: cellArray(k.n0, N), we: cellArray(k.we0, N), wi: cellArray(k.wi0, N) };
  const edges: Edges = 'type' in k.edge ? { n: k.edge, we: k.edge, wi: k.edge } : { n: k.edge.n ?? { type: 'flux', value: 0 }, we: k.edge.we ?? { type: 'flux', value: 0 }, wi: k.edge.wi ?? { type: 'flux', value: 0 } };
  const at = (p: PerCell | undefined, s: number, t: number) => cellArray(p === undefined ? undefined : typeof p === 'function' ? p(s, t) : p, N);
  for (let s = 0; s < k.steps; s++) {
    const t = s * k.dt, q = { n: at(k.sources?.n, s, t), we: at(k.sources?.we, s, t), wi: at(k.sources?.wi, s, t) };
    const rec = advance(core, st, q, edges, k.freezeN === true, k.dt, t, s, undefined, k.enforceConstraint !== false);
    if (k.observer) k.observer(rec);
  }
  return { n: st.n, we: st.we, wi: st.wi, dV: core.dV };
}

// ---------------------------------------------------------------------------------------------------------------
// Production passenger (called by runShot only when profiles are enabled)
// ---------------------------------------------------------------------------------------------------------------
let stepHook: ((rec: StepRecord) => void) | undefined;
/** Verification-only: receive every accepted passenger step of runShot calls made inside fn (synchronous; hook is restored afterwards). */
export function withProfileStepObserver<T>(observer: (rec: StepRecord) => void, fn: () => T): T {
  const prev = stepHook; stepHook = observer;
  try { return fn(); } finally { stepHook = prev; }
}
export type PassengerRates = Readonly<{ N: number; We: number; Wi: number; tauE: number; tauP: number; gas: number; beam: number; pNbiE: number; pNbiI: number; pEch: number; pOhm: number; pRad: number; pIon: number; tauEx: number }>;
export type ProfileSample = Readonly<{
  t: number; n: number[]; te: number[]; ti: number[];
  edge: { n: number; te: number; ti: number; clipped: { n: boolean; te: boolean; ti: boolean } };
  edgeFlux: { n: number; we: number; wi: number };
  cBr: number; cOhm: number;
  parity: { N: number; We: number; Wi: number }; ledger: { n: number; we: number; wi: number };
}>;
export type ProfilesBlock = Readonly<{
  status: string; units: string; options: ResolvedProfiles;
  grid: { N_rho: number; rho: number[]; volume: number; L2: number };
  samples: ProfileSample[]; maxParity: number; maxLedger: number;
}>;
/** Normalised shape h on the discrete cell volumes: sum h_i dV_i = 1. */
function normalise(g: Arr, dV: Arr, out: Arr): number {
  let s = 0; for (let i = 0; i < g.length; i++) s += g[i] * dV[i];
  for (let i = 0; i < g.length; i++) out[i] = g[i] / s;
  let chk = 0; for (let i = 0; i < g.length; i++) chk += out[i] * dV[i];
  return chk;
}
export function createPassenger(P: ResolvedProfiles, m: { V: number; R0: number; KEV: number; N0: number; We0: number; Wi0: number }) {
  const N = P.N_rho, kc = 1.5 * m.KEV, L2 = m.V / (2 * Math.PI ** 2 * m.R0), core = makeCore(N, m.V, L2, P.D, P.chi_e, P.chi_i, kc), dV = core.dV, hook = stepHook;
  const rc = new Float64Array(N); for (let i = 0; i < N; i++) rc[i] = (i + 0.5) / N; // cell centres (DD-12)
  const gauss = (mu: number, sg: number) => Float64Array.from(rc, r => Math.exp(-(((r - mu) / sg) ** 2)));
  const hNbi = new Float64Array(N), hEch = new Float64Array(N), hGas = new Float64Array(N), hBr = new Float64Array(N), hOhm = new Float64Array(N), jt = new Float64Array(N), tmp = new Float64Array(N);
  const staticNorm = { nbi: normalise(gauss(P.rho_NBI, P.sigma_NBI), dV, hNbi), ech: normalise(gauss(P.rho_ECH, P.sigma_ECH), dV, hEch), gas: normalise(Float64Array.from(rc, r => r ** P.gas_exponent), dV, hGas) };
  for (let i = 0; i < N; i++) jt[i] = (1 - rc[i] * rc[i]) ** P.jshape_gamma;
  // Initial state: uniform, equal to the 0-D initial state (A-D2-007).
  const st = { n: new Float64Array(N).fill(m.N0 / m.V), we: new Float64Array(N).fill(m.We0 / m.V), wi: new Float64Array(N).fill(m.Wi0 / m.V) };
  const samples: ProfileSample[] = []; let maxParity = 0, maxLedger = 0, last = { n: 0, we: 0, wi: 0 };
  const total = (x: Arr) => { let s = 0; for (let i = 0; i < N; i++) s += x[i] * dV[i]; return s; };
  const parityOf = (post: { N: number; We: number; Wi: number }) => ({ N: Math.abs(total(st.n) - post.N) / post.N, We: Math.abs(total(st.we) - post.We) / post.We, Wi: Math.abs(total(st.wi) - post.Wi) / post.Wi });
  return {
    /** One passenger step. `r` holds the pre-step 0-D totals and rates (from the unchanged 0-D code); `post` the accepted post-step 0-D totals. Never writes back. */
    step(t: number, dt: number, step: number, r: PassengerRates, post: { N: number; We: number; Wi: number }) {
      const te = new Float64Array(N), qn = new Float64Array(N), qe = new Float64Array(N), qi = new Float64Array(N);
      for (let i = 0; i < N; i++) te[i] = st.we[i] / (st.n[i] * kc);
      for (let i = 0; i < N; i++) tmp[i] = st.n[i] * st.n[i] * Math.sqrt(te[i]);
      const nb = normalise(tmp, dV, hBr);
      for (let i = 0; i < N; i++) tmp[i] = jt[i] * jt[i] * (2.8e-8 * Math.max(te[i], 0.02) ** -1.5);
      const no = normalise(tmp, dV, hOhm);
      for (let i = 0; i < N; i++) {
        const ex = (st.we[i] - st.wi[i]) / r.tauEx;
        qn[i] = r.gas * hGas[i] + r.beam * hNbi[i];
        qe[i] = r.pNbiE * hNbi[i] + r.pEch * hEch[i] + r.pOhm * hOhm[i] - r.pRad * hBr[i] - r.pIon * hGas[i] - ex;
        qi[i] = r.pNbiI * hNbi[i] + ex;
      }
      const edges: Edges = { n: { type: 'flux', value: r.N / r.tauP }, we: { type: 'flux', value: r.We / r.tauE }, wi: { type: 'flux', value: r.Wi / r.tauE } };
      const rec = advance(core, st, { n: qn, we: qe, wi: qi }, edges, false, dt, t, step, { ...staticNorm, br: nb, ohm: no });
      const par = parityOf(post); last = rec.ledger;
      maxParity = Math.max(maxParity, par.N, par.We, par.Wi); maxLedger = Math.max(maxLedger, rec.ledger.n, rec.ledger.we, rec.ledger.wi);
      if (hook) hook(rec);
    },
    /** Snapshot at a 0-D sample time (state after `step` steps); edge fluxes are the prescribed losses N/tauP, We/tauE, Wi/tauE of that 0-D state. */
    sample(t: number, r: { N: number; We: number; Wi: number; tauE: number; tauP: number }) {
      const n = Array.from(st.n, x => x / 1e19), te = Array.from(st.we, (w, i) => w / (st.n[i] * kc)), ti = Array.from(st.wi, (w, i) => w / (st.n[i] * kc));
      const d = evaluateDiagnostics({ V: m.V, n: st.n, te, ti, jt, N: r.N, We: r.We, kc }), en = edgeValue(n[N - 1], n[N - 2]);
      samples.push({ t, n, te, ti, edge: { n: en.value, te: d.edge.te.value, ti: d.edge.ti.value, clipped: { n: en.clipped, te: d.edge.te.clipped, ti: d.edge.ti.clipped } }, edgeFlux: { n: r.N / r.tauP, we: r.We / r.tauE, wi: r.Wi / r.tauE }, cBr: d.cBr, cOhm: d.cOhm, parity: parityOf(r), ledger: { ...last } });
    },
    block(): ProfilesBlock {
      return { status: 'illustrative, uncalibrated, experimentally unvalidated; passenger of the 0-D balances (profiles do not feed back)', units: 'n [1e19 m^-3], te/ti [keV], edgeFlux n [s^-1] we/wi [W], rho = volume-normalised radius at cell centres', options: P, grid: { N_rho: N, rho: Array.from(rc), volume: m.V, L2 }, samples, maxParity, maxLedger };
    },
  };
}
