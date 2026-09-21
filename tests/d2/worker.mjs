// Worker-thread job runner for the long fixture runs (results are deterministic; the pool only shortens wall-clock time).
import { parentPort, workerData as j } from 'node:worker_threads';
import { fixtures, runEnergy, makeAc7 } from './fixtures.mjs';

const f = fixtures[j.id], N = j.N;
if (j.kind === 'field') {
  const u = runEnergy({ N, dt: j.dt, t: j.t, n0: f.n0(N), we0: f.init(N), edge: f.edge, enforce: f.enforce, source: f.source ? f.source(N) : undefined });
  parentPort.postMessage({ u });
} else if (j.kind === 'observed') { // one fixture run with the AC-7 accumulator attached
  const u0 = f.init(N), ac = makeAc7({ species: 'we', N, V: 1, L2: 1, coef: 1, kc: 1, u0, dirichlet: f.dirichlet });
  const t0 = Date.now(), u = runEnergy({ N, dt: j.dt, t: j.t, n0: f.n0(N), we0: u0, edge: f.edge, enforce: f.enforce, source: f.source ? f.source(N) : undefined, observer: rec => ac.observe(rec) });
  parentPort.postMessage({ u, ac7: ac.result(), seconds: (Date.now() - t0) / 1000 });
} else if (j.kind === 'uniform') { // F3 companion: u = 1, zero-flux edge, total conserved every step
  const dV = i => (2 * i + 1) / (N * N); let total0 = 0; for (let i = 0; i < N; i++) total0 += dV(i);
  let worstTotal = 0, worstEdge = 0, worstDev = 0, worstPrescribed = 0;
  const u = runEnergy({ N, dt: j.dt, t: j.t, n0: new Float64Array(N).fill(1), we0: new Float64Array(N).fill(1), edge: { type: 'flux', value: 0 }, observer: rec => {
    let s = 0, dev = 0; for (let i = 0; i < N; i++) { s += rec.post.we[i] * dV(i); dev = Math.max(dev, Math.abs(rec.post.we[i] - 1)); }
    worstTotal = Math.max(worstTotal, Math.abs(s - total0) / total0); worstDev = Math.max(worstDev, dev); worstEdge = Math.max(worstEdge, Math.abs(rec.edgeFluxDelivered.we - rec.edgeFlux.we)); worstPrescribed = Math.max(worstPrescribed, Math.abs(rec.edgeFlux.we));
  } });
  parentPort.postMessage({ u, totalRelDrift: worstTotal, maxDeviationFromUniform: worstDev, deliveredEdgeFluxAbsMax: worstEdge, prescribedEdgeFluxAbsMax: worstPrescribed });
} else throw new Error(`Unknown job ${j.kind}`);
