# Current M01 equations — physics model 0.1.0

This is a transcription of `physics/engine.ts`, inspected on 2026-09-06, with interpretation from `docs/PHYSICS.md`. It is not a new model, calibration, test run or milestone approval. `constants.json` records values and the inspected engine hash; `assumptions.yaml` contains durable assumption IDs. External provenance links inherited from the physics document were not independently checked in this pass. Any proposed change requires an explicit change request to the Director identifying affected assumptions, constants, equations, evidence, validation and version impact before implementation.

## Units and state

Internal thermal state is `N` (number of electrons, also separately the equal number of deuterium ions), `We, Wi` (J), and fixed `V` (m³). Thus `ne=N/V`, `Te=We/(1.5 N KEV)` and `Ti=Wi/(1.5 N KEV)` in keV. N does not count electrons and ions combined. `pbar=2(We+Wi)/(3V)` in Pa. Display/export converts current to MA, power to MW, energy to MJ and density to units of 10¹⁹ m⁻³. `beta=100 × 2 mu0 pbar/Bt²` is a thermal mean-pressure diagnostic in percent, not a stability limit. See A-M01-001, 004, 016.

## Geometry and basis

For angle theta, `R=R0+a cos(theta+asin(delta) sin(theta))`, `Z=kappa a sin(theta)` (A-M01-002). The default boundary polyline has 160 intervals and repeats its endpoint. Geometry uses an odd rectangular mesh, default 49 and allowed 17–129, extending to `R0 ± 1.04 a` and `Z=±1.04 kappa a`. Only strictly interior cells are masked in; the outermost grid rows/columns are excluded. With `z=Z/(kappa a)`, `t=asin(z)`, and `shift=asin(delta) z`, membership requires `|z|<1` and `R0+a cos(pi-t+shift)<R<R0+a cos(t+shift)`.

Cell area is `dA=dR dZ`; cell volume is `2 pi R dA`. On masked cells, `V=sum(2 pi R dA)`, `C=sum(R dA)`, `D=sum(dA/(mu0 R))`. Outside-mask unknowns remain zero; no boundary-fitted interpolation is used (A-M01-012).

With poloidal flux per radian psi and positive interior convention, `Delta* psi = psi_RR - psi_R/R + psi_ZZ = -mu0 R² A-B`. Solve two bases `Delta* u=-mu0 R²` and `Delta* v=-1`. At cell i,j, the stencil is

`L f=(1/dR²+1/(2R dR)) f_left +(1/dR²-1/(2R dR)) f_right +(f_down+f_up)/dZ² -2(1/dR²+1/dZ²) f_center`.

In-place successive over-relaxation uses omega 1.7, at most 12000 sweeps. Every 20 indexed sweeps (including index zero after its update), it checks the maximum of `|L u+mu0 R²|/(mu0 R²)` and `|L v+1|` over masked cells. Both must fall below 1e-8, otherwise the solver throws. The returned iteration index is zero-based. Interior stencil order does not establish global order for the staircase boundary.

## Equilibrium closure

Define `ubar=<u>V`, `vbar=<v>V`. `p=A psi`, `F=R Bphi`, `F²=(R0 Bt)²+2B psi`, `jphi=A R+B/(mu0 R)` and `psi=A u+B v`. Integrated current is in amperes: `I=Ip[MA] × 1e6=A C+B D`. The pressure constraint is `pbar=A(A ubar+B vbar)`.

Set `h=ubar-C vbar/D`, `q=I vbar/D`, `disc=q²+4h pbar`. For zero mean pressure set `A=0`; otherwise use `A=2pbar/(q+sqrt(disc))`, then `B=(I-A C)/D`. This selects the branch continuous from zero pressure in the supported regime. Here `B` is the constant `F F'`, distinct from magnetic field Bt; q here is an algebraic intermediate, not a safety factor.

Unsupported status is returned for negative discriminant, any masked `psi<-1e-10`, or minimum masked `F²<=0`. The code does not independently validate all arguments to `equilibrium`; its intended inputs come from the valid shot/basis workflow. The flux tolerance is numerical, not a physical reversal threshold. Diagnostics are `max|L psi+mu0 R² A+B|/max|mu0 R² A+B|`, `|<p>V-pbar|/max(1,pbar)`, and `|integral(jphi)dA-I|/I`. No q, stability, accessibility, coil or free-boundary calculation follows from these checks (A-M01-010, 014).

Thermal pressure feeds this selected-time solve only. Geometry is fixed before thermal integration; equilibrium does not change transport (A-M01-011). A compatible pressure-profile interpretation can be constructed as described in `docs/PHYSICS.md`; it is not a solved radial temperature or density evolution.

## Waveform and closures

For a five-second shot, `Ip(t)=0.4+(Ip_target-0.4)t` on 0–1 s, equals target on 1–4 s, and `Ip_target+(0.4-Ip_target)(t-4)` on 4–5 s. NBI and ECH have their control powers on `[1,4)` s and zero otherwise. Gas and shape are constant (A-M01-003).

`tauE=0.12 (Ip/1.2)^0.7 (Bt/2)^0.2 [max(ne,1e18)/4e19]^0.2 [max(Pnbi+Pech,0.5)/5]^-0.35` seconds, with Ip in MA, Bt in T, ne in m⁻³ and auxiliary power in MW. `tauP=1.6 s`. `eta=2.8e-8 max(Te[keV],0.02)^-1.5` ohm m. Closure floors affect function arguments, not state. These are illustrative effective closures without experimental calibration (A-M01-005).

## Sources and thermal/particle evolution

In the following equations powers are watts, current amperes, temperatures explicitly converted as indicated:

- `Sgas=0.3 gas × 1e21 s^-1` and `Sbeam=0.8 Pnbi/(80 KEV)`.
- `Pe=0.8 × 0.35 Pnbi+0.9 Pech`, `Pi=0.8 × 0.65 Pnbi`.
- `Pohm=eta (2 pi R0)² I²/V`.
- `Pbr=1.69e-38 ne² sqrt(1000 Te[keV]) V`.
- `Pion=0.0136 KEV Sgas`.
- `Qei=(We-Wi)/0.25 s`.
- `dN/dt=Sgas+Sbeam-N/tauP`.
- `dWe/dt=Pe+Pohm-We/tauE-Pbr-Pion-Qei`.
- `dWi/dt=Pi-Wi/tauE+Qei`.

Exchange cancels from total thermal energy. In isolation, the difference We−Wi decays with time constant 0.125 s, although the exchange denominator is 0.25 s. Fixed absorption, cold gas, prompt ionization and restricted radiation are A-M01-006 through 009. No fusion output or electrical-machine power is calculated.

Initial `N0=3e19 V` and `We0=Wi0=1.5 N0 KEV × 0.5`. Explicit Euler evaluates all rates from the pre-update state. Requested step must satisfy `0<dt<=0.01`; `steps=round(5/dt)` and actual `dt=5/steps`. The default is 0.002 s. Sampling occurs every `max(1,round(0.02/dt))` steps and always at the final step, so nondefault spacing is approximately 0.02 s. Samples record the state and instantaneous rates before any update at that time. Heating discontinuities are handled by this left-endpoint schedule, not substep event splitting.

Input/output ledgers use exactly the same steps: `Ein+=dt(Pe+Pohm+Pi)`, `Eout+=dt(We/tauE+Pbr+Pion+Wi/tauE)`, `Nin+=dt(Sgas+Sbeam)`, `Nout+=dt N/tauP`, all using pre-update quantities. Reported errors are `(We+Wi-2W0-Ein+Eout)/max(2W0,Ein)` and `(N-N0-Nin+Nout)/max(N0,Nin)`. `pLoss` reports only `(We+Wi)/tauE`, separately from radiation; ionization is not a standalone sample field.

Any nonfinite sum of We+Wi+N or nonpositive individual state throws, with no state clipping. Bookkeeping residuals are not physical validation (A-M01-013, 014). Existing test claims and limitations are recorded in `docs/VERIFICATION.md`; this infrastructure pass does not rerun or expand them.
