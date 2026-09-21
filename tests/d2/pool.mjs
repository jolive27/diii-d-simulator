// Runs the long fixture jobs in worker threads (bounded pool); each job is an independent deterministic kernel run.
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { fixtureCacheSet } from './fixtures.mjs';

const workerUrl = new URL('./worker.mjs', import.meta.url);
const runOne = job => new Promise((resolve, reject) => {
  const w = new Worker(workerUrl, { workerData: job });
  w.once('message', m => resolve(m)); w.once('error', reject);
  w.once('exit', code => { if (code !== 0) reject(new Error(`worker for ${JSON.stringify(job)} exited ${code}`)); });
});
export async function runJobs(jobs, size = Math.max(2, Math.min(6, os.availableParallelism() - 1))) {
  const out = new Array(jobs.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, async () => { while (next < jobs.length) { const k = next++; out[k] = await runOne(jobs[k]); } }));
  jobs.forEach((j, k) => { if (out[k].u) fixtureCacheSet(j.id, j.N, j.dt, j.t, out[k].u); });
  return out;
}
