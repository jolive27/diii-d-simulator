/** M02 numerical evidence only. No acceptance decision or model changes. */
import { MU0, MACHINE, DEFAULT, geometry, basis, equilibrium, boundary } from './engine.ts';
import type { Geometry } from './engine.ts';

export const VERIFICATION_VERSION = '0.2.0';
const GRIDS = [33, 65, 129] as const;
const ALPHA = 0.4, B = 0.2, RA = 1.66, PEAK = 0.5, A = ALPHA / MU0;
const exact = (r: number, z: number) => PEAK - ALPHA / 8 * (r * r - RA * RA) ** 2 - B / 2 * z * z;
const current = (r: number) => A * r + B / (MU0 * r);
const order = (coarse: number, fine: number) => coarse > 0 && fine > 0 ? Math.log2(coarse / fine) : null;
function rectangle(n: number): Geometry {
  const R = Array.from({ length: n }, (_, i) => 1 + i * ((2.32 - 1) / (n - 1)));
  const Z = Array.from({ length: n }, (_, j) => -0.66 + j * ((0.66 - (-0.66)) / (n - 1)));
  const dr = R[1] - R[0], dz = Z[1] - Z[0], mask = new Uint8Array(n * n);
  let volume = 0, C = 0, D = 0;
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    mask[j * n + i] = 1; volume += 2 * Math.PI * R[i] * dr * dz; C += R[i] * dr * dz; D += dr * dz / (MU0 * R[i]);
  }
  return { n, R, Z, dr, dz, mask, volume, C, D };
}
function gridAxis(g: Geometry, psi: readonly number[]) {
  let k = 0;
  for (let i = 1; i < psi.length; i++) if (psi[i] > psi[k]) k = i;
  const i = k % g.n, j = Math.floor(k / g.n);
  if (i === 0 || j === 0 || i === g.n - 1 || j === g.n - 1) throw new Error('Axis maximum is on boundary');
  const vertex = (left: number, middle: number, right: number, h: number) => {
    const denominator = left - 2 * middle + right;
    return { offset: h * (left - right) / (2 * denominator), gain: -((left - right) ** 2) / (8 * denominator) };
  };
  const r = vertex(psi[k - 1], psi[k], psi[k + 1], g.dr);
  const z = vertex(psi[k - g.n], psi[k], psi[k + g.n], g.dz);
  return { gridR: g.R[i], gridZ: g.Z[j], gridPeak: psi[k], interpolatedR: g.R[i] + r.offset, interpolatedZ: g.Z[j] + z.offset, interpolatedPeak: psi[k] + r.gain + z.gain };
}
/** Independent difference expression used only for measurement, not a second solver. */
function derivativeCurrent(g: Geometry, psi: readonly number[], i: number, j: number) {
  const k = j * g.n + i;
  let radialFirst: number, radialSecond: number, verticalSecond: number;
  if (i === 0 || i === g.n - 1) {
    const direction = i === 0 ? 1 : -1;
    radialFirst = direction * (-3 * psi[k] + 4 * psi[k + direction] - psi[k + 2 * direction]) / (2 * g.dr);
    radialSecond = (2 * psi[k] - 5 * psi[k + direction] + 4 * psi[k + 2 * direction] - psi[k + 3 * direction]) / g.dr ** 2;
  } else {
    radialFirst = (psi[k + 1] - psi[k - 1]) / (2 * g.dr);
    radialSecond = (psi[k + 1] - 2 * psi[k] + psi[k - 1]) / g.dr ** 2;
  }
  if (j === 0 || j === g.n - 1) {
    const stride = j === 0 ? g.n : -g.n;
    verticalSecond = (2 * psi[k] - 5 * psi[k + stride] + 4 * psi[k + 2 * stride] - psi[k + 3 * stride]) / g.dz ** 2;
  } else verticalSecond = (psi[k + g.n] - 2 * psi[k] + psi[k - g.n]) / g.dz ** 2;
  return -(radialSecond - radialFirst / g.R[i] + verticalSecond) / (MU0 * g.R[i]);
}
export function analytic_benchmark() {
  const rows = GRIDS.map(n => {
    const g = rectangle(n);
    const exactPsi = g.Z.flatMap(z => g.R.map(r => exact(r, z)));
    const u = g.Z.flatMap(() => g.R.map(r => PEAK / A - MU0 / 8 * (r * r - RA * RA) ** 2));
    const v = g.Z.flatMap(z => g.R.map(() => -z * z / 2));
    const solution = basis(g, { u, v });
    const psi = Array.from(solution.u, (value, k) => A * value + B * solution.v[k]);
    let linf = 0, l2 = 0, weight = 0, boundaryError = 0, identityError = 0, currentError = 0, exactDerivativeError = 0, exactDerivativeIdentityError = 0;
    let integratedCurrent = 0, pressureIntegral = 0, maxAnalyticCurrent = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, r = g.R[i], error = psi[k] - exactPsi[k];
      const quadratureWeight = g.dr * g.dz * (i === 0 || i === n - 1 ? 0.5 : 1) * (j === 0 || j === n - 1 ? 0.5 : 1);
      integratedCurrent += derivativeCurrent(g, psi, i, j) * quadratureWeight;
      pressureIntegral += A * psi[k] * 2 * Math.PI * r * quadratureWeight;
      if (!g.mask[k]) { boundaryError = Math.max(boundaryError, Math.abs(error) / PEAK); continue; }
      linf = Math.max(linf, Math.abs(error) / PEAK);
      const w = 2 * Math.PI * r * g.dr * g.dz; l2 += error * error * w; weight += w;
      const jExact = current(r), jNumerical = derivativeCurrent(g, psi, i, j), jFromExact = derivativeCurrent(g, exactPsi, i, j);
      maxAnalyticCurrent = Math.max(maxAnalyticCurrent, jExact);
      currentError = Math.max(currentError, Math.abs(jNumerical - jExact));
      const expectedDerivativeError = -ALPHA * g.dr ** 2 / (4 * MU0 * r);
      exactDerivativeError = Math.max(exactDerivativeError, Math.abs(jFromExact - jExact));
      exactDerivativeIdentityError = Math.max(exactDerivativeIdentityError, Math.abs((jFromExact - jExact) / expectedDerivativeError - 1));
      const lhs = (exactPsi[k + 1] - 2 * exactPsi[k] + exactPsi[k - 1]) / g.dr ** 2 - (exactPsi[k + 1] - exactPsi[k - 1]) / (2 * r * g.dr) + (exactPsi[k + n] - 2 * exactPsi[k] + exactPsi[k - n]) / g.dz ** 2 + ALPHA * r * r + B;
      identityError = Math.max(identityError, Math.abs(lhs / (ALPHA * g.dr ** 2 / 4) - 1));
    }
    const r0 = 1, r1 = 2.32, zmax = 0.66;
    const exactCurrentIntegral = 2 * zmax * (A / 2 * (r1 ** 2 - r0 ** 2) + B / MU0 * Math.log(r1 / r0));
    const volume = 2 * Math.PI * (2 * zmax) * (r1 ** 2 - r0 ** 2) / 2;
    const primitive = (r: number) => PEAK * r * r / 2 - ALPHA / 48 * (r * r - RA * RA) ** 3;
    const exactPressureIntegral = A * 2 * Math.PI * (2 * zmax * (primitive(r1) - primitive(r0)) - B * zmax ** 3 / 3 * (r1 ** 2 - r0 ** 2) / 2);
    // Integral of -B Z²/2 over [-zmax,zmax] is -B zmax³/3.
    const axis = gridAxis(g, psi);
    return { n, dr: g.dr, dz: g.dz, basisResidual: solution.residual, iterations: solution.iterations,
      fluxLinfRelative: linf, fluxL2Relative: Math.sqrt(l2 / weight) / PEAK, boundaryRelative: boundaryError,
      truncationIdentityRelative: identityError, currentPointwiseRelative: currentError / maxAnalyticCurrent,
      exactDerivativeError, exactDerivativeIdentityRelative: exactDerivativeIdentityError, pressurePointwiseRelative: linf,
      integratedCurrent, exactCurrentIntegral, integratedCurrentRelative: Math.abs(integratedCurrent / exactCurrentIntegral - 1),
      meanPressure: pressureIntegral / volume, exactMeanPressure: exactPressureIntegral / volume,
      meanPressureRelative: Math.abs(pressureIntegral / exactPressureIntegral - 1),
      axis: { ...axis, radialErrorGridSpacings: Math.abs(axis.interpolatedR - RA) / g.dr, verticalErrorGridSpacings: Math.abs(axis.interpolatedZ) / g.dz, peakRelative: Math.abs(axis.interpolatedPeak / PEAK - 1) },
      rectangle: { rMin: g.R[0], rMax: g.R[n - 1], zMin: g.Z[0], zMax: g.Z[n - 1], exactFluxMin: Math.min(...exactPsi), exactFluxMax: Math.max(...exactPsi) },
    };
  });
  return { name: 'analytic-solovev', modelVersion: '0.1.0', verificationVersion: VERIFICATION_VERSION,
    productionPath: 'analytic_benchmark -> basis(g, {u,v}) -> original production SOR update and residual',
    rows, refinement: rows.slice(1).map((row, i) => ({ from: rows[i].n, to: row.n, fluxLinfOrder: order(rows[i].fluxLinfRelative, row.fluxLinfRelative), fluxL2Order: order(rows[i].fluxL2Relative, row.fluxL2Relative), exactDerivativeOrder: order(rows[i].exactDerivativeError, row.exactDerivativeError) })),
    limitations: ['Prescribed rectangular boundary is a verification domain, not an LCFS.', 'Pressure pointwise error is algebraically dependent on flux.', 'Derivative current is a source residual check; edge derivatives use one-sided second-order stencils.'] };
}
function boundaryDistances(g: Geometry, curve: number[][]) {
  const links: number[][] = [];
  for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
    const k = j * g.n + i;
    if (i + 1 < g.n && g.mask[k] !== g.mask[k + 1]) links.push([(g.R[i] + g.R[i + 1]) / 2, g.Z[j]]);
    if (j + 1 < g.n && g.mask[k] !== g.mask[k + g.n]) links.push([g.R[i], (g.Z[j] + g.Z[j + 1]) / 2]);
  }
  const directed = (from: number[][], to: number[][]) => {
    let maximum = 0;
    for (const [r, z] of from) { let minimum = Infinity; for (const [rr, zz] of to) minimum = Math.min(minimum, (r - rr) ** 2 + (z - zz) ** 2); maximum = Math.max(maximum, Math.sqrt(minimum)); }
    return maximum;
  };
  const diagonal = Math.hypot(g.dr, g.dz);
  return { curveIntervals: curve.length - 1, interfaceLinkCount: links.length, curveToInterfaceGridDiagonals: directed(curve, links) / diagonal, interfaceToCurveGridDiagonals: directed(links, curve) / diagonal };
}
export function shaped_benchmark() {
  const cases = [DEFAULT.delta, 0].map(delta => {
    const controls = { ...DEFAULT, delta }, curve = boundary(controls, 4096);
    const rows = GRIDS.map(n => {
      const g = geometry(controls, n), solution = basis(g), eq = equilibrium(solution, 1.2, 2, 30000);
      if (!eq.valid) throw new Error(eq.reason);
      let outsideMaskMaximum = 0, minInteriorFlux = Infinity;
      for (let k = 0; k < eq.psi.length; k++) if (!g.mask[k]) outsideMaskMaximum = Math.max(outsideMaskMaximum, Math.abs(eq.psi[k])); else minInteriorFlux = Math.min(minInteriorFlux, eq.psi[k]);
      const axis = gridAxis(g, eq.psi);
      return { n, dr: g.dr, dz: g.dz, volume: g.volume, peakFlux: eq.maxPsi, minInteriorFlux, minF2: eq.minF2, A: eq.A, B: eq.B,
        current: eq.current, meanPressure: eq.meanPressure, currentError: eq.currentError, pressureError: eq.pressureError, residual: eq.residual,
        outsideMaskMaximum, axis: { R: axis.gridR, Z: axis.gridZ }, extents: { rMin: g.R[0], rMax: g.R[n - 1], zMin: g.Z[0], zMax: g.Z[n - 1] },
        boundaryDistance: boundaryDistances(g, curve), ellipseVolumeRelative: delta === 0 ? Math.abs(g.volume / (2 * Math.PI ** 2 * MACHINE.R * MACHINE.a ** 2 * controls.kappa) - 1) : null };
    });
    const volumeDifferences = [Math.abs(rows[0].volume - rows[1].volume), Math.abs(rows[1].volume - rows[2].volume)];
    const peakDifferences = [Math.abs(rows[0].peakFlux - rows[1].peakFlux), Math.abs(rows[1].peakFlux - rows[2].peakFlux)];
    return { delta, fixedIpMA: 1.2, fixedBtT: 2, fixedPressurePa: 30000, rows,
      refinement: rows.slice(1).map((row, i) => ({ from: rows[i].n, to: row.n, volumeRelative: Math.abs(rows[i].volume / row.volume - 1), peakFluxRelative: Math.abs(rows[i].peakFlux / row.peakFlux - 1), axisDisplacementCoarseGridDiagonals: Math.hypot(row.axis.R - rows[i].axis.R, row.axis.Z - rows[i].axis.Z) / Math.hypot(rows[i].dr, rows[i].dz) })),
      volumeDifferenceRatio: volumeDifferences[1] > 0 ? volumeDifferences[0] / volumeDifferences[1] : null, volumeObservedOrder: order(...volumeDifferences as [number, number]),
      peakFluxDifferenceRatio: peakDifferences[1] > 0 ? peakDifferences[0] / peakDifferences[1] : null, peakFluxObservedOrder: order(...peakDifferences as [number, number]) };
  });
  return { name: 'shaped-convergence', modelVersion: '0.1.0', verificationVersion: VERIFICATION_VERSION, cases,
    limitations: ['Staircase mask diagnostics do not imply second-order convergence or LCFS contour accuracy.', 'No experimental validation or MHD stability claim.'] };
}
export function run_verification() {
  return { modelVersion: '0.1.0', verificationVersion: VERIFICATION_VERSION, analytic: analytic_benchmark(), shaped: shaped_benchmark(),
    limitations: ['Developer numerical measurements only; independent validation and Director acceptance are separate.', 'Ledger, regression, timestep, typecheck and build evidence are produced by their dedicated test harnesses.'] };
}
