import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,MU0,MACHINE,geometry,basis,runShot,equilibrium,validate} from '../physics/engine.ts';
const g=geometry(DEFAULT),b=basis(g),shot=runShot(DEFAULT,g);
test('five-second shot conserves tracked particles and thermal energy',()=>{
 assert.equal(shot.samples[0].t,0);assert.equal(shot.samples.at(-1).t,5);
 for(const s of shot.samples){assert.ok(s.te>0&&s.ti>0&&s.ne>0);assert.ok(Math.abs(s.energyError)<1e-12);assert.ok(Math.abs(s.particleError)<1e-12);}
});
test('baseline equilibrium meets current, pressure, and GS equation independently',()=>{
 for(const s of shot.samples){const eq=equilibrium(b,s.ip,DEFAULT.bt,s.pressure);assert.ok(eq.valid,eq.reason);assert.ok(eq.currentError<1e-12);assert.ok(eq.pressureError<1e-12);assert.ok(eq.residual<1e-7);}
 const s=shot.samples[125],e=equilibrium(b,s.ip,DEFAULT.bt,s.pressure);let integral=0;
 for(let j=1;j<g.n-1;j++)for(let i=1;i<g.n-1;i++){const k=j*g.n+i;if(!g.mask[k])continue;const p=e.psi,R=g.R[i];const lap=(p[k+1]-2*p[k]+p[k-1])/g.dr**2-(p[k+1]-p[k-1])/(2*R*g.dr)+(p[k+g.n]-2*p[k]+p[k-g.n])/g.dz**2;integral+=-lap/(MU0*R)*g.dr*g.dz;}
 assert.ok(Math.abs(integral/s.ip/1e6-1)<1e-7);
});
test('time-step refinement changes flat-top temperatures by less than 1%',()=>{
 const finer=runShot(DEFAULT,g,0.001);for(const k of ['te','ti','ne'])assert.ok(Math.abs(shot.samples[125][k]/finer.samples[125][k]-1)<0.01);
});
test('particle inventory agrees with analytic constant-source solution without NBI',()=>{
 const c={...DEFAULT,nbi:0},s=runShot(c,g,0.001).samples.at(-1);
 const nExpected=3e19*Math.exp(-5/1.6)+(0.3*c.gas*1e21/g.volume)*1.6*(1-Math.exp(-5/1.6));
 assert.ok(Math.abs(s.ne*1e19/nExpected-1)<0.001);
});
test('doubling heating raises thermal energy; gas raises density',()=>{
 const hot=runShot({...DEFAULT,nbi:8},g),fuel=runShot({...DEFAULT,gas:5},g);
 assert.ok(hot.samples[125].we+hot.samples[125].wi>shot.samples[125].we+shot.samples[125].wi);assert.ok(fuel.samples[125].ne>shot.samples[125].ne);
});
test('zero heating and zero fueling are supported for formed plasma',()=>{const s=runShot({...DEFAULT,nbi:0,ech:0,gas:0},g);assert.ok(s.samples.at(-1).te>0)});
test('unphysical controls and unsolvable equilibrium fail explicitly',()=>{
 assert.throws(()=>validate({...DEFAULT,bt:NaN}));assert.throws(()=>geometry({...DEFAULT,kappa:3}));assert.throws(()=>runShot(DEFAULT,g,0));assert.equal(equilibrium(b,0.01,0.01,1e8).valid,false);
});
test('elliptical geometry volume approaches analytic torus volume',()=>{
 const c={...DEFAULT,delta:0},fine=geometry(c,129),v=2*Math.PI**2*MACHINE.R*MACHINE.a**2*c.kappa;assert.ok(Math.abs(fine.volume/v-1)<0.005);
});
test('grid refinement keeps volume and peak flux within 5%',()=>{
 const fine=geometry(DEFAULT,97),bf=basis(fine),p=shot.samples[125].pressure;
 const coarse=equilibrium(b,1.2,2,p),refined=equilibrium(bf,1.2,2,p);assert.ok(coarse.valid&&refined.valid);assert.ok(Math.abs(coarse.maxPsi/refined.maxPsi-1)<0.05);assert.ok(Math.abs(g.volume/fine.volume-1)<0.02);
});
