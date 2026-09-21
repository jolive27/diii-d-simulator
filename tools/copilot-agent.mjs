/**
 * Director-operated isolated-workspace dispatcher for the headless Copilot backend
 * (`copilot -s -p`, GitHub Copilot CLI). Outputs are never automatically merged.
 * Mirrors dispatch-agent.mjs: same isolation, snapshot, out-of-role refusal, record,
 * audit and exit-code contract.
 *
 * Diff strategy: only regular files are copied into the isolated checkout and only
 * regular files participate in the changed-file check, so untracked symlinks
 * (`git check-ignore`-clean ones like `.claude/skills/...`) cannot trip the diff.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {root,read,hash,write,audit} from './workflow.mjs';
export function allowed(role,file){return (read('agents/permissions.json')[role]||[]).some(p=>p.endsWith('/')?file.startsWith(p):file===p)&&!file.split('/').includes('..');}
function regularFiles(dir){
 const out=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='.git')continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.isSymbolicLink()){try{if(!fs.statSync(p).isFile())continue;out.push(p);}catch{continue;}}else if(e.isFile())out.push(p);}};walk(dir);return out.map(p=>path.relative(dir,p).split(path.sep).join('/'));
}
if(process.argv[1]===import.meta.filename){
 const [role,id,...words]=process.argv.slice(2);if(!['physics','software','validation'].includes(role)||!/^[-a-z0-9]+$/.test(id||''))throw Error('Usage: copilot-agent.mjs physics|software|validation TASK-ID TASK');
 const dir=path.join(root,'work/agents',id);if(fs.existsSync(dir))throw Error('Task ID already exists; inspect existing record');fs.mkdirSync(dir,{recursive:true});
 const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 const before={};for(const f of names){const s=path.join(root,f);let st;try{st=fs.lstatSync(s);}catch{continue;}if(!st.isFile()||st.isSymbolicLink())continue;before[f]=hash(fs.readFileSync(s));fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.copyFileSync(s,path.join(dir,f));}
 execFileSync('git',['init','-q'],{cwd:dir});
 const model=process.env.COPILOT_MODEL||'auto';
 const prompt=`You are the ${role} development agent. Read agents/${role}.md and AGENTS.md. Work only in this isolated checkout. Allowed output paths: ${JSON.stringify(read('agents/permissions.json')[role])}. Never accept milestones or alter permissions. Task: ${words.join(' ')}`;
 audit({role:'director',action:'dispatch',task:id,agentRole:role,model:`copilot-cli:${model}`,reasoning:'auto',isolation:'isolated-checkout'});
 const log=fs.openSync(path.join(root,`work/agents/${id}.jsonl`),'w');
 const args=['-s','-p',prompt,'--allow-tool=write',...(model==='auto'?[]:['--model',model])];
 const result=spawnSync('copilot',args,{cwd:dir,stdio:['ignore',log,log]});
 fs.closeSync(log);
 const afterFiles=regularFiles(dir);const changed=[...new Set(afterFiles)].filter(f=>{try{return hash(fs.readFileSync(path.join(dir,f)))!==before[f]}catch{return true}});
 const violations=changed.filter(f=>!allowed(role,f));
 const record={task:id,role,model:`copilot-cli:${model}`,reasoning:'auto',exitCode:result.status,changed,violations,status:result.status===0&&!violations.length?'READY_FOR_DIRECTOR_REVIEW':'REJECTED',workspace:dir};
 write(`experiments/records/${id}.json`,record);audit({action:'agent-return',...record});console.log(JSON.stringify(record,null,2));process.exitCode=record.status==='REJECTED'?1:0;
}