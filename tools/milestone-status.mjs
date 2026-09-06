import {read,gate} from './workflow.mjs';
for(const name of ['infrastructure','m02']){
 let decision;try{decision=read(`validation/${name}-decision.json`)}catch{decision={status:'NOT_ACCEPTED'}}
 let report;try{report=read(`validation/${name}-report.json`)}catch{report={status:'NOT_RUN'}}
 const checked=gate(name);
 console.log(JSON.stringify({milestone:name,recordedDecision:decision.status,independentValidation:report.status,currentGate:checked.status,reasons:checked.errors,note:name==='infrastructure'&&decision.status==='ACCEPTED'?'Infrastructure acceptance is a historical prerequisite. Later M02 source changes naturally require a new milestone report.':undefined},null,2));
}
