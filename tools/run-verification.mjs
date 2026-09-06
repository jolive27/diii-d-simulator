#!/usr/bin/env node
// Deterministic developer evidence: stdout only; no milestone acceptance or report writes.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { run_benchmark } from '../physics/api.ts';
const name = process.argv[2] ?? 'm02';
if (process.argv.length > 3 || !['m02', 'analytic-solovev', 'shaped-convergence'].includes(name)) {
  console.error('Usage: node --experimental-strip-types tools/run-verification.mjs [m02|analytic-solovev|shaped-convergence]');
  process.exitCode = 2;
} else {
  try {
    const sourceHashes = Object.fromEntries(['physics/engine.ts', 'physics/verification.ts', 'physics/api.ts', 'specs/m02.json'].map(path => [path, createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex')]));
    console.log(JSON.stringify({ artifactType: 'developer-numerical-measurements', runtimeVersion: process.version, sourceHashes, measurements: run_benchmark(name) }, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nonfinite metric blocks evidence export');
      return value;
    }, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
