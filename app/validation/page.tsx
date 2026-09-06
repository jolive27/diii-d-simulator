'use client';

import { useEffect, useState } from 'react';
import './validation.css';

type Check = { name: string; status: string; detail?: unknown; [key: string]: unknown };
type Report = {
  status: string;
  generatedAt?: string;
  sourceVersion?: string;
  sourceFingerprint?: unknown;
  directorDecision?: unknown;
  modelVersion?: string;
  verificationVersion?: string;
  checks: Check[];
  gridConvergence?: unknown[];
  limitations?: unknown[];
  [key: string]: unknown;
};
type Evidence = { report: Report | null; results: unknown; downloadableReport: boolean; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function display(value: unknown): string {
  if (value === null || value === undefined) return 'Not recorded';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
function statusStyle(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'pass' || normalized === 'passed') return 'is-pass';
  if (normalized === 'fail' || normalized === 'failed') return 'is-fail';
  return 'is-pending';
}
function Detail({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <p className="validation-muted">No detail recorded.</p>;
  if (!isRecord(value)) return <pre className="validation-detail">{display(value)}</pre>;
  return <dl className="validation-details">{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{key}</dt><dd><pre>{display(entry)}</pre></dd></div>)}</dl>;
}
function GridTable({ rows }: { rows: unknown[] }) {
  const records = rows.map(row => isRecord(row) ? row : { value: row });
  const columns = [...new Set(records.flatMap(row => Object.keys(row)))];
  return <div className="validation-table-wrap"><table><caption>Recorded grid convergence measurements</caption><thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{records.map((row, i) => <tr key={i}>{columns.map(column => <td key={column}><pre>{display(row[column])}</pre></td>)}</tr>)}</tbody></table></div>;
}

export default function ValidationPage() {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load(path: string) {
      const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    }
    Promise.allSettled([load('/validation-results.json'), load('/validation-report.json')]).then(([reportResult, rawResult]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];
      let report: Report | null = null;
      if (reportResult.status === 'fulfilled') {
        const value = reportResult.value;
        if (isRecord(value) && typeof value.status === 'string' && Array.isArray(value.checks) && value.checks.every(check => isRecord(check) && typeof check.name === 'string' && typeof check.status === 'string')) {
          report = value as Report;
        } else errors.push('The report has an unsupported format. No verification status can be shown.');
      } else errors.push('The verification report is unavailable. Run and export verification to populate this page.');
      if (rawResult.status === 'rejected') errors.push('The full report download is unavailable.');
      setEvidence({ report, results: reportResult.status === 'fulfilled' ? reportResult.value : null, downloadableReport: rawResult.status === 'fulfilled', errors });
    });
    return () => controller.abort();
  }, []);
  const report = evidence?.report;
  const status = report?.status || (evidence ? 'Not run' : 'Loading');
  const grids = Array.isArray(report?.gridConvergence) ? report.gridConvergence : [];
  return <main className="validation-page">
    <header className="validation-header"><a href="/" className="validation-back">← Back to virtual shot</a><span>PHYSICS EVIDENCE</span></header>
    <section className="validation-intro"><div><p className="validation-eyebrow">DIII-D VIRTUAL SHOT</p><h1>Verification dashboard</h1><p>Recorded numerical checks, measured errors, and acceptance limits. These results describe the saved evidence, not the current shot controls.</p></div><a className={`validation-download ${evidence?.downloadableReport ? '' : 'is-disabled'}`} href={evidence?.downloadableReport ? '/validation-report.json' : undefined} download="diii-d-validation-report.json" aria-disabled={!evidence?.downloadableReport}>Download report ↓</a></section>
    <section className="validation-summary" aria-label="Report provenance">
      <div><span>Recorded status</span><strong className={`validation-badge ${statusStyle(status)}`} role="status">{status}</strong></div>
      <div><span>Generated at</span><strong>{display(report?.generatedAt)}</strong></div>
      <div><span>Model version</span><strong>{display(report?.modelVersion)}</strong></div>
      <div><span>Verification version</span><strong>{display(report?.verificationVersion)}</strong></div>
      <div><span>Source fingerprint / version</span><strong>{display(report?.sourceFingerprint ?? report?.sourceVersion)}</strong></div>
      <div><span>Director decision</span><strong>{display(report?.directorDecision)}</strong></div>
    </section>
    {Array.isArray(report?.errors) && report.errors.length > 0 && <div className="validation-notice">{report.errors.map((error, i) => <p key={i}>{display(error)}</p>)}</div>}
    {evidence?.errors.length ? <div className="validation-notice" role="status">{evidence.errors.map(error => <p key={error}>{error}</p>)}</div> : null}
    <section className="validation-section"><div className="validation-section-heading"><h2>Numerical checks</h2><span>{report ? `${report.checks.length} recorded` : 'No report available'}</span></div>
      {report?.checks.length ? <div className="validation-checks">{report.checks.map((check, index) => {
        const extra = Object.fromEntries(Object.entries(check).filter(([key]) => !['name', 'status', 'detail'].includes(key)));
        return <article className="validation-check" key={`${index}-${check.name}`}><div className="validation-check-heading"><h3>{check.name}</h3><span className={`validation-badge ${statusStyle(check.status)}`}>{check.status}</span></div><details><summary>Measurements, limits and evidence</summary><Detail value={check.detail}/>{Object.keys(extra).length > 0 && <Detail value={extra}/>}</details></article>;
      })}</div> : <p className="validation-empty">{evidence ? 'No numerical checks have been recorded in an available report.' : 'Loading the saved verification evidence…'}</p>}
    </section>
    <section className="validation-section"><h2>Grid convergence</h2>{grids.length ? <GridTable rows={grids}/> : <p className="validation-empty">No grid convergence table recorded in the report.</p>}</section>
    <section className="validation-section validation-limitations"><h2>Scope and limitations</h2><p>Numerical verification checks implementation against stated mathematical targets. It does not establish agreement with experimental DIII-D shots.</p>{Array.isArray(report?.limitations) && report.limitations.length > 0 ? <ul>{report.limitations.map((item, i) => <li key={i}>{display(item)}</li>)}</ul> : <p className="validation-muted">No additional limitations recorded in an available report.</p>}</section>
    {evidence?.results !== null && evidence?.results !== undefined && <section className="validation-section"><div className="validation-section-heading"><h2>Supporting results</h2><a href="/validation-results.json" download="diii-d-validation-results.json">Download results ↓</a></div><details><summary>Inspect the saved results data</summary><pre className="validation-raw">{display(evidence.results)}</pre></details></section>}
    <footer className="validation-footer">Independent educational project · Static evidence snapshot · No live agent decisions</footer>
  </main>;
}
