// Test-only cell-resolved oracle for D2-VER-LEDGER. Restates the 0.1.0 source/loss formulas and the s6 shapes with its own literals;
// production rate functions and production shape code are never imported. Uses only the exported post-step profiles, the exported
// prescribed edge flux and the M02 pre-step totals. Cells are 1-based (i = 1..N), face j between cells j and j+1, Phi_0 = 0.
const KEV = 1.602176634e-16, R0 = 1.66, TAU_EX = 0.25;
export const dVcell = (i, N, V) => V * (2 * i - 1) / (N * N);
export function shapes(rec, V, o, scale = {}) {
  const N = rec.N_rho, s = { nbi: 1, ech: 1, gas: 1, br: 1, ohm: 1, ...scale }, h = { nbi: [], ech: [], gas: [], br: [], ohm: [] }, norm = {};
  const raw = { nbi: [], ech: [], gas: [], br: [], ohm: [] };
  for (let i = 1; i <= N; i++) {
    const r = (i - 0.5) / N, n = rec.pre.n[i - 1], te = rec.pre.we[i - 1] / (1.5 * n * KEV), jt = (1 - r * r) ** o.jshape_gamma;
    raw.nbi.push(Math.exp(-(((r - o.rho_NBI) / o.sigma_NBI) ** 2))); raw.ech.push(Math.exp(-(((r - o.rho_ECH) / o.sigma_ECH) ** 2))); raw.gas.push(r ** o.gas_exponent);
    raw.br.push(n * n * Math.sqrt(te)); raw.ohm.push(jt * jt * 2.8e-8 * Math.max(te, 0.02) ** -1.5);
  }
  for (const k of Object.keys(raw)) {
    let sum = 0; for (let i = 1; i <= N; i++) sum += raw[k][i - 1] * dVcell(i, N, V);
    let chk = 0; for (let i = 1; i <= N; i++) { h[k][i - 1] = raw[k][i - 1] / sum; chk += h[k][i - 1] * dVcell(i, N, V); }
    norm[k] = chk; for (let i = 0; i < N; i++) h[k][i] *= s[k];
  }
  return { h, norm };
}
/** 0-D rates restated from the M02 pre-step totals (default closure). */
export function rates0D(c, obs) {
  const heat = obs.t >= 1 && obs.t < 4 ? 1 : 0, ip = obs.t < 1 ? 0.4 + (c.ip - 0.4) * obs.t : obs.t > 4 ? c.ip + (0.4 - c.ip) * (obs.t - 4) : c.ip;
  const nbi = c.nbi * heat, ech = c.ech * heat, V = obs.volume, density = obs.preN / V, te = obs.preWe / (1.5 * obs.preN * KEV);
  const tauE = 0.12 * (ip / 1.2) ** 0.7 * (c.bt / 2) ** 0.2 * (Math.max(density, 1e18) / 4e19) ** 0.2 * (Math.max(nbi + ech, 0.5) / 5) ** -0.35, tauP = 1.6;
  return {
    gas: 0.3 * c.gas * 1e21, beam: 0.8 * nbi * 1e6 / (80 * KEV), pNbiE: 0.8 * 0.35 * nbi * 1e6, pNbiI: 0.8 * 0.65 * nbi * 1e6, pEch: 0.9 * ech * 1e6,
    pOhm: 2.8e-8 * Math.max(te, 0.02) ** -1.5 * (2 * Math.PI * R0) ** 2 / V * (ip * 1e6) ** 2, pRad: 1.69e-38 * density ** 2 * Math.sqrt(te * 1000) * V,
    pIon: 0.0136 * KEV * 0.3 * c.gas * 1e21, edge: { n: obs.preN / tauP, we: obs.preWe / tauE, wi: obs.preWi / tauE },
  };
}
/** Residuals of one accepted step. `rec` is a profile StepRecord (possibly a mutated copy), `obs` the M02 observation of the same step. */
export function stepResiduals(c, o, rec, obs, scale = {}) {
  const N = rec.N_rho, V = obs.volume, dt = rec.dt, L2 = V / (2 * Math.PI ** 2 * R0), r = rates0D(c, obs), { h, norm } = shapes(rec, V, o, scale);
  const out = { resid: { n: 0, we: 0, wi: 0 }, residCell: { n: 0, we: 0, wi: 0 }, total: { n: 0, we: 0, wi: 0 }, edgeDelivered: { n: 0, we: 0, wi: 0 }, edgeWiring: { n: 0, we: 0, wi: 0 }, shapeNormOracle: 0, shapeNormProduction: 0 };
  for (const k of Object.keys(norm)) out.shapeNormOracle = Math.max(out.shapeNormOracle, Math.abs(norm[k] - 1));
  if (rec.shapeNorm) for (const v of Object.values(rec.shapeNorm)) out.shapeNormProduction = Math.max(out.shapeNormProduction, Math.abs(v - 1));
  const T = (w, n) => w / (1.5 * n * KEV);
  for (const sp of ['n', 'we', 'wi']) {
    const x0 = rec.pre[sp], x1 = rec.post[sp], coef = sp === 'n' ? o.D : sp === 'we' ? o.chi_e : o.chi_i;
    const terms = i => { // per-volume contribution terms of cell i (1-based), pre-step state
      const k = i - 1, ex = (rec.pre.we[k] - rec.pre.wi[k]) / TAU_EX;
      if (sp === 'n') return [r.gas * h.gas[k], r.beam * h.nbi[k]];
      if (sp === 'we') return [r.pNbiE * h.nbi[k], r.pEch * h.ech[k], r.pOhm * h.ohm[k], -r.pRad * h.br[k], -r.pIon * h.gas[k], -ex];
      return [r.pNbiI * h.nbi[k], ex];
    };
    const Phi = new Array(N + 1).fill(0); // Phi[0] = 0 exactly
    for (let j = 1; j < N; j++) {
      const A = 2 * V * (j / N), hh = 1 / N;
      Phi[j] = sp === 'n' ? -A * (coef / L2) * (x1[j] - x1[j - 1]) / hh
        : -A * (1.5 * KEV * 0.5 * (rec.post.n[j - 1] + rec.post.n[j]) * coef / L2) * (T(x1[j], rec.post.n[j]) - T(x1[j - 1], rec.post.n[j - 1])) / hh;
    }
    Phi[N] = rec.edgeFlux[sp];
    let sumR = 0, inv = 0, contrib = 0;
    for (let i = 1; i <= N; i++) {
      const dv = dVcell(i, N, V), q = terms(i), sq = q.reduce((a, b) => a + b, 0) * dv, sa = q.reduce((a, b) => a + Math.abs(b), 0) * dv;
      const R = (x1[i - 1] - x0[i - 1]) * dv - dt * (Phi[i - 1] - Phi[i] + sq), scaleN = Math.max(Math.abs(x0[i - 1] * dv), dt * sa + dt * Math.abs(Phi[i - 1]) + dt * Math.abs(Phi[i]));
      const rel = Math.abs(R) / scaleN; if (!(rel <= out.resid[sp])) { out.resid[sp] = rel; out.residCell[sp] = i; }
      sumR += R; inv += x0[i - 1] * dv; contrib += sa;
      if (i === N) { const del = Phi[N - 1] + sq - (x1[i - 1] - x0[i - 1]) * dv / dt; out.edgeDelivered[sp] = Math.abs(del - Phi[N]) / Math.max(Math.abs(Phi[N]), Math.abs(r.edge[sp])); }
    }
    out.total[sp] = Math.abs(sumR) / Math.max(inv, dt * contrib + dt * Math.abs(Phi[N]));
    out.edgeWiring[sp] = Math.abs(rec.edgeFlux[sp] - r.edge[sp]) / Math.abs(r.edge[sp]);
  }
  return out;
}
