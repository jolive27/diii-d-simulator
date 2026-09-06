/** Director-operated isolated-workspace dispatcher. Outputs are never automatically merged. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {root,read,hash,write,audit} from './workflow.mjs';
export function allowed(role,file){return (read('agents/permissions.json')[role]||[]).some(p=>p.endsWith('/')?file.startsWith(p):file===p)&&!file.split('/').includes('..');}
if(process.argv[1]===import.meta.filename){
 const [role,id,...words]=process.argv.slice(2);if(!['physics','software','validation'].includes(role)||!/^[-a-z0-9]+$/.test(id||''))throw Error('Usage: dispatch-agent.mjs physics|software|validation TASK-ID TASK');
 const dir=path.join(root,'work/agents',id);if(fs.existsSync(dir))throw Error('Task ID already exists; inspect existing record');fs.mkdirSync(dir,{recursive:true});
 const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 const before={};for(const f of names){const s=path.join(root,f);if(!fs.statSync(s).isFile())continue;before[f]=hash(fs.readFileSync(s));fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.copyFileSync(s,path.join(dir,f));}
 execFileSync('git',['init','-q'],{cwd:dir});
 const prompt=`You are the ${role} development agent. Read agents/${role}.md and AGENTS.md. Work only in this isolated checkout. Allowed output paths: ${JSON.stringify(read('agents/permissions.json')[role])}. Never accept milestones or alter permissions. Task: ${words.join(' ')}`;
 audit({role:'director',action:'dispatch',task:id,agentRole:role,model:'gpt-6-astra',reasoning:'medium'});
 const log=fs.openSync(path.join(root,`work/agents/${id}.jsonl`),'w');
 const result=spawnSync(process.env.CODEX_BIN||'codex',['exec','--ignore-user-config','-m','gpt-6-astra','-c','model_reasoning_effort="medium"','-s','workspace-write','-C',dir,'--json',prompt],{stdio:['ignore',log,log]});fs.closeSync(log);
 const afterFiles=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{cwd:dir,encoding:'utf8'}).split('\0').filter(Boolean);const changed=[...new Set([...names,...afterFiles])].filter(f=>{try{return hash(fs.readFileSync(path.join(dir,f)))!==before[f]}catch{return true}});const violations=changed.filter(f=>!allowed(role,f));
 const record={task:id,role,model:'gpt-6-astra',reasoning:'medium',exitCode:result.status,changed,violations,status:result.status===0&&!violations.length?'READY_FOR_DIRECTOR_REVIEW':'REJECTED',workspace:dir};write(`experiments/records/${id}.json`,record);audit({action:'agent-return',...record});console.log(JSON.stringify(record,null,2));process.exitCode=record.status==='REJECTED'?1:0;
}
