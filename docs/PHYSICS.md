# Physics specification — version 0.1.0

## Status and provenance

Educational, uncalibrated, axisymmetric formed-deuterium-plasma model. Conservation statements refer to the tracked particle and thermal-energy system with declared sources/sinks, not the entire machine.

DIII-D dimensions R0=1.66 m and a=0.66 m follow General Atomics report GA-A24059, section 2: https://fusion.gat.com/pubs-ext/SOFT02/A24059.pdf . This source also describes elongation near 2 and a 2.1 T field. Sliders use an educational domain, not a certified operating envelope. Broader facility capabilities: https://fusion.gat.com/global/_media/diii-d/frontier/diii-d_capabilities_document_v5.pdf .

Solov’ev-family context: https://w3.pppl.gov/~dboyle/PlasmaWiki/qed.princeton.edu/main/PlasmaWiki/Solov%27ev%27s_Solution.html . Our solver uses a numerical shaped boundary and the SI Grad–Shafranov equation; it does not reproduce that page's particular analytic geometry. All transport constants below are illustrative author-selected closures, not fits to DIII-D data.

## Geometry and equilibrium

R(theta)=R0+a cos(theta+asin(delta) sin(theta)); Z(theta)=kappa a sin(theta). This is an up/down symmetric prescribed shape without an X-point. The 49×49 rectangular mesh has a staircase mask. Psi is zero outside the mask. Cell volume is 2pi R dR dZ, and the same sum defines the thermal-model volume.

Use psi as poloidal flux per radian with a positive interior; the toroidal-current magnitude is positive in this convention:

Delta* psi = -mu0 R² p'(psi) - F F'(psi), F=R Bphi.

p=A psi, F²=Fedge²+2B psi, Fedge=R0 Bt, hence jphi=A R+B/(mu0 R).

Solve Delta* u=-mu0 R² and Delta* v=-1 with zero Dirichlet mask boundary, then psi=A u+B v. Second-order interior differences and SOR (omega=1.7) solve the basis to relative max residual below 1e-8. Staircase-boundary accuracy is lower than the interior stencil and must not be advertised as globally second order.

Define C=sum(R dA), D=sum(dA/(mu0 R)), ubar=<u>V, vbar=<v>V. Enforce Ip=A C+B D and pbar=A <psi>V. With h=ubar-C vbar/D and q=Ip vbar/D, solve h A²+q A-pbar=0 using A=2pbar/(q+sqrt(q²+4h pbar)); B=(Ip-A C)/D. This selects the branch continuous from zero pressure. Negative discriminant, reversed interior psi, or nonpositive F² produce an unsupported-equilibrium status.

The local pressure is reconstructed from the thermal-model mean pressure pbar=2(We+Wi)/(3V). A possible compatible profile realization is uniform n and Te,Ti proportional to psi/<psi>V, preserving the respective particle-averaged temperatures and energies. No radial transport calculation is claimed. A flux/pressure solution does not establish MHD stability or facility accessibility. No q95 approximation is presented as a solved diagnostic.

## Thermal and particle equations

SI internally; user plots show keV, MA, MW, MJ, and density in 1e19 m^-3. KEV=1.602176634e-16 J. N counts electrons and deuterium ions separately with equal number N; N is not their combined count. We=(3/2) N KEV Te; Wi=(3/2) N KEV Ti.

- dN/dt = Sgas + Sbeam - N/tauP.
- dWe/dt = Pe + Pohm - We/tauE - Pbr - Pion - Qei.
- dWi/dt = Pi - Wi/tauE + Qei.
- Sgas=0.30 × gas × 1e21 atoms/s, assumed promptly ionized.
- Sbeam=0.80 × Pnbi/(80 keV), with Pnbi in watts.
- Pe=0.80×0.35×Pnbi + 0.90×Pech; Pi=0.80×0.65×Pnbi.
- Qei=(We-Wi)/0.25 s, equal and opposite in the two energy equations. This is a fixed relaxation approximation, not a collision-frequency calculation.
- Pbr=1.69e-38 ne² sqrt(Te[eV]) V W, Z_eff=1, hydrogenic bremsstrahlung only.
- Pion=13.6 eV × Sgas. Recombination, impurity/line radiation, neutral transport and molecular dissociation are omitted.
- Pohm=eta (2pi R0)² Ip²/V. Uniform effective resistivity eta=2.8e-8 [max(Te[keV],0.02)]^-1.5 ohm m. The temperature floor regularizes the closure, not the state.
- tauP=1.6 s.
- tauE=0.12 s × (Ip/1.2 MA)^0.7 × (Bt/2 T)^0.2 × [max(ne,1e18)/4e19]^0.2 × [max(Pnbi+Pech,0.5 MW)/5 MW]^-0.35.

These are heuristic effective closures. Thermal loss W/tauE includes effective transport/particle-associated energy loss; a separate advective energy loss is not added. Incoming gas is cold. NBI particle source and absorbed NBI energy are tracked together. ECH and NBI efficiencies are fixed, with no resonance, deposition, orbit losses, or fast-ion energy inventory.

Initial ne=3e19 m^-3 and Te=Ti=0.5 keV. The simulation begins after breakdown. Current ramps linearly from 0.4 MA to its target over 0–1 s, holds to 4 s, then falls to 0.4 MA at 5 s. NBI and ECH are on over [1,4) s. Gas and shape are constant. Plasma current is imposed by ideal external drive; current diffusion, inductive energy and actuator/circuit power are absent. Fixed volume avoids an unaccounted p dV term.

Explicit Euler uses 0.002 s, with sampled output every 0.02 s. Separate ledgers accumulate thermal input/loss and particle sources/sinks using the same steps. Nonpositive or nonfinite states stop the run; no hidden clipping. Near-roundoff balance closure is bookkeeping consistency, not proof of physical accuracy. Time-step and mesh refinement tests provide additional limited numerical evidence.

## Boundaries of validity

No breakdown/extinction, divertor/X-point, free boundary, vessel or PF coils, current-profile evolution, H-mode transitions, turbulence, MHD, disruptions, rotation, impurity transport, alpha heating, fusion yield, or experimental calibration. Arbitrary control combinations can leave the thermal or equilibrium model's valid regime. The GUI reports this without substituting fabricated surfaces. Equilibrium is quasistatic and one-way coupled from thermal pressure; there is no equilibrium-driven transport feedback in v0.1.
