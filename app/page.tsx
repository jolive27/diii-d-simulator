'use client';
import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Slider} from '@/components/ui/slider';
import {Play,RotateCcw,Download,Activity} from 'lucide-react';
import {DEFAULT,LIMITS,basis,geometry,equilibrium,runShot,boundary,validate,type Controls,type Sample,type Shot,type Basis} from '@/physics/engine';
const labels:Record<keyof Controls,[string,string]>={ip:['Plasma current','MA'],bt:['Toroidal field','T'],nbi:['Neutral beam injection','MW'],ech:['Electron cyclotron heating','MW'],gas:['Gas injection','10²¹ D/s'],kappa:['Elongation κ',''],delta:['Triangularity δ','']};
function Chart({samples,fields,unit,time}:{samples:Sample[];fields:[keyof Sample,string,string][];unit:string;time:number}){
 const max=Math.max(0.01,...samples.flatMap(s=>fields.map(([k])=>s[k])))*1.12;
 return <div className="trace"><div className="trace-label"><span>{unit}</span><span>{fields.map(([,name,color])=><i key={name} style={{color}}>{name}</i>)}</span></div><svg viewBox="0 0 600 138" role="img" aria-label={`${fields.map(f=>f[1]).join(' and ')} versus time from 0 to 5 seconds`}>
 {[0,0.5,1].map(y=><g key={y}><line x1="42" x2="590" y1={12+y*99} y2={12+y*99} stroke="#263749"/><text x="1" y={16+y*99} fill="#9bb0c4" fontSize="12">{(max*(1-y)).toFixed(1)}</text></g>)}
 {[0,1,2,3,4,5].map(t=><text key={t} x={42+t*109.6} y="132" textAnchor="middle" fill="#9bb0c4" fontSize="12">{t}s</text>)}
 {fields.map(([k,name,color])=><polyline key={name} points={samples.map(s=>`${42+s.t*109.6},${111-s[k]/max*99}`).join(' ')} fill="none" stroke={color} strokeWidth="2.4"/>)}
 <line x1={42+time*109.6} x2={42+time*109.6} y1="10" y2="114" stroke="#fff" strokeDasharray="3 4"/>
 </svg></div>;
}
function NetEnergy({shot,index}:{shot:Shot;index:number}){
 const initial=shot.samples[0].we+shot.samples[0].wi;
 const values=shot.samples.map(s=>s.we+s.wi-initial),s=shot.samples[index],delta=values[index];
 const low=Math.min(0,...values),high=Math.max(0.01,...values),span=high-low;
 const y=(v:number)=>16+74*(high-v)/span;
 const netPower=0.8*s.nbi+0.9*s.ech+s.pOhm-s.pLoss-s.pRad-0.0136*1.602176634e-16*0.3*shot.controls.gas*1e21/1e6;
 return <figure className="net-energy"><figcaption>Net thermal energy <span>ΔW</span></figcaption><strong className={delta<0?'negative':''}>{delta>=0?'+':''}{delta.toFixed(3)} <small>MJ</small></strong><p>Change from the start of this shot</p>
 <svg viewBox="0 0 240 120" role="img" aria-label={`Change in stored thermal energy over five seconds. At ${s.t.toFixed(2)} seconds: ${delta.toFixed(3)} megajoules.`}>
 <line x1="8" x2="232" y1={y(0)} y2={y(0)} stroke="#92a9b8" strokeDasharray="3 4"/><text x="8" y={Math.max(12,y(0)-5)} fill="#a7b9c7" fontSize="11">0 MJ</text>
 <polyline points={shot.samples.map((s,i)=>`${8+s.t*44.8},${y(values[i])}`).join(' ')} fill="none" stroke="#69dfc7" strokeWidth="2"/>
 <line x1={8+s.t*44.8} x2={8+s.t*44.8} y1="12" y2="95" stroke="#8197a8"/>
 <circle cx={8+s.t*44.8} cy={y(delta)} r="3.5" fill="#f2c57b"/>
 <text x="8" y="114" fill="#9eb1c2" fontSize="12">0 s</text><text x="232" y="114" textAnchor="end" fill="#9eb1c2" fontSize="12">5 s</text></svg>
 <div className="net-power"><span>Net heating power</span><b>{netPower>=0?'+':''}{netPower.toFixed(2)} MW</b></div><p className="fine">At {s.t.toFixed(2)} s · absorbed heating + ohmic heating − thermal losses. This is plasma thermal energy, not net electricity or fusion gain.</p></figure>;
}
function Flux({b,eq,c}:{b:Basis;eq:ReturnType<typeof equilibrium>;c:Controls}){
 const g=b.g,px=(r:number)=>40+(r-0.85)*155,py=(z:number)=>232-z*155;
 // Marching triangles; contours derive from solved flux, not nested boundary sketches.
 const paths=useMemo(()=>{if(!eq.valid)return [];return [0.1,0.25,0.4,0.55,0.7,0.85,0.95].map(level=>{let d='';const val=level*eq.maxPsi;
 for(let j=0;j<g.n-1;j++)for(let i=0;i<g.n-1;i++){const k=j*g.n+i;for(const tri of [[k,k+1,k+g.n],[k+1,k+g.n+1,k+g.n]]){const pts:number[][]=[];for(let e=0;e<3;e++){const a=tri[e],b=tri[(e+1)%3],v1=eq.psi[a],v2=eq.psi[b];if((v1<=val&&v2>val)||(v2<=val&&v1>val)){const f=(val-v1)/(v2-v1);pts.push([g.R[a%g.n]+f*(g.R[b%g.n]-g.R[a%g.n]),g.Z[Math.floor(a/g.n)]+f*(g.Z[Math.floor(b/g.n)]-g.Z[Math.floor(a/g.n)])]);}}if(pts.length===2)d+=`M${px(pts[0][0])},${py(pts[0][1])}L${px(pts[1][0])},${py(pts[1][1])}`;}}
 return d;});},[b,eq]);
 return <svg viewBox="0 0 350 475" className="flux" role="img" aria-label="Computed poloidal flux contours, with R and Z axes in meters">
 {[1,1.5,2,2.5].map(r=><g key={r}><line x1={px(r)} x2={px(r)} y1="15" y2="449" stroke="#1d3042"/><text x={px(r)} y="470" textAnchor="middle" fill="#9bb0c4" fontSize="12">{r}</text></g>)}
 {[-1,0,1].map(z=><g key={z}><line x1="32" x2="310" y1={py(z)} y2={py(z)} stroke="#1d3042"/><text x="2" y={py(z)+4} fill="#9bb0c4" fontSize="12">{z}</text></g>)}
 <text x="6" y="16" fill="#9bb0c4" fontSize="12">Z (m)</text><text x="301" y="470" fill="#9bb0c4" fontSize="12">R (m)</text>
 <polygon points={boundary(c).map(([r,z])=>`${px(r)},${py(z)}`).join(' ')} fill="#112e38" stroke="#92aaa9" strokeWidth="2"/>
 {paths.map((d,i)=><path key={i} d={d} fill="none" stroke={i>4?'#f3cb79':'#61ddcb'} strokeWidth="1.6"/>)}
 {!eq.valid&&<text x="180" y="230" textAnchor="middle" fill="#ffd5a0" fontSize="14">No supported equilibrium</text>}
 </svg>;
}
export default function Home(){
 const [controls,setControls]=useState<Controls>({...DEFAULT});const [result,setResult]=useState<{shot:Shot;b:Basis}|null>(null);const [index,setIndex]=useState(125);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [playing,setPlaying]=useState(false);
 function run(c=controls){setBusy(true);setError('');setPlaying(false);setTimeout(()=>{try{const g=geometry(c),b=basis(g),shot=runShot(c,g);setResult({shot,b});setIndex(Math.floor(shot.samples.length/2));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false)}},20);}
 useEffect(()=>{run(DEFAULT)},[]);
 useEffect(()=>{
  type Tool={name:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>Promise<unknown>};
  const context=(document as Document & {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const properties=Object.fromEntries(Object.entries(LIMITS).map(([k,[minimum,maximum]])=>[k,{type:'number',minimum,maximum}]));
  const tool:Tool={name:'run_virtual_shot',description:'Run a five-second educational DIII-D shot with the supplied controls and display its results. Units: ip MA, bt T, nbi/ech MW, gas 1e21 D atoms/s, kappa/delta dimensionless.',inputSchema:{type:'object',properties,required:Object.keys(LIMITS),additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!(k in LIMITS)))throw new Error('Expected shot controls');
   const c={...input} as Controls;validate(c);const g=geometry(c),b=basis(g),shot=runShot(c,g);
   setControls(c);setResult({shot,b});setIndex(125);setError('');setPlaying(false);
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   return {modelVersion:shot.modelVersion,time:2.5,sample:shot.samples[125],assumptions:shot.assumptions};
  }};
  try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser capability. */}
  return()=>lifecycle.abort();
 },[]);
 useEffect(()=>{if(!playing||!result)return;const id=setInterval(()=>setIndex(i=>{if(i>=result.shot.samples.length-1){setPlaying(false);return i;}return i+1;}),40);return()=>clearInterval(id)},[playing,result]);
 const sample=result?.shot.samples[index];const eq=useMemo(()=>result&&sample?equilibrium(result.b,sample.ip,result.shot.controls.bt,sample.pressure):null,[result,sample]);
 const dirty=result&&JSON.stringify(controls)!==JSON.stringify(result.shot.controls);
 function download(){if(!result)return;const data={...result.shot,equilibriumAtSelection:sample?{time:sample.t,...eq,R:result.b.g.R,Z:result.b.g.Z}:null};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='diii-d-virtual-shot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <main><header><div className="wordmark"><Activity size={25}/><span>DIII-D <b>/ VIRTUAL SHOT</b></span></div><a href="/validation" style={{color:"#8fe5d4",fontSize:13}}>Verification dashboard →</a><span className="tag">EDUCATIONAL MODEL · MILESTONE 01</span></header>
 <section className="intro"><div><p className="eyebrow">PLASMA PHYSICS WORKBENCH</p><h1>Build a shot. Follow the plasma.</h1><p>Explore how current, heating, fueling, and shape affect a five-second virtual discharge.</p></div><Button variant="outline" onClick={download} disabled={!result}><Download/>Export shot</Button></section>
 <div className="workspace"><aside className="panel controls"><div className="panel-title"><h2>Shot program</h2><span>01</span></div><p className="muted">Set the flat-top values, then run.</p>
 {(Object.keys(labels) as (keyof Controls)[]).map(k=><div className="control" key={k}><div><label id={`label-${k}`}>{labels[k][0]}</label><output>{controls[k].toFixed(k==='delta'||k==='kappa'?2:1)} <small>{labels[k][1]}</small></output></div><Slider aria-labelledby={`label-${k}`} min={LIMITS[k][0]} max={LIMITS[k][1]} step={LIMITS[k][2]} value={[controls[k]]} onValueChange={v=>setControls(c=>({...c,[k]:Array.isArray(v)?v[0]:v}))}/></div>)}
 <Button className="run-button" onClick={()=>run()} disabled={busy}><Play/>{busy?'Calculating…':'Run virtual shot'}</Button><Button variant="ghost" onClick={()=>{setControls({...DEFAULT});run(DEFAULT)}} disabled={busy}><RotateCcw/>Reset & run baseline</Button>
 {result&&<NetEnergy shot={result.shot} index={index}/>}
 <p className="fine">Gas is injected deuterium atoms; 30% enters the plasma. Heating operates from 1–4 s. Current ramps from 0.4 MA and returns to 0.4 MA. Shape stays fixed during each shot.</p>
 </aside><section className="results">
 <div role="status" aria-live="polite">{error?<div className="notice">{error} {result?'Previous successful run remains below.':''}</div>:dirty?<div className="notice">Controls changed. Run the shot to update the results.</div>:null}</div>
 {sample&&result&&eq?<><div className="metrics"><div><span>Electron temperature</span><strong>{sample.te.toFixed(2)} <small>keV</small></strong></div><div><span>Ion temperature</span><strong>{sample.ti.toFixed(2)} <small>keV</small></strong></div><div><span>Mean electron density</span><strong>{sample.ne.toFixed(2)} <small>×10¹⁹ m⁻³</small></strong></div><div><span>Thermal energy</span><strong>{(sample.we+sample.wi).toFixed(2)} <small>MJ</small></strong></div></div>
 <div className="diagnostics"><div className="panel equilibrium"><div className="panel-title"><h2>Magnetic equilibrium</h2><span>{sample.t.toFixed(2)} s</span></div><p className="muted">Fixed boundary · computed flux surfaces</p><Flux b={result.b} eq={eq} c={result.shot.controls}/><div className="eq-footer"><span>β thermal <b>{sample.beta.toFixed(2)}%</b></span><span>Volume <b>{result.shot.volume.toFixed(1)} m³</b></span></div>{eq.valid?<p className="fine">Relative GS residual {eq.residual.toExponential(1)} · current error {eq.currentError.toExponential(1)} · pressure error {eq.pressureError.toExponential(1)}</p>:<p className="notice">{eq.reason} Thermal evolution continues as a reduced model only.</p>}</div>
 <div className="panel evolution"><div className="panel-title"><h2>Discharge evolution</h2><span>0–5 s</span></div><Chart samples={result.shot.samples} fields={[["te","Electrons","#62dfca"],["ti","Ions","#f2c57b"]]} unit="Temperature · keV" time={sample.t}/><Chart samples={result.shot.samples} fields={[["ne","Density","#9dabff"]]} unit="Mean density · 10¹⁹ m⁻³" time={sample.t}/><Chart samples={result.shot.samples} fields={[["nbi","NBI","#62dfca"],["ech","ECH","#9dabff"],["pOhm","Ohmic","#f2c57b"]]} unit="Applied power · MW" time={sample.t}/><Chart samples={result.shot.samples} fields={[["ip","Current","#7bd2ff"]]} unit="Plasma current · MA" time={sample.t}/></div></div>
 <div className="panel playback"><Button variant="outline" onClick={()=>{if(index>=result.shot.samples.length-1)setIndex(0);setPlaying(!playing)}}>{playing?'Pause':'Play shot'}</Button><Slider aria-label="Shot time" min={0} max={result.shot.samples.length-1} step={1} value={[index]} onValueChange={v=>{setPlaying(false);setIndex(Array.isArray(v)?v[0]:v)}}/><output>{sample.t.toFixed(2)} s</output></div>
 <div className="audit"><span>Energy balance error <b>{Math.max(...result.shot.samples.map(s=>Math.abs(s.energyError))).toExponential(1)}</b></span><span>Particle balance error <b>{Math.max(...result.shot.samples.map(s=>Math.abs(s.particleError))).toExponential(1)}</b></span></div></>:<div className="panel loading">{busy?'Solving the baseline shot…':'Run a shot to begin.'}</div>}
 </section></div>
 <section className="model-notes"><div><p className="eyebrow">KNOW WHAT YOU’RE LOOKING AT</p><h2>A physics foundation, ready to grow.</h2><p>This is a reduced educational model inspired by DIII-D. It is not calibrated to experimental shots and does not predict facility operation, stability, disruptions, or fusion yield.</p></div><div><h3>What is solved</h3><p>Conservative particle and electron/ion energy balances, coupled to a finite-difference Grad–Shafranov equilibrium with linear pressure and F² profiles. Density is volume averaged; temperature is particle averaged.</p><h3>What is assumed</h3><p>Already formed deuterium plasma, ideal programmed current, fixed shape per shot, heuristic transport, fixed heating absorption, bremsstrahlung, and simplified electron–ion exchange. A sharp grid boundary limits geometric accuracy.</p></div><div><h3>Next physics milestones</h3><p>Grid and analytic benchmarks → experimental equilibrium comparison → radial transport → free-boundary coils and current diffusion → shot validation.</p><p className="sources">Sources: <a href="https://fusion.gat.com/pubs-ext/SOFT02/A24059.pdf" target="_blank" rel="noreferrer">DIII-D geometry, GA</a> · <a href="https://w3.pppl.gov/~dboyle/PlasmaWiki/qed.princeton.edu/main/PlasmaWiki/Solov%27ev%27s_Solution.html" target="_blank" rel="noreferrer">Solov’ev equilibrium, PPPL</a></p></div></section><footer>DIII-D Virtual Shot · Independent educational project · All calculations run in your browser</footer>
 </main>;
}
