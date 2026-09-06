/** SI internally. Zero-D thermal deuterium + fixed-boundary Solovev family. */
export const MU0=4*Math.PI*1e-7, KEV=1.602176634e-16;
export const MACHINE={R:1.66,a:0.66,name:'DIII-D educational geometry'};
export type Controls={ip:number;bt:number;nbi:number;ech:number;gas:number;kappa:number;delta:number};
export const DEFAULT:Controls={ip:1.2,bt:2.0,nbi:4,ech:1,gas:2.5,kappa:1.7,delta:0.35};
export const LIMITS:Record<keyof Controls,[number,number,number]>={ip:[0.6,2,0.05],bt:[1,2.1,0.05],nbi:[0,12,0.25],ech:[0,3,0.1],gas:[0,8,0.1],kappa:[1,1.95,0.05],delta:[-0.3,0.6,0.05]};
export function validate(c:Controls){for(const k of Object.keys(LIMITS) as (keyof Controls)[]){if(!Number.isFinite(c[k])||c[k]<LIMITS[k][0]||c[k]>LIMITS[k][1])throw new Error(`Invalid ${k}`);}}
export function boundary(c:Controls,n=160){return Array.from({length:n+1},(_,i)=>{const t=2*Math.PI*i/n;return [MACHINE.R+MACHINE.a*Math.cos(t+Math.asin(c.delta)*Math.sin(t)),c.kappa*MACHINE.a*Math.sin(t)];});}
export type Geometry=ReturnType<typeof geometry>;
export function geometry(c:Controls,n=49){
 validate(c); if(n<17||n>129||n%2!==1)throw new Error('Grid must be odd, 17–129');
 const R=Array.from({length:n},(_,i)=>MACHINE.R-MACHINE.a*1.04+i*2.08*MACHINE.a/(n-1));
 const Z=Array.from({length:n},(_,j)=>-c.kappa*MACHINE.a*1.04+j*2.08*c.kappa*MACHINE.a/(n-1));
 const dr=R[1]-R[0],dz=Z[1]-Z[0],mask=new Uint8Array(n*n);let volume=0,C=0,D=0;
 for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){
  const z=Z[j]/(c.kappa*MACHINE.a);if(Math.abs(z)>=1)continue;
  const t=Math.asin(z),shift=Math.asin(c.delta)*z;
  const right=MACHINE.R+MACHINE.a*Math.cos(t+shift),left=MACHINE.R+MACHINE.a*Math.cos(Math.PI-t+shift);
  if(R[i]>left&&R[i]<right){mask[j*n+i]=1;volume+=2*Math.PI*R[i]*dr*dz;C+=R[i]*dr*dz;D+=dr*dz/(MU0*R[i]);}
 }
 return {n,R,Z,dr,dz,mask,volume,C,D};
}
/** Independent basis solves: Delta* u=-mu0 R²; Delta* v=-1. */
export function basis(g:Geometry){
 const {n,R,dr,dz,mask}=g; const u=new Float64Array(n*n),v=new Float64Array(n*n);
 const ar=1/dr**2,az=1/dz**2,den=2*(ar+az);let iterations=0,residual=Infinity;
 for(;iterations<12000;iterations++){
  for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){const k=j*n+i;if(!mask[k])continue;
   const l=ar+1/(2*R[i]*dr),r=ar-1/(2*R[i]*dr);
   u[k]+=1.7*((l*u[k-1]+r*u[k+1]+az*(u[k-n]+u[k+n])+MU0*R[i]**2)/den-u[k]);
   v[k]+=1.7*((l*v[k-1]+r*v[k+1]+az*(v[k-n]+v[k+n])+1)/den-v[k]);
  }
  if(iterations%20===0){let a=0,b=0;for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){const k=j*n+i;if(!mask[k])continue;const l=ar+1/(2*R[i]*dr),r=ar-1/(2*R[i]*dr);a=Math.max(a,Math.abs(l*u[k-1]+r*u[k+1]+az*(u[k-n]+u[k+n])-den*u[k]+MU0*R[i]**2)/(MU0*R[i]**2));b=Math.max(b,Math.abs(l*v[k-1]+r*v[k+1]+az*(v[k-n]+v[k+n])-den*v[k]+1));}residual=Math.max(a,b);if(residual<1e-8)break;}
 }
 if(residual>=1e-8)throw new Error('Equilibrium basis did not converge');
 let ubar=0,vbar=0;for(let k=0;k<n*n;k++){const w=2*Math.PI*R[k%n]*dr*dz/g.volume;ubar+=u[k]*w;vbar+=v[k]*w;}
 return {g,u,v,ubar,vbar,iterations,residual};
}
export type Basis=ReturnType<typeof basis>;
export function equilibrium(b:Basis,ipMA:number,bt:number,pbar:number){
 const {g,u,v,ubar,vbar}=b,I=ipMA*1e6;
 // p=A psi, FF'=B. Current and volume-average pressure constrain A,B.
 const h=ubar-g.C*vbar/g.D,q=I*vbar/g.D,disc=q*q+4*h*pbar;
 if(disc<0)return {valid:false,reason:'Pressure exceeds this equilibrium family’s solvable range.'} as const;
 const A=pbar===0?0:2*pbar/(q+Math.sqrt(disc)),B=(I-A*g.C)/g.D;
 const psi=Array.from(u,(x,k)=>A*x+B*v[k]);let meanPressure=0,current=0,minF2=Infinity,maxPsi=0,residual=0,sourceMax=0;
 for(let k=0;k<psi.length;k++)if(g.mask[k]){
  const R=g.R[k%g.n],F2=(MACHINE.R*bt)**2+2*B*psi[k];minF2=Math.min(minF2,F2);maxPsi=Math.max(maxPsi,psi[k]);
  if(psi[k]<-1e-10)return {valid:false,reason:'Flux reversal is outside the supported equilibrium family.'} as const;
  meanPressure+=A*psi[k]*2*Math.PI*R*g.dr*g.dz/g.volume;current+=(A*R+B/(MU0*R))*g.dr*g.dz;
  const ar=1/g.dr**2,az=1/g.dz**2,source=MU0*R**2*A+B;
  const L=(ar+1/(2*R*g.dr))*psi[k-1]+(ar-1/(2*R*g.dr))*psi[k+1]+az*(psi[k-g.n]+psi[k+g.n])-2*(ar+az)*psi[k];
  residual=Math.max(residual,Math.abs(L+source));sourceMax=Math.max(sourceMax,Math.abs(source));
 }
 if(minF2<=0)return {valid:false,reason:'The requested pressure requires nonphysical toroidal field in this equilibrium family.'} as const;
 return {valid:true,psi,A,B,meanPressure,current,maxPsi,minF2,residual:residual/sourceMax,pressureError:Math.abs(meanPressure-pbar)/Math.max(1,pbar),currentError:Math.abs(current-I)/I} as const;
}
export type Sample={t:number;ip:number;ne:number;te:number;ti:number;we:number;wi:number;nbi:number;ech:number;pOhm:number;pLoss:number;pRad:number;tauE:number;pressure:number;beta:number;energyError:number;particleError:number};
export type Shot={schemaVersion:1;modelVersion:string;controls:Controls;volume:number;dt:number;samples:Sample[];assumptions:string[]};
export interface TransportClosure { evaluate(c:Controls,ne:number,te:number,ip:number,pAux:number):{tauE:number;tauP:number;resistivity:number} }
export const educationalTransport:TransportClosure={evaluate(c,ne,te,ip,pAux){return {tauE:0.12*(ip/1.2)**0.7*(c.bt/2)**0.2*(Math.max(ne,1e18)/4e19)**0.2*(Math.max(pAux,0.5)/5)**-0.35,tauP:1.6,resistivity:2.8e-8*(Math.max(te,0.02))**-1.5};}};
export function waveform(c:Controls,t:number){const ramp=t<1?0.4+(c.ip-0.4)*t:t>4?c.ip+(0.4-c.ip)*(t-4):c.ip;const heat=t>=1&&t<4?1:0;return {ip:ramp,nbi:c.nbi*heat,ech:c.ech*heat};}
export function runShot(c:Controls,g:Geometry,dt=0.002,closure:TransportClosure=educationalTransport):Shot{
 validate(c);if(!(dt>0&&dt<=0.01))throw new Error('Time step must be >0 and <=0.01 s');
 const V=g.volume,N0=3e19*V,W0=1.5*N0*KEV*0.5;let N=N0,We=W0,Wi=W0,Ein=0,Eout=0,Nin=0,Nout=0;
 const samples:Sample[]=[];const steps=Math.round(5/dt);dt=5/steps;
 function rates(t:number){const w=waveform(c,t),ne=N/V,te=We/(1.5*N*KEV),ti=Wi/(1.5*N*KEV),tr=closure.evaluate(c,ne,te,w.ip,w.nbi+w.ech);
 const pOhm=tr.resistivity*(2*Math.PI*MACHINE.R)**2/V*(w.ip*1e6)**2;
 const pRad=1.69e-38*ne*ne*Math.sqrt(te*1000)*V;
 const gas=0.3*c.gas*1e21,beam=0.8*w.nbi*1e6/(80*KEV),source=gas+beam;
 return {...w,ne,te,ti,...tr,pOhm,pRad,source};}
 for(let s=0;s<=steps;s++){
  const t=s*dt,r=rates(t);
  if(s%Math.max(1,Math.round(0.02/dt))===0||s===steps){const pressure=2*(We+Wi)/(3*V);samples.push({t,ip:r.ip,ne:r.ne/1e19,te:r.te,ti:r.ti,we:We/1e6,wi:Wi/1e6,nbi:r.nbi,ech:r.ech,pOhm:r.pOhm/1e6,pLoss:(We+Wi)/r.tauE/1e6,pRad:r.pRad/1e6,tauE:r.tauE,pressure,beta:100*2*MU0*pressure/c.bt**2,energyError:(We+Wi-2*W0-Ein+Eout)/Math.max(2*W0,Ein),particleError:(N-N0-Nin+Nout)/Math.max(N0,Nin)});}
  if(s===steps)break;
  // Explicit conservative finite-volume update. Guard against invalid state, never clip.
  const exchange=(We-Wi)/0.25,ionization=0.0136*KEV*0.3*c.gas*1e21;
  const pe=(0.8*0.35*r.nbi+0.9*r.ech)*1e6+r.pOhm,pi=0.8*0.65*r.nbi*1e6;
  const le=We/r.tauE+r.pRad+ionization,li=Wi/r.tauE;
  We+=dt*(pe-le-exchange);Wi+=dt*(pi-li+exchange);
  const sink=N/r.tauP;N+=dt*(r.source-sink);Ein+=dt*(pe+pi);Eout+=dt*(le+li);Nin+=dt*r.source;Nout+=dt*sink;
  if(!Number.isFinite(We+Wi+N)||We<=0||Wi<=0||N<=0)throw new Error(`Reduced model left its valid thermal-plasma regime at ${t.toFixed(3)} s. Reduce fueling or increase heating.`);
 }
 return {schemaVersion:1,modelVersion:'0.1.0',controls:{...c},volume:V,dt,samples,assumptions:['Formed deuterium plasma; no breakdown or extinction','Constant boundary per shot; programmed current with ideal external drive','Heuristic confinement, resistivity and electron-ion exchange; no calibration','Fixed absorbed heating fractions and 80 keV beam particle source','Solovev fixed-boundary equilibrium; no coils, X-point, stability or disruptions']};
}
