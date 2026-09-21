/** Batched Jev evaluation client (JS port of python/d3gate/jev.py). */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const BASE = 'https://api.typesafe.ai/v1/systemone';
const RETRY_STATUSES = new Set([429, 529]);
const KEY_FILE = path.join(os.homedir(), '.config/opencode/.secrets/jev.key');
const LEDGER_DEFAULT = path.join(os.homedir(), '.local/share/opencode/jev-usage.jsonl');

export function jevKey() {
  const env = process.env.JEV_API_KEY?.trim();
  if (env) return env;
  if (fs.existsSync(KEY_FILE)) {
    const k = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (k) return k;
  }
  throw new Error('JEV_API_KEY not set and ~/.config/opencode/.secrets/jev.key is missing');
}

function appendLedger(body, model, state, questions) {
  try {
    const ledger = process.env.D3GATE_JEV_LEDGER || LEDGER_DEFAULT;
    const usage = body?.usage || {};
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.appendFileSync(ledger, JSON.stringify({
      time: new Date().toISOString(),
      model,
      questions: Object.keys(questions).length,
      state_chars: state.length,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
    }) + '\n');
  } catch { /* best-effort */ }
}

export async function evaluate(state, questions, { model = 'jev-latest', retries = 4 } = {}) {
  const payload = JSON.stringify({ model, state, questions });
  let last;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt) {
      const seconds = 0.5 * 2 ** (attempt - 1) + Math.random() * 0.25;
      await new Promise(r => setTimeout(r, seconds * 1000));
    }
    try {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jevKey()}`, 'Content-Type': 'application/json' },
        body: payload,
      });
      if (RETRY_STATUSES.has(res.status)) {
        last = new Error(`Jev API ${res.status}: ${(await res.text()).slice(0, 300)}`);
        continue;
      }
      if (!res.ok) throw new Error(`Jev API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = await res.json();
      if (!(body && typeof body === 'object' && 'answers' in body)) {
        throw new Error(`Unexpected Jev response shape: ${JSON.stringify(body).slice(0, 300)}`);
      }
      appendLedger(body, model, state, questions);
      return body;
    } catch (err) {
      if (!(err && err.message && err.message.startsWith('Jev API'))) throw err;
      last = err;
    }
  }
  throw last || new Error('Jev retries exhausted');
}

export function scored(answers, id) {
  return answers?.[id] ?? null;
}

export function numeric(answer) {
  if (!answer) return null;
  if (typeof answer.noul === 'number') return answer.noul;
  if (typeof answer.probability === 'number') return answer.probability;
  if (typeof answer.value === 'number') return answer.value;
  if (typeof answer.score === 'number') return answer.score;
  if (answer.score && typeof answer.score === 'object' && typeof answer.score.value === 'number') return answer.score.value;
  // Live shape: { choice: "opt", confidence, probabilities: { opt: p } }.
  if (typeof answer.choice === 'string') {
    return typeof answer.confidence === 'number' ? answer.confidence : answer.probabilities?.[answer.choice] ?? null;
  }
  if (answer.choice && typeof answer.choice === 'object') {
    return Math.max(0, ...Object.values(answer.choice).filter(v => typeof v === 'number'));
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd !== 'evaluate') {
    console.error('Use: node tools/teamflow/jev.mjs evaluate');
    process.exit(1);
  }
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', async () => {
    try {
      const { state, questions, model } = JSON.parse(raw);
      const body = await evaluate(state, questions, { model: model || 'jev-latest' });
      console.log(JSON.stringify(body));
    } catch (err) {
      console.error(err.message || String(err));
      process.exit(1);
    }
  });
}