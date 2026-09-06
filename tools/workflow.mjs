import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateCapabilityPolicy} from './capability-policy.mjs';
export const root=path.resolve(import.meta.dirname,'..');
export const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
export const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
export function snapshot(){const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);return Object.fromEntries(names.filter(p=>/^(physics|app|components|lib|tests|science|specs|tools|agents)\//.test(p)||['package.json','pnpm-lock.yaml','AGENTS.md','tsconfig.json','vite.config.ts','next.config.ts','.openai/hosting.json'].includes(p)).sort().map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]));}
export const fingerprint=()=>hash(JSON.stringify(snapshot()));
export function audit(event){const p=path.join(root,'experiments/records/audit.jsonl');fs.mkdirSync(path.dirname(p),{recursive:true});const lines=fs.existsSync(p)?fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean):[];const previous=lines.length?hash(lines.at(-1)):null;fs.appendFileSync(p,JSON.stringify({time:new Date().toISOString(),previous,...event})+'\n');}
export function capabilityGate(spec,phase='acceptance'){
 try{return validateCapabilityPolicy(spec,{root,policy:read('science/capability-policy.json'),phase});}
 catch{return {status:'FAIL',errors:['Missing or unreadable capability policy'],legacyExemption:false};}
}
export function gate(m){
 const errors=[];let spec,approval,report;
 try{spec=read(`specs/${m}.json`);approval=read(`validation/${m}-approval.json`);report=read(`validation/${m}-report.json`);}catch(e){return {status:'FAIL',errors:['Missing specification, approval, or independent report']};}
 const capability=capabilityGate(spec);errors.push(...capability.errors);
 if(!capability.legacyExemption&&approval.capabilityPolicyReview?.status!=='REVIEWED')errors.push('Director capability artifact review is missing');
 if(spec.normativeMarkdownHash){try{if(hash(fs.readFileSync(path.join(root,spec.specification)))!==spec.normativeMarkdownHash)errors.push('Normative physics specification changed without approval');}catch{errors.push('Normative physics specification missing');}}
 if(approval.role!=='director'||approval.specHash!==hash(JSON.stringify(spec)))errors.push('Physics specification lacks current Director approval');
 if(report.role!=='validation'||!report.agentId||!report.implementationAgentId||report.agentId===report.implementationAgentId)errors.push('Independent agent identity missing or not independent');
 if(!Array.isArray(spec.requiredChecks)||spec.requiredChecks.length===0)errors.push('Required checks cannot be empty');
 try { const lock=read('validation/science-lock.json'); for(const [file,digest] of Object.entries(lock.files)){if(hash(fs.readFileSync(path.join(root,file)))!==digest)errors.push(`Unapproved science registry change: ${file}`);} } catch { errors.push('Missing science registry lock'); }
 if(report.status!=='PASS')errors.push('Independent validation is not PASS');
 if(report.sourceFingerprint!==fingerprint())errors.push('Validation evidence is stale for current source');
 for(const name of spec.requiredChecks||[]){const c=report.checks?.find(c=>c.name===name);if(!c||c.status!=='PASS'||!c.evidence)errors.push(`Required check failed/missing: ${name}`);else {try{if(hash(fs.readFileSync(path.join(root,c.evidence)))!==c.sha256)errors.push(`Evidence altered: ${name}`);}catch{errors.push(`Evidence missing: ${name}`);}}}
 if(m==='m02'){try{if(read('validation/infrastructure-decision.json').status!=='ACCEPTED')errors.push('Infrastructure not accepted');}catch{errors.push('Infrastructure not accepted');}}
 if(m==='m03'){try{if(read('validation/m02-decision.json').status!=='ACCEPTED')errors.push('M02 not accepted; M03 blocked');}catch{errors.push('M02 not accepted; M03 blocked');}}
 return {status:errors.length?'FAIL':'PASS',errors,sourceFingerprint:fingerprint()};
}
if(process.argv[1]===import.meta.filename){const [cmd,m]=process.argv.slice(2);if(cmd==='fingerprint')console.log(fingerprint());else if(cmd==='gate'){const g=gate(m);console.log(JSON.stringify(g,null,2));process.exitCode=g.status==='PASS'?0:1;}else if(cmd==='approve'){const spec=read(`specs/${m}.json`);const capability=capabilityGate(spec,'approval');if(capability.status!=='PASS'){console.error(JSON.stringify(capability,null,2));process.exitCode=1;}else{write(`validation/${m}-approval.json`,{role:'director',agentId:'/root',specHash:hash(JSON.stringify(spec)),time:new Date().toISOString(),capabilityPolicyReview:{status:'REVIEWED',legacyExemption:capability.legacyExemption,scope:'Director approval covers scientific adequacy of declared capability artifacts and reference availability rationale; automated checks establish completeness and integrity only.'}});audit({role:'director',action:'approve-spec',milestone:m,specHash:hash(JSON.stringify(spec)),capabilityPolicyReviewed:true});}}else if(cmd==='accept'){const g=gate(m);const decision={...g,status:g.status==='PASS'?'ACCEPTED':'REJECTED',role:'director',agentId:'/root',time:new Date().toISOString()};write(`validation/${m}-decision.json`,decision);audit({role:'director',action:'milestone-decision',milestone:m,...decision});console.log(JSON.stringify(decision,null,2));process.exitCode=g.status==='PASS'?0:1;}else throw Error('Use fingerprint | gate MILESTONE | approve MILESTONE | accept MILESTONE');}
