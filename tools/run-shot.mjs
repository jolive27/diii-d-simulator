/** Persist an experiment without a browser; usage: node --experimental-strip-types tools/run-shot.mjs CONFIG.json [LABEL]. */
import fs from 'node:fs';
import {run_shot,get_metrics,export_results} from '../physics/api.ts';
import {write,audit,fingerprint,root} from './workflow.mjs';
const [configPath,label='shot']=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(label))throw Error('Label must contain lowercase letters, numbers and hyphens');
const config=configPath?JSON.parse(fs.readFileSync(configPath,'utf8')):{};
const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+label;
const shot=run_shot(config);
const record={id,createdAt:new Date().toISOString(),config,modelVersion:shot.modelVersion,sourceFingerprint:fingerprint(),metrics:get_metrics(shot),resultPath:`experiments/runs/${id}.json`};
write(record.resultPath,shot);write(`experiments/runs/${id}-record.json`,record);
fs.writeFileSync(`${root}/experiments/runs/${id}.csv`,export_results(shot,'csv'));
audit({role:'director',action:'run-shot',...record});console.log(JSON.stringify(record,null,2));
