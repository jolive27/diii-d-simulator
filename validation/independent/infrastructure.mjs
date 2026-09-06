import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,hash,fingerprint} from '../../tools/workflow.mjs';
import {allowed} from '../../tools/dispatch-agent.mjs';
import {DEFAULT, geometry, basis, equilibrium} from '../../physics/engine.ts';
import {run_shot,run_benchmark,parameter_sweep,get_metrics,export_results} from '../../physics/api.ts';
const baseline='b07537877cec168d20783a3cfc45366fccbd4538';
const results=[];
async function check(name,fn){let detail;try{detail=await fn();results.push({name,status:'PASS',detail});}catch(e){results.push({name,status:'FAIL',detail:e.stack});}}
await check('m01-regression',()=>{
 const old=execFileSync('git',['show',`${baseline}:physics/engine.ts`],{cwd:root});
 assert.equal(hash(old),hash(fs.readFileSync(path.join(root,'physics/engine.ts'))));
 const {equilibriumCheckpoints,...saved}=JSON.parse(fs.readFileSync(path.join(root,'experiments/baseline/m01-shot.json')));assert.deepEqual(run_shot(),saved);const g=geometry(DEFAULT),b=basis(g);for(const {time,R,Z,...expected} of equilibriumCheckpoints){const sample=saved.samples.find(s=>s.t===time);assert.ok(sample);assert.deepEqual(equilibrium(b,sample.ip,DEFAULT.bt,sample.pressure),expected);assert.deepEqual(g.R,R);assert.deepEqual(g.Z,Z);}
 const tests=spawnSync(process.execPath,['--experimental-strip-types','--test','tests/physics.test.mjs'],{cwd:root,encoding:'utf8'});
 assert.equal(tests.status,0,tests.stdout+tests.stderr);
 return {baseline,engineSha256:hash(old),sampleCount:run_shot().samples.length,testOutput:tests.stdout+tests.stderr};
});
await check('api-contract',()=>{
 const shot=run_shot(),before=JSON.stringify(shot);assert.deepEqual(run_benchmark('baseline'),shot);
 const metrics=get_metrics(shot);assert.equal(metrics.peakElectronTemperatureKeV,Math.max(...shot.samples.map(s=>s.te)));
 assert.equal(metrics.maxAbsEnergyError,Math.max(...shot.samples.map(s=>Math.abs(s.energyError))));
 assert.deepEqual(JSON.parse(export_results(shot)),shot);
 const [header,...lines]=export_results(shot,'csv').trim().split('\n');const fields=header.split(',');assert.equal(lines.length,shot.samples.length);
 lines.forEach((line,i)=>assert.deepEqual(line.split(',').map(Number),fields.map(f=>shot.samples[i][f])));
 assert.equal(JSON.stringify(shot),before);
 const config=Object.freeze({controls:Object.freeze({ech:2})});const sweep=parameter_sweep(config,'nbi',[6,3,6]);
 assert.deepEqual(sweep.map(s=>s.controls.nbi),[6,3,6]);assert.deepEqual(sweep[0],sweep[2]);assert.notEqual(sweep[0],sweep[2]);
 for(const bad of [null,[],{dt:0},{dt:Infinity},{gridSize:18},{controls:{gas:NaN}},{controls:{nbi:13}},{unknown:1}])assert.throws(()=>run_shot(bad));
 assert.throws(()=>run_benchmark('unimplemented'));assert.throws(()=>parameter_sweep({},'unknown',[1]));assert.throws(()=>export_results(shot,'xml'));
 return {verified:['baseline equivalence','numeric CSV round trip','JSON round trip','metrics independently reduced','ordered duplicate sweep','immutable inputs','invalid input rejection'],sampleCount:shot.samples.length};
});
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'diiid-independent-'));
const put=(f,value)=>{const p=path.join(fixture,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'?value:JSON.stringify(value));};
try{
 for(const f of ['tools/workflow.mjs','tools/dispatch-agent.mjs','agents/permissions.json','validation/science-lock.json','science/constants.json','science/models.json','science/assumptions.yaml','science/equations.md'])put(f,fs.readFileSync(path.join(root,f),'utf8'));
 put('.gitignore','work/\n');put('physics/engine.ts','export const unchanged=1;\n');execFileSync('git',['init','-q'],{cwd:fixture});
 const w=await import(pathToFileURL(path.join(fixture,'tools/workflow.mjs')).href);
 await check('acceptance-gates',()=>{
  const spec={requiredChecks:['independent']};put('specs/infrastructure.json',spec);put('validation/infrastructure-approval.json',{role:'director',specHash:hash(JSON.stringify(spec))});
  put('validation/evidence/test.txt','independently generated evidence');
  const base=()=>({role:'validation',agentId:'validator',implementationAgentId:'software',status:'PASS',sourceFingerprint:w.fingerprint(),checks:[{name:'independent',status:'PASS',evidence:'validation/evidence/test.txt',sha256:hash('independently generated evidence')}]});
  const cases=[];const expect=(name,status)=>{const result=w.gate('infrastructure');cases.push({name,...result});assert.equal(result.status,status,name+JSON.stringify(result));};
  expect('missing report','FAIL');put('validation/infrastructure-report.json',base());expect('valid positive control','PASS');
  for(const [name,mutate] of [['failing status',r=>r.status='FAIL'],['inconclusive',r=>r.status='INCONCLUSIVE'],['same agent',r=>r.agentId='software'],['missing check',r=>r.checks=[]],['failing check',r=>r.checks[0].status='FAIL'],['wrong hash',r=>r.checks[0].sha256='bad'],['missing evidence',r=>r.checks[0].evidence='validation/evidence/missing']]){const r=base();mutate(r);put('validation/infrastructure-report.json',r);expect(name,'FAIL');}
  put('validation/infrastructure-report.json',base());put('physics/engine.ts','export const unchanged=2;\n');expect('stale source','FAIL');
  put('validation/infrastructure-report.json',base());put('specs/infrastructure.json',{...spec,changed:true});expect('stale approval','FAIL');
  put('specs/infrastructure.json',spec);const r=base();delete r.implementationAgentId;put('validation/infrastructure-report.json',r);expect('missing implementation agent identity','FAIL');
  const empty={requiredChecks:[]};put('specs/infrastructure.json',empty);put('validation/infrastructure-approval.json',{role:'director',specHash:hash(JSON.stringify(empty))});put('validation/infrastructure-report.json',base());expect('empty required checks','FAIL');put('specs/infrastructure.json',spec);put('validation/infrastructure-approval.json',{role:'director',specHash:hash(JSON.stringify(spec))});put('science/constants.json','{}');put('validation/infrastructure-report.json',base());expect('unapproved science changes with fresh report','FAIL');put('science/constants.json',fs.readFileSync(path.join(root,'science/constants.json'),'utf8'));put('specs/m02.json',spec);put('validation/m02-approval.json',{role:'director',specHash:hash(JSON.stringify(spec))});put('validation/m02-report.json',base());const missingPredecessor=w.gate('m02');assert.equal(missingPredecessor.status,'FAIL');assert.ok(missingPredecessor.errors.includes('Infrastructure not accepted'));cases.push({name:'M02 missing infrastructure acceptance',...missingPredecessor});put('validation/infrastructure-decision.json',{status:'ACCEPTED'});assert.equal(w.gate('m02').status,'PASS');return {fixtureIsolation:true,cases};
 });
 await check('permission-boundaries',()=>{
  const tested=[];for(const [role,file,expected] of [['physics','specs/proposals/new.json',true],['physics','science/constants.json',false],['software','physics/api.ts',true],['software','validation/m02-report.json',false],['validation','validation/evidence/new.json',true],['validation','physics/engine.ts',false],['validation','validation/m02-decision.json',false],['validation','validation/evidence/../../physics/engine.ts',false],['unknown','physics/engine.ts',false]]){assert.equal(allowed(role,file),expected);tested.push({role,file,expected});}
  const mock=path.join(fixture,'mock-codex');put('mock-codex',`#!/usr/bin/env node\nconst fs=require('fs'),path=require('path');const args=process.argv.slice(2),dir=args[args.indexOf('-C')+1];fs.mkdirSync(path.join(dir,'physics'),{recursive:true});fs.writeFileSync(path.join(dir,'physics/engine.ts'),'out of role');\n`);fs.chmodSync(mock,0o755);
  const prior=fs.readFileSync(path.join(fixture,'physics/engine.ts'),'utf8');const out=spawnSync(process.execPath,['tools/dispatch-agent.mjs','validation','negative-test','test'],{cwd:fixture,env:{...process.env,CODEX_BIN:mock,PATH:path.dirname(process.execPath)+':'+process.env.PATH},encoding:'utf8'});
  assert.equal(out.status,1,out.stdout+out.stderr);const record=JSON.parse(fs.readFileSync(path.join(fixture,'experiments/records/negative-test.json')));assert.equal(record.status,'REJECTED');assert.ok(record.violations.includes('physics/engine.ts'));assert.equal(fs.readFileSync(path.join(fixture,'physics/engine.ts'),'utf8'),prior);
  return {tested,dispatcherRecord:record,limitation:'Native agents share filesystem. Dispatcher provides separate working copy and rejects out-of-role outputs; it does not authenticate hostile same-user processes or automatically merge.'};
 });
}finally{fs.rmSync(fixture,{recursive:true,force:true});}
await check('persistent-roles',()=>{const roles=['director','physics','software','validation'];const docs=roles.map(role=>{const text=fs.readFileSync(path.join(root,`agents/${role}.md`),'utf8');assert.ok(text.length>150);return {role,sha256:hash(text)};});const contract=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');assert.match(contract,/persistent development roles/i);assert.match(contract,/real separate agents/i);assert.match(contract,/share a filesystem/i);return {docs,independentAgentId:'/root/validation',implementationAgentId:'/root/software',scope:'Persistent role documents and contract; live role dispatch identity confirmed by Director coordination records.'};});
for(const result of results)fs.writeFileSync(path.join(root,`validation/evidence/${result.name}.json`),JSON.stringify({...result,sourceFingerprint:fingerprint(),time:new Date().toISOString()},null,2)+'\n');
console.log(JSON.stringify(results.map(({name,status,detail})=>({name,status,...(status==='FAIL'?{detail:String(detail).slice(0,2000)}:{})})),null,2));process.exitCode=results.some(r=>r.status!=='PASS')?1:0;
