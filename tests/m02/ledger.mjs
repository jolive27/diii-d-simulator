// Test-only oracle: independently stated literal conversions and physical source formulas.
export function ledger(controls, trace, constantClosure) {
  if (!trace.length) throw new Error('Missing trace');
  const first = trace[0], totals = { N: 0, We: 0, Wi: 0, W: 0 }, absolute = { N: 0, We: 0, Wi: 0, W: 0 };
  const worst = { N: 0, We: 0, Wi: 0, W: 0 }, worstTime = { N: 0, We: 0, Wi: 0, W: 0 };
  const components = {};
  let prior;
  if (first.preN !== first.initialN || first.preWe !== first.initialWe || first.preWi !== first.initialWi) throw new Error('Initial coverage');
  for (const s of trace) {
    if (s.step !== (prior ? prior.step + 1 : 0) || s.t !== s.step * s.dt) throw new Error('Step/time continuity');
    if (prior && (s.preN !== prior.postN || s.preWe !== prior.postWe || s.preWi !== prior.postWi || s.dt !== prior.dt)) throw new Error('State continuity');
    const heat = s.t >= 1 && s.t < 4 ? 1 : 0;
    const ip = s.t < 1 ? .4 + (controls.ip - .4) * s.t : s.t > 4 ? controls.ip + (.4 - controls.ip) * (s.t - 4) : controls.ip;
    const nbi = controls.nbi * heat, ech = controls.ech * heat;
    const density = s.preN / s.volume, te = s.preWe / (1.5 * s.preN * 1.602176634e-16);
    const tauE = constantClosure?.tauE ?? .12 * (ip / 1.2) ** .7 * (controls.bt / 2) ** .2 * (Math.max(density, 1e18) / 4e19) ** .2 * (Math.max(nbi + ech, .5) / 5) ** -.35;
    const tauP = constantClosure?.tauP ?? 1.6;
    const resistivity = constantClosure?.resistivity ?? 2.8e-8 * Math.max(te, .02) ** -1.5;
    const gas = .3 * controls.gas * 1e21, beam = .8 * nbi * 1e6 / (80 * 1.602176634e-16), sink = s.preN / tauP;
    const electronNbi = .8 * .35 * nbi * 1e6, electronEch = .9 * ech * 1e6, ionNbi = .8 * .65 * nbi * 1e6;
    const ohmic = resistivity * (2 * Math.PI * 1.66) ** 2 / s.volume * (ip * 1e6) ** 2;
    const radiation = 1.69e-38 * density ** 2 * Math.sqrt(te * 1000) * s.volume;
    const ionization = .0136 * 1.602176634e-16 * .3 * controls.gas * 1e21;
    const exchange = (s.preWe - s.preWi) / .25, electronLoss = s.preWe / tauE, ionLoss = s.preWi / tauE;
    const flux = { N: [gas, beam, -sink], We: [electronNbi, electronEch, ohmic, -electronLoss, -radiation, -ionization, -exchange], Wi: [ionNbi, -ionLoss, exchange], W: [electronNbi, electronEch, ionNbi, ohmic, -electronLoss, -ionLoss, -radiation, -ionization] };
    for (const [key, rate] of Object.entries({ gas, beam, sink, electronNbi, electronEch, ionNbi, ohmic, radiation, ionization, electronLoss, ionLoss, electronExchange: -exchange, ionExchange: exchange })) components[key] = (components[key] || 0) + rate * s.dt;
    for (const key of Object.keys(worst)) {
      const pre = key === 'W' ? s.preWe + s.preWi : s[`pre${key}`], post = key === 'W' ? s.postWe + s.postWi : s[`post${key}`];
      const initial = key === 'W' ? first.initialWe + first.initialWi : first[`initial${key}`];
      const increment = s.dt * flux[key].reduce((a, b) => a + b, 0), absIncrement = s.dt * flux[key].reduce((a, b) => a + Math.abs(b), 0);
      totals[key] += increment; absolute[key] += absIncrement;
      const error = Math.max(Math.abs(post - pre - increment) / Math.max(pre, absIncrement), Math.abs(post - initial - totals[key]) / Math.max(initial, absolute[key]));
      if (error > worst[key]) { worst[key] = error; worstTime[key] = s.t; }
    }
    prior = s;
  }
  if (trace.length !== Math.round(5 / first.dt) || Math.abs(prior.t + prior.dt - 5) > 1e-14) throw new Error('Final coverage');
  return { worst, worstTime, components };
}
