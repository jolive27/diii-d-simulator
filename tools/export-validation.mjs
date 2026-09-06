/** Publish a read-only copy of independently recorded evidence for the dashboard. */
import fs from 'node:fs';
import path from 'node:path';
import {root,read,write,gate} from './workflow.mjs';
const milestone=process.argv[2]||'m02';
const report=read(`validation/${milestone}-report.json`);
const checked=gate(milestone);
let decision;try{decision=read(`validation/${milestone}-decision.json`)}catch{decision={status:'NOT_ACCEPTED'}}
const labels={
'M02-REGRESSION-EXACT':'Milestone 01 preserved exactly',
'M02-OPERATOR-PROVENANCE':'Shared production solver',
'M02-ANALYTIC-IDENTITY':"Solov’ev equation and discretization",
'M02-RECT-FLUX':'Analytic flux accuracy and convergence',
'M02-RECT-BOUNDARY-AXIS':'Boundary and magnetic axis',
'M02-RECT-CURRENT-PRESSURE':'Current and pressure reconstruction',
'M02-SHAPED-CONVERGENCE':'Shaped plasma grid refinement',
'M02-LEDGERS-INDEPENDENT':'Independent particle and energy balances',
'M02-LEDGERS-NEGATIVE':'Deliberate balance errors detected',
'M02-PARTICLE-ANALYTIC':'Analytic particle evolution',
'M02-TIMESTEP-CONVERGENCE':'Time-step convergence',
'M02-STABILITY-GUARDS':'Numerical stability and invalid-state guards',
'M02-EXISTING-TESTS':'Existing regression tests',
'M02-TYPECHECK':'Code consistency',
'M02-BUILD':'Application build',
'M02-SCIENTIFIC-SCOPE':'Educational model and assumptions preserved'
};
const checks=report.checks.map(c=>{let evidence;try{evidence=read(c.evidence)}catch{evidence={note:'Evidence is available in the repository report'}}return {...c,id:c.name,name:labels[c.name]||c.name,detail:evidence.detail??evidence};});
const summary={status:checked.status==='PASS'&&decision.status==='ACCEPTED'?'PASS':checked.status==='FAIL'?'FAIL':'NOT_ACCEPTED',generatedAt:new Date().toISOString(),modelVersion:'0.1.0',verificationVersion:'0.2.0',sourceFingerprint:report.sourceFingerprint,directorDecision:decision.status,checks,gridConvergence:report.gridConvergence||[],limitations:report.limitations||['Educational, uncalibrated model; numerical verification is not experimental validation.'],errors:checked.errors};
write('public/validation-results.json',summary);
write('public/validation-report.json',{...report,directorDecision:decision});
console.log(`Exported ${milestone}: ${summary.status}`);
