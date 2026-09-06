/** Pure infrastructure API. The M01 engine remains the sole physics implementation. */
import { DEFAULT, LIMITS, geometry, runShot } from './engine.ts';
import type { Controls, Sample, Shot } from './engine.ts';

export type ShotConfig = {
  controls?: Partial<Controls>;
  gridSize?: number;
  dt?: number;
};
export type ShotMetrics = {
  sampleCount: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  peakElectronTemperatureKeV: number;
  peakIonTemperatureKeV: number;
  peakDensity1e19PerM3: number;
  peakThermalEnergyMJ: number;
  peakBetaPercent: number;
  maxAbsEnergyError: number;
  maxAbsParticleError: number;
};

function requireObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}
function rejectUnknownKeys(value: object, allowed: readonly string[], name: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown ${name} field: ${key}`);
  }
}
function normalize(config: ShotConfig): { controls: Controls; gridSize: number; dt: number } {
  requireObject(config, 'Shot config');
  rejectUnknownKeys(config, ['controls', 'gridSize', 'dt'], 'config');
  if (config.controls !== undefined) {
    requireObject(config.controls, 'Controls');
    rejectUnknownKeys(config.controls, Object.keys(LIMITS), 'control');
  }
  const gridSize = config.gridSize === undefined ? 49 : config.gridSize;
  const dt = config.dt === undefined ? 0.002 : config.dt;
  if (!Number.isInteger(gridSize) || gridSize < 17 || gridSize > 129 || gridSize % 2 !== 1) {
    throw new Error('Grid must be odd, 17–129');
  }
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.01) {
    throw new Error('Time step must be >0 and <=0.01 s');
  }
  return { controls: { ...DEFAULT, ...config.controls }, gridSize, dt };
}

/** Default config is exactly the existing M01 runShot(DEFAULT, geometry(DEFAULT)). */
export function run_shot(config: ShotConfig = {}): Shot {
  const { controls, gridSize, dt } = normalize(config);
  return runShot(controls, geometry(controls, gridSize), dt);
}

/** Infrastructure baseline only: this name makes no new validation claim. */
export function run_benchmark(name: 'baseline'): Shot {
  if (name !== 'baseline') throw new Error(`Unsupported benchmark: ${String(name)}`);
  return run_shot();
}

/** Ordered single-control sweep. Any failed run throws; no partial result is returned. */
export function parameter_sweep(config: ShotConfig, control: keyof Controls, values: readonly number[]): Shot[] {
  normalize(config);
  if (!Object.prototype.hasOwnProperty.call(LIMITS, control)) {
    throw new Error(`Unknown sweep control: ${String(control)}`);
  }
  if (!Array.isArray(values) || values.length === 0) throw new Error('Sweep values must be a nonempty array');
  return Array.from(values, value => run_shot({ ...config, controls: { ...config.controls, [control]: value } }));
}

/** Summaries of stored samples, not extrema of an interpolated or continuous solution. */
export function get_metrics(shot: Shot): ShotMetrics {
  if (shot.samples.length === 0) throw new Error('Cannot summarize an empty shot');
  const metrics: ShotMetrics = {
    sampleCount: shot.samples.length,
    startTimeSeconds: shot.samples[0].t,
    endTimeSeconds: shot.samples[shot.samples.length - 1].t,
    peakElectronTemperatureKeV: -Infinity,
    peakIonTemperatureKeV: -Infinity,
    peakDensity1e19PerM3: -Infinity,
    peakThermalEnergyMJ: -Infinity,
    peakBetaPercent: -Infinity,
    maxAbsEnergyError: 0,
    maxAbsParticleError: 0,
  };
  for (const sample of shot.samples) {
    metrics.peakElectronTemperatureKeV = Math.max(metrics.peakElectronTemperatureKeV, sample.te);
    metrics.peakIonTemperatureKeV = Math.max(metrics.peakIonTemperatureKeV, sample.ti);
    metrics.peakDensity1e19PerM3 = Math.max(metrics.peakDensity1e19PerM3, sample.ne);
    metrics.peakThermalEnergyMJ = Math.max(metrics.peakThermalEnergyMJ, sample.we + sample.wi);
    metrics.peakBetaPercent = Math.max(metrics.peakBetaPercent, sample.beta);
    metrics.maxAbsEnergyError = Math.max(metrics.maxAbsEnergyError, Math.abs(sample.energyError));
    metrics.maxAbsParticleError = Math.max(metrics.maxAbsParticleError, Math.abs(sample.particleError));
  }
  return metrics;
}

const SAMPLE_FIELDS: readonly (keyof Sample)[] = [
  't', 'ip', 'ne', 'te', 'ti', 'we', 'wi', 'nbi', 'ech', 'pOhm', 'pLoss', 'pRad',
  'tauE', 'pressure', 'beta', 'energyError', 'particleError',
];
/** Returns text only. Callers choose whether and where to persist it. */
export function export_results(shot: Shot, format: 'json' | 'csv' = 'json'): string {
  if (format === 'json') return JSON.stringify(shot, null, 2);
  if (format === 'csv') {
    return [SAMPLE_FIELDS.join(','), ...shot.samples.map(sample => SAMPLE_FIELDS.map(field => sample[field]).join(','))].join('\n') + '\n';
  }
  throw new Error(`Unsupported export format: ${String(format)}`);
}
