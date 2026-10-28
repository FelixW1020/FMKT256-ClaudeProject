/* Torque scenario engine.
   Two lenses:
   - history: measured factor betas (monthly 2014-2026 or weekly since Nov 2023), shrunk toward peers, plus the
     cash-flow model's estimate for the forces history has no stable measure of (the dollar, the factory cycle,
     tariffs, wages and the robotics forces)
   - fundamentals: driver profile per company, reverse DCF calibrated to today's price
   Runs in the browser (window.TorqueModel) and in Node for tests. */
// The engine is a plain factory so the page can also run it inside a Web Worker for the Monte Carlo ranges.
function TorqueModelFactory(root) {
  'use strict';

  // ---------- small numerics ----------
  function randn(rng) { // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  // solve A x = b for small dense systems (Gaussian elimination with partial pivoting)
  function solve(A, b) {
    const n = b.length, M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // ---------- scenario definition ----------
  const DEFAULT_SCENARIO = {
    dy10: 0, cause: 'term', usd: 0, jpy: 0, oil: 0, copper: 0, cycle: 0, credit: 0, mood: 0,
    semis: 0, china: 0, wages: 0, tariff: 0, timeline: 0, pricewar: 0, magnets: 0, funding: 0,
    incident: 'none', linked: true, lens: 'monthly', blend: 0.5
  };
  // How a 100bp move in the 10-year splits and what tends to come with it, by cause.
  // real/be: share of the nominal move in real yield vs breakeven. front: short-rate move per 1pp of 10y.
  // overlay: companion moves per +100bp (scaled linearly with the move).
  const CAUSES = {
    growth:    { label: 'Stronger growth', down: 'Weaker growth', phraseUp: 'stronger growth', phraseDown: 'weaker growth', neutral: 'Growth news', real: 0.65, be: 0.35, front: 0.8, theta: 0.45,
                 overlay: { cycle: 12, copper: 6, mood: 4, credit: -25, usd: 1 } },
    inflation: { label: 'Inflation scare', down: 'Cooling inflation', phraseUp: 'an inflation scare', phraseDown: 'cooling inflation', neutral: 'Inflation news', real: 0.25, be: 0.75, front: 1.0, theta: 0.1,
                 overlay: { oil: 15, copper: 4, mood: -4, credit: 30, usd: 0.5, wages: 0.4 } },
    term:      { label: 'Term premium', down: 'Term premium', phraseUp: 'a rising term premium', phraseDown: 'a falling term premium', neutral: 'Term premium', real: 0.9, be: 0.1, front: 0.25, theta: 0.1,
                 overlay: { mood: -2, credit: 15 } },
    policy:    { label: 'Fed tightening', down: 'Fed easing', phraseUp: 'Fed tightening', phraseDown: 'Fed easing', neutral: 'Fed policy', real: 1.05, be: -0.05, front: 1.4, theta: 0.2,
                 overlay: { usd: 3, mood: -5, credit: 40, cycle: -5 } }
  };
  const LINKABLE = ['usd', 'jpy', 'oil', 'copper', 'cycle', 'credit', 'semis', 'china', 'mood'];

  // controls -> factor value in each lens' units
  const FACTOR_FROM_CONTROL = {
    USD: c => Math.log1p(c.usd / 100), JPY: c => Math.log1p(c.jpy / 100), OIL: c => Math.log1p(c.oil / 100),
    CU: c => Math.log1p(c.copper / 100), CYC: c => c.cycle / 10, CREDIT: c => c.credit / 100,
    SEMI: c => Math.log1p(c.semis / 100), CHINA: c => Math.log1p(c.china / 100), MKT: c => Math.log1p(c.mood / 100)
  };
  const CONTROL_FROM_FACTOR = {
    USD: ['usd', v => Math.expm1(v) * 100], JPY: ['jpy', v => Math.expm1(v) * 100], OIL: ['oil', v => Math.expm1(v) * 100],
    CU: ['copper', v => Math.expm1(v) * 100], CYC: ['cycle', v => v * 10], CREDIT: ['credit', v => v * 100],
    SEMI: ['semis', v => Math.expm1(v) * 100], CHINA: ['china', v => Math.expm1(v) * 100], MKT: ['mood', v => Math.expm1(v) * 100]
  };

  // Resolve a scenario: apply the cause split and overlay, then let unset factors follow their
  // historical conditional mean given the set ones (if linked). Returns the full control set plus
  // the factor vector for the chosen lens and which controls were filled in by history.
  function resolve(scn, data) {
    const s = Object.assign({}, DEFAULT_SCENARIO, scn);
    const cause = CAUSES[s.cause] || CAUSES.term;
    const k = s.dy10 / 100; // pp of 10y move
    const ctl = Object.assign({}, s);
    const setByUser = {};
    LINKABLE.concat(['wages']).forEach(key => { setByUser[key] = Math.abs(s[key]) > 1e-9; });
    // overlay only fills what the user did not set
    const overlayed = {};
    Object.entries(cause.overlay).forEach(([key, per100]) => {
      if (!setByUser[key] && k !== 0) { ctl[key] = per100 * k; overlayed[key] = true; }
    });
    const lens = data.factors[s.lens] || data.factors.monthly;
    const names = lens.names;
    const x = names.map(n => {
      if (n === 'RR') return k * cause.real;
      if (n === 'BE') return k * cause.be;
      return FACTOR_FROM_CONTROL[n](ctl);
    });
    // Linked factors: only the dollar and the yen follow the rate move. Splitting months by whether stocks
    // and yields moved together (growth news) or apart (discount-rate news), the yen's response to a 100bp
    // rise is about +6% to +7% in both and the dollar rises or holds flat in both, while oil, copper and the
    // factory cycle flip sign, so the cause overlays carry those instead. The fill uses raw currency moves, the
    // same units the controls show.
    const linkedFill = {};
    const L = lens.link;
    if (s.linked && L && k !== 0) {
      const keyOf = { USD: 'usd', JPY: 'jpy' };
      const val = { RR: k * cause.real, BE: k * cause.be, USD: Math.log1p(ctl.usd / 100), JPY: Math.log1p(ctl.jpy / 100) };
      const setIdx = [], freeIdx = [];
      L.names.forEach((n, i) => {
        if (n === 'RR' || n === 'BE') { setIdx.push(i); return; }
        if (setByUser[keyOf[n]] || overlayed[keyOf[n]]) setIdx.push(i); else freeIdx.push(i);
      });
      if (freeIdx.length) {
        const S = L.cov;
        const w = solve(setIdx.map(i => setIdx.map(j => S[i][j])), setIdx.map(i => val[L.names[i]]));
        if (w) {
          freeIdx.forEach(i => {
            let v = 0; setIdx.forEach((j, a) => { v += S[i][j] * w[a]; });
            const key = keyOf[L.names[i]];
            ctl[key] = Math.expm1(v) * 100; linkedFill[key] = true;
          });
          names.forEach((n, i) => { if (n === 'USD' || n === 'JPY') x[i] = FACTOR_FROM_CONTROL[n](ctl); });
        }
      }
    }
    return { ctl, x, names, cause, overlayed, linkedFill, proj: lens.proj || null, rr: k * cause.real, be: k * cause.be, front: k * cause.front };
  }

  // ---------- history lens ----------
  // Forces without a stable history factor. The history lens borrows the cash-flow model's estimate for them, so
  // both lenses carry them in full and the blend does not halve them.
  // The measured betas already carry the typical co-movement of these forces with the factors (a credit beta
  // includes what the cycle usually does when spreads widen). A force left at zero is read as doing what it
  // typically does, so nothing is added; a force that is set adds only its departure from what the scenario's
  // factor moves already imply. The ramp keeps the result continuous as a slider leaves zero.
  function implied(R, key) {
    const P = R.proj; if (!P || !P[key]) return 0;
    let v = 0;
    P.names.forEach((n, i) => { const j = R.names.indexOf(n); if (j >= 0) v += P[key][i] * R.x[j]; });
    return v;
  }
  function beyond(v, imp) { return v - imp * Math.min(1, Math.abs(v) / Math.max(Math.abs(imp), 1e-9)); }
  function unmeasured(stock, R) {
    const h = stock.hist && stock.hist[R.ctl.lens || 'monthly'], c = R.ctl, names = R.names;
    const pick = {}; let any = false;
    const MIN = { usd: 0.05, jpy: 0.05, cycle: 0.1 };     // below this the force is effectively at its typical value
    const take = (key, v) => { if (v == null) v = c[key]; if (v && v !== 'none' && (typeof v !== 'number' || Math.abs(v) > (MIN[key] || 1e-9))) { pick[key] = v; any = true; } };
    if (names.indexOf('USD') < 0) take('usd', beyond(c.usd, Math.expm1(implied(R, 'usd')) * 100));
    const ji = names.indexOf('JPY');
    if (ji < 0 || !h || !h.beta[ji]) take('jpy', beyond(c.jpy, Math.expm1(implied(R, 'jpy')) * 100));   // the yen is measured only for the Japanese makers
    if (names.indexOf('CYC') < 0) take('cycle', beyond(c.cycle, implied(R, 'cycle')));
    ['wages', 'tariff', 'timeline', 'pricewar', 'magnets', 'funding', 'incident'].forEach(k => take(k));
    if (!any) return null;
    return { ctl: Object.assign({}, DEFAULT_SCENARIO, { lens: c.lens, linked: false }, pick), keys: Object.keys(pick), rr: 0, be: 0, front: 0, cause: { theta: 0 } };
  }
  const FAST = { fast: true };
  function historyLens(stock, R, P, rng, lite) {
    const h = stock.hist && stock.hist[R.ctl.lens || 'monthly'];
    if (!h) return null;
    let mu = 0;
    const parts = {};
    R.names.forEach((n, i) => { const c = h.beta[i] * R.x[i]; mu += c; parts[n] = c; });
    const RU = stock.fund ? unmeasured(stock, R) : null;
    const U = RU ? fundamentalsLens(stock, RU, lite ? FAST : null) : null;
    if (U) { parts.FUNDONLY = Math.log1p(U.mean); mu += parts.FUNDONLY; }
    const sims = [];
    const nf = R.names.length, a = Math.SQRT1_2;
    for (let d = 0; d < P.length; d++) {
      // estimation errors are half shared across companies, since every beta is pulled toward the same peer prior
      let v = 0;
      for (let i = 0; i < nf; i++) v += (h.beta[i] + h.se[i] * (a * P[d].z[i] + a * randn(rng))) * R.x[i];
      if (RU) v += Math.log1p(fundamentalsLens(stock, RU, P[d]).mean);
      sims.push(Math.expm1(v));
    }
    const sorted = sims.slice().sort((x, y) => x - y);
    // simple-return contributions that add up to the total: each log part times (e^S - 1) / S
    const eS = Math.abs(mu) < 1e-12 ? 1 : Math.expm1(mu) / mu, add = {};
    for (const kk in parts) add[kk] = parts[kk] * eS;
    return { mean: Math.expm1(mu), lo: quantile(sorted, 0.1), hi: quantile(sorted, 0.9), partsLog: parts, parts: add, fundOnly: U && U.channels ? U.channels : null, fundOnlyKeys: RU ? RU.keys : [], sims, r2: h.r2, n: h.n };
  }

  // ---------- fundamentals lens ----------
  // revenue elasticities by end market, % revenue per unit of each driver
  // drivers: cyc (per 10pt Philly), rate (per +1pp nominal 10y), semis (per 1% semis vs mkt),
  // mood (per 1% mood), wages (per +1pp wage growth, half lands within a year), oil (per 1% oil)
  // cyc is the factory cycle: robot and automation orders swing 30% to 40% between a Philly Fed reading near +30
  // and one near -20, so general industry moves about 8% per 10 points
  const ELASTICITY = {
    general:     { cyc: 8.0, rate: -2.5, semis: 0.00, mood: 0.05, wages: 1.5, oil: -0.03 },
    auto:        { cyc: 6.0, rate: -4.0, semis: 0.00, mood: 0.08, wages: 1.0, oil: -0.05 },
    electronics: { cyc: 6.0, rate: -2.0, semis: 0.25, mood: 0.05, wages: 0.5, oil: 0 },
    semis:       { cyc: 4.0, rate: -1.0, semis: 0.60, mood: 0.05, wages: 0, oil: 0 },
    logistics:   { cyc: 3.0, rate: -3.0, semis: 0.00, mood: 0.08, wages: 2.5, oil: 0 },
    healthcare:  { cyc: 0.5, rate: -1.0, semis: 0.00, mood: 0.02, wages: 0.3, oil: 0 },
    consumer:    { cyc: 4.0, rate: -5.0, semis: 0.00, mood: 0.12, wages: 0, oil: 0.03 },
    energy:      { cyc: 3.0, rate: -1.5, semis: 0.00, mood: 0.03, wages: 0, oil: 0.10 },
    research:    { cyc: 1.0, rate: -1.5, semis: 0.05, mood: 0.10, wages: 0, oil: 0 },
    gov:         { cyc: 0.0, rate: 0.0, semis: 0.00, mood: 0.00, wages: 0, oil: 0 }
  };
  const BASE = { rf: 5.00, erp: 3.75, gT: 3.5 };      // percent; rf is replaced by the latest 10-year yield in prepare()
  const PERSIST_DEMAND = [1, 0.75, 0.5, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25];
  const PERSIST_COST = [1, 0.6, 0.3, 0, 0, 0, 0, 0, 0, 0];          // commodity prices mean-revert and get passed on
  const PERSIST_POLICY = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5]; // tariffs and wage levels stay; pricing catches up by half
  const PW_PERSIST = [1, 1, 0.8, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7];
  const MAGNET_PRICE = [0, 0.5, 2.0], MAGNET_SUPPLY = [0, -0.01, -0.04];
  const LV = new Float64Array(10), MS = new Float64Array(10);   // scratch buffers for the Monte Carlo path

  const HORIZON = 20;
  function dcf(p, kPct, gTPct, levelShift, marginShift, gamma) {
    // p: {rev1, g1, m1, mT, tax, conv}; levelShift[t], marginShift[t]: arrays for the first ten years, with the
    // year-ten value carried through the rest of the horizon and into the terminal value
    const k = kPct / 100, gT = gTPct / 100, N = HORIZON;
    let R = p.rev1, pv = 0, fcf = 0, disc = 1;
    for (let t = 1; t <= N; t++) {
      if (t >= 2) R *= 1 + gT + (p.g1 + gamma - gT) * (N - t) / (N - 2);
      const j = Math.min(t, 10) - 1;
      const m = p.m1 + (p.mT - p.m1) * Math.min(1, (t - 1) / 7) + (marginShift ? marginShift[j] : 0);
      const Rt = R * (1 + (levelShift ? levelShift[j] : 0));
      fcf = Rt * m * (1 - p.tax) * p.conv;
      disc /= (1 + k);
      pv += fcf * disc;
    }
    const tv = fcf * (1 + gT) / Math.max(k - gT, 0.015);
    return pv + tv * disc;
  }
  // pre-profit companies: equity = cash - debt + the future business - the cash they will burn first
  const BURN_YEARS = 2.5, BURN_DUR = 1.5;
  function calibrate(stock) {
    const f = stock.fund; if (!f) return;
    const ev = f.mcap + f.debt - f.cash;
    const optShare = f.opt ? f.opt.share : 0;
    f._kCapm = BASE.rf + f.beta * BASE.erp;
    f._p = { rev1: f.rev, g1: f.g1, m1: f.m1, mT: f.mT, tax: f.tax, conv: f.conv };
    f._burnPV = 0; f._optImplied = 0;
    if (f.m1 <= 0 || f.burn > 0 || ev <= 0) {
      f._burnPV = (f.burn || 0) * BURN_YEARS;
      const future = Math.max(0.05 * f.mcap, ev + f._burnPV);
      f._ev0 = future; f._opt0 = future * optShare; f._core0 = future - f._opt0;
      f._k0 = f._kCapm; f._dcfOK = false; f._lateShare = null; f._icc = null; f._impliedCagr = null;
      f._durCore = f.durFallback || 25; return;
    }
    f._ev0 = ev; f._opt0 = ev * optShare; f._core0 = ev - f._opt0;
    // implied cost of capital: hold growth at expectations (next-year growth fading to the terminal rate
    // over twenty years) and solve for the discount rate that reproduces today's core enterprise value
    const v = k => dcf(f._p, k, BASE.gT, null, null, 0);
    const kMin = BASE.gT + 1.5, kMax = 24;
    let k;
    if (v(kMin) < f._core0) {
      // even a 5% discount rate and consensus growth cannot reach the price: the rest is treated as optionality
      k = kMin; f._iccClamp = 'floor';
      const extra = f._core0 - v(kMin);
      f._opt0 += extra; f._core0 -= extra; f._optImplied = extra / ev;
    }
    else if (v(kMax) > f._core0) { k = kMax; f._iccClamp = 'cap'; }
    else {
      let lo = kMin, hi = kMax;
      for (let it = 0; it < 70; it++) { const mid = (lo + hi) / 2; if (v(mid) > f._core0) lo = mid; else hi = mid; }
      k = (lo + hi) / 2; f._iccClamp = null;
    }
    f._k0 = k; f._icc = k; f._dcfOK = true;
    f._V0 = v(k);
    // modified duration of the core, bounded so very expensive names stay within the range history supports
    f._durRaw = -(v(k + 0.5) - v(k - 0.5)) / f._V0 / 0.01;
    f._durCore = Math.max(8, Math.min(32, f._durRaw));
    // growth the price would need at a CAPM discount rate (for display)
    const vg = gm => dcf(f._p, f._kCapm, BASE.gT, null, null, gm) - f._core0;
    let lo = -0.5, hi = 1.5;
    if (vg(lo) * vg(hi) < 0) {
      for (let it = 0; it < 70; it++) { const mid = (lo + hi) / 2; if (vg(mid) * vg(lo) <= 0) hi = mid; else lo = mid; }
      const gm = (lo + hi) / 2, N = HORIZON, gT = BASE.gT / 100; let R = f.rev;
      for (let t = 2; t <= 10; t++) R *= 1 + gT + (f.g1 + gm - gT) * (N - t) / (N - 2);
      f._impliedCagr = Math.pow(R / f.rev, 1 / 9) - 1;
    } else f._impliedCagr = null;
    // share of core value arriving after year 5
    { const N = HORIZON, gT = BASE.gT / 100, kk = k / 100; let R = f.rev, early = 0, disc = 1;
      for (let t = 1; t <= 5; t++) {
        if (t >= 2) R *= 1 + gT + (f.g1 - gT) * (N - t) / (N - 2);
        const m = f.m1 + (f.mT - f.m1) * Math.min(1, (t - 1) / 7);
        disc /= 1 + kk; early += R * m * (1 - f.tax) * f.conv * disc;
      }
      f._lateShare = Math.max(0, Math.min(1, 1 - early / f._V0)); }
  }

  function fundamentalsLens(stock, R, opts) {
    const f = stock.fund; if (!f) return null;
    const c = R.ctl, m = opts || {};
    const em = m.elastMult == null ? 1 : m.elastMult, ptAdj = m.passAdj || 0, cmMult = m.cmMult == null ? 1 : m.cmMult,
      durMult = m.durMult == null ? 1 : m.durMult, erpMult = m.erpMult == null ? 1 : m.erpMult, fast = !!m.fast,
      fxMult = m.fxMult == null ? 1 : m.fxMult, pwMult = m.pwMult == null ? 1 : m.pwMult,
      fundMult = m.fundMult == null ? 1 : m.fundMult, optMult = m.optMult == null ? 1 : m.optMult;
    const pass = Math.min(0.95, Math.max(0, f.pass + ptAdj));
    const nomRate = R.rr + R.be; // pp change in the 10-year nominal yield
    // 1. demand by end market
    let dDemand = 0;
    for (const mk in f.endMix) {
      const e = ELASTICITY[mk], w = f.endMix[mk]; if (!e || !w) continue;
      dDemand += w * em * (e.cyc * c.cycle / 10 + e.rate * nomRate + e.semis * c.semis + e.mood * c.mood + e.wages * c.wages * 0.5 + e.oil * c.oil) / 100;
    }
    dDemand += (f.region.china || 0) * em * 0.3 * c.china / 100;
    // tariffs: imported robots lose US sales, domestic makers gain some; a policy shift that lasts
    const usShare = f.region.us || 0;
    const dTariff = (f.tariffRole === 'importer' ? -0.004 : f.tariffRole === 'domestic' ? 0.0015 : 0) * c.tariff * usShare * em;
    // 2. currency: dollar value of foreign-currency revenue and costs (a weaker currency shrinks its flows in dollars)
    const fxMove = { USD: 0, HKD: 0, JPY: c.jpy / (100 + c.jpy), CNY: 0.5 * c.usd / (100 + c.usd), EUR: 0.8 * c.usd / (100 + c.usd), OTHER: 0.6 * c.usd / (100 + c.usd) };
    let revFx = 0, costFx = 0;
    for (const cc in f.revCcy) revFx += f.revCcy[cc] * (fxMove[cc] || 0) * fxMult;
    for (const cc in f.costCcy) costFx += f.costCcy[cc] * (fxMove[cc] || 0) * fxMult;
    // a pre-profit company's current margin says nothing about its long-run value, so its operating leverage
    // is measured against the long-run margin instead
    const mBase = f._dcfOK ? f.m1 : Math.max(f.mT, 0.05);
    const dFxRev = -revFx;                                  // fraction of revenue
    const dFxEbit = -revFx + (1 - mBase) * costFx;          // EBIT change as a fraction of revenue
    // 3. price war and magnet supply
    const pw = (c.pricewar || 0) * pwMult;
    const dPwRev = -pw * (f.pwExposure || 0) * 0.08 + pw * (f.pwGain || 0);
    const dPwEbit = -pw * (f.pwExposure || 0) * 0.08 * 0.6 + pw * (f.pwGain || 0) * mBase * 0.5 - pw * (f.pwGain ? 0.01 : 0);
    // magnets: Chinese makers buy at home; others are exposed in proportion to the supply they have not secured
    const mag = Math.max(0, Math.min(2, Math.round(c.magnets || 0)));
    const exposed = f.chinaMagnets ? 0.25 : 1 - (f.magnetSecured || 0);
    const magPrice = MAGNET_PRICE[mag] * exposed;
    const dSupply = (f.costs.magnets >= 0.02 ? MAGNET_SUPPLY[mag] : MAGNET_SUPPLY[mag] * 0.25) * (f.chinaMagnets ? 0.3 : exposed) * em;
    // 4. input costs: only the share not passed on hurts the margin. Commodity shocks fade; tariffs and wages persist.
    const costCommod = f.costs.metals * 0.7 * c.copper / 100 + f.costs.chips * 0.3 * Math.max(0, c.semis) / 100 +
      f.costs.energy * 0.5 * c.oil / 100 + f.costs.magnets * magPrice;
    const costPolicy = f.costs.labor * c.wages / 100 + f.costs.imported * c.tariff / 100;
    const costShock = costCommod + costPolicy;
    const dCostC = -(1 - pass) * costCommod, dCostP = -(1 - pass) * costPolicy, dCostEbit = dCostC + dCostP;
    // 5. twelve-month financials (USD bn)
    const cm = Math.min(0.95, f.cm * cmMult);
    const rev0 = f.rev, ebit0 = f.rev * f.m1, vol = dDemand + dSupply, volAll = vol + dTariff;
    const rev1 = rev0 * (1 + volAll + dFxRev + dPwRev);
    const ebit1 = ebit0 + cm * rev0 * volAll + rev0 * dFxEbit + rev0 * dCostEbit + rev0 * dPwEbit;
    const dInt = ((f.debt * (f.floating || 0)) - f.cash) * R.front / 100;
    const ni0 = f.eps * f.sharesM / 1000 / (f.fx || 1);   // USD bn, consensus
    const ni0m = (ebit0 + 0.04 * (f.cash - f.debt)) * (1 - f.tax);   // the model's own net income, interest at about 4%
    const dNi = (ebit1 - ebit0 - dInt) * (1 - f.tax);
    // 6. valuation: discount-rate effects through duration, cash-flow effects through the DCF
    const dErp = (0.30 * c.credit / 100 - 0.04 * c.mood) * erpMult;        // pp, market-wide
    const dG = pass * 0.8 * R.be + (R.cause.theta || 0) * R.rr;          // pp change in long-run nominal growth
    const dRates = nomRate - dG, dRisk = f.beta * dErp;
    const D = f._durCore * durMult;
    const kNew = f._k0 + nomRate + dRisk;
    const lev = (cm - mBase) / (1 + volAll);
    let cfAll, cfDemand = 1, cfFx = 1, cfCosts = 1;
    if (fast) {
      // Monte Carlo path: one pass into scratch buffers and a single cash-flow run
      let sl = 0, sm = 0;
      for (let i = 0; i < 10; i++) {
        const pd = PERSIST_DEMAND[i], pp = PERSIST_POLICY[i], pw = PW_PERSIST[i], dem = pd * vol + pp * dTariff;
        LV[i] = dem + pd * dFxRev + pw * dPwRev;
        MS[i] = dem * lev + pd * (dFxEbit - mBase * dFxRev) + PERSIST_COST[i] * dCostC + pp * dCostP + pw * (dPwEbit - mBase * dPwRev);
        sl += LV[i]; sm += MS[i];
      }
      cfAll = f._dcfOK ? dcf(f._p, f._k0, BASE.gT, LV, MS, 0) / f._V0 : 1 + sl / 10 + sm / 10 / Math.max(f.mT, 0.05);
    }
    const comp = fast ? null : {
      demand: { lv: PERSIST_DEMAND.map((w, i) => w * vol + PERSIST_POLICY[i] * dTariff), ms: PERSIST_DEMAND.map((w, i) => (w * vol + PERSIST_POLICY[i] * dTariff) * lev) },
      fx: { lv: PERSIST_DEMAND.map(w => w * dFxRev), ms: PERSIST_DEMAND.map(w => w * (dFxEbit - mBase * dFxRev)) },
      costs: { lv: PW_PERSIST.map(w => w * dPwRev), ms: PERSIST_COST.map((w, i) => w * dCostC + PERSIST_POLICY[i] * dCostP + PW_PERSIST[i] * (dPwEbit - mBase * dPwRev)) }
    };
    if (fast) { /* done above */ }
    else if (f._dcfOK) {
      const base = f._V0;
      const ratio = (lv, ms) => dcf(f._p, f._k0, BASE.gT, lv, ms, 0) / base;
      const lvAll = comp.demand.lv.map((v, i) => v + comp.fx.lv[i] + comp.costs.lv[i]);
      const msAll = comp.demand.ms.map((v, i) => v + comp.fx.ms[i] + comp.costs.ms[i]);
      cfAll = ratio(lvAll, msAll);
      cfDemand = ratio(comp.demand.lv, comp.demand.ms); cfFx = ratio(comp.fx.lv, comp.fx.ms); cfCosts = ratio(comp.costs.lv, comp.costs.ms);
    } else {
      // pre-profit: average level and margin shifts over the decade move value proportionally
      const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
      const mt = Math.max(f.mT, 0.05);
      const r = cmp => 1 + avg(cmp.lv) + avg(cmp.ms) / mt;
      cfDemand = r(comp.demand); cfFx = r(comp.fx); cfCosts = r(comp.costs);
      cfAll = cfDemand + cfFx + cfCosts - 2;
    }
    const floorCf = v => Math.max(0.05, v);
    cfAll = floorCf(cfAll); cfDemand = floorCf(cfDemand); cfFx = floorCf(cfFx); cfCosts = floorCf(cfCosts);
    const core0 = f._core0;
    const rateFactor = Math.exp(-D * dRates / 100), riskFactor = Math.exp(-D * dRisk / 100);
    const coreAll = core0 * rateFactor * riskFactor * cfAll;
    // optionality (humanoids, robotaxis) behaves like a far-dated asset with its own duration
    const o = f.opt || { share: 0, dur: 14 };
    const optDur = (o.dur || 14) * durMult;
    const kOpt = f._k0 / 100 + 0.03;
    const incidentHit = Math.min(0.95, (c.incident === 'av' ? (o.av || 0) : c.incident === 'humanoid' ? (o.humanoid || 0) : 0) * optMult);
    const optRate = Math.exp(-optDur * dRates / 100), optRisk = Math.exp(-optDur * dRisk / 100);
    const optTimeline = Math.pow(1 + kOpt, -(c.timeline || 0) * optMult);
    const opt0 = f._opt0, optAll = opt0 * optRate * optRisk * optTimeline * (1 - incidentHit);
    // funding: pre-profit companies issue equity; a tighter window costs more dilution
    // funding: equity a burner must raise within two years costs more when spreads widen, the market falls
    // or the window shuts (change in the discount on new shares)
    let fund = 0;
    if (f.burn > 0) {
      const need = Math.max(0, f.burn * 2 - f.cash);
      const dDisc = 0.06 * c.credit / 100 - 0.004 * c.mood - 0.15 * (c.funding || 0);
      fund = -need * dDisc * fundMult;
    }
    const debtReval = -(f.debt * (f.floating || 0)) * R.front / 100 * 2;
    const burnPV = f._burnPV || 0;
    const burnRate = Math.exp(-BURN_DUR * dRates / 100), burnRisk = Math.exp(-BURN_DUR * dRisk / 100);
    const burnAll = burnPV * burnRate * burnRisk;
    const eq0 = f._core0 + f._opt0 + f.cash - f.debt - burnPV;
    const eqRaw = coreAll + optAll + f.cash - f.debt - burnAll + fund + debtReval;
    const eq1 = Math.max(eqRaw, 0.01 * eq0);              // a share price cannot fall below zero
    const total = eq1 / eq0 - 1;
    if (fast) return { mean: total };
    // per-share rows are shown in the listing currency at the scenario exchange rate; returns stay in dollars
    const fxRatio = f.cur === 'JPY' ? 1 + c.jpy / 100 : f.cur === 'CNY' ? 1 + 0.5 * c.usd / 100 : 1;
    // Channels: each block of value moves by a product of factors, so its change splits exactly by log shares
    // (change = base x (e^L - 1) = base x E(L) x sum of the logs). The split stays finite when factors offset,
    // and the channels add up to the total. The small interaction inside the cash flows is shared out by size.
    const E = x => Math.abs(x) < 1e-12 ? 1 : Math.expm1(x) / x;
    const lc = { demand: Math.log(cfDemand), fx: Math.log(cfFx), costs: Math.log(cfCosts) };
    const lAll = Math.log(cfAll), lSum = lc.demand + lc.fx + lc.costs;
    const lAbs = Math.abs(lc.demand) + Math.abs(lc.fx) + Math.abs(lc.costs);
    for (const kk in lc) lc[kk] += lAbs > 1e-12 ? (lAll - lSum) * Math.abs(lc[kk]) / lAbs : (lAll - lSum) / 3;
    const lR = -D * dRates / 100, lK = -D * dRisk / 100, eC = core0 * E(lR + lK + lAll);
    const oR = -optDur * dRates / 100, oK = -optDur * dRisk / 100, oT = Math.log(optTimeline * (1 - incidentHit)), eO = opt0 * E(oR + oK + oT);
    const bR = -BURN_DUR * dRates / 100, bK = -BURN_DUR * dRisk / 100, eB = burnPV * E(bR + bK);
    const raw = {
      rates: eC * lR + eO * oR - eB * bR + debtReval,
      risk: eC * lK + eO * oK - eB * bK,
      demand: eC * lc.demand, costs: eC * lc.costs, fx: eC * lc.fx,
      funding: fund, optionality: eO * oT
    };
    // when the floor binds, the channels shrink in proportion to what is left of the price
    let sumRaw = 0; for (const kk in raw) sumRaw += raw[kk];
    const scale = eq1 !== eqRaw && Math.abs(sumRaw) > 1e-12 ? (eq1 - eq0) / sumRaw : 1;
    const channels = {};
    for (const kk in raw) channels[kk] = raw[kk] * scale / eq0;
    return {
      mean: total, channels,
      fin: {
        rev0, rev1, ebit0, ebit1, m0: f.m1, m1: ebit1 / rev1,
        eps0: f.eps, eps1: f.eps > 0 && ni0m > 0 ? f.eps * (1 + dNi / ni0m) * fxRatio : (ni0 + dNi) * 1000 * (f.fx || 1) * fxRatio / f.sharesM,
        k0: f._k0, k1: kNew, rf0: BASE.rf, rf1: BASE.rf + nomRate, prem0: f._k0 - BASE.rf, prem1: f._k0 - BASE.rf + dRisk,
        g0: BASE.gT, g1: BASE.gT + dG,
        value0: f.price, value1: f.price * (1 + total) * fxRatio, fxRatio,
        dDemand: dDemand + dTariff, dFxRev, dPwRev, dSupply, costShock: costShock * (1 - pass), dInt, dur: D
      }
    };
  }

  // ---------- run ----------
  // opts.lite: means only (no channels or financials), for tables that need many runs at once
  function run(scn, data, opts) {
    const o = Object.assign({ draws: 400, seed: 7 }, opts || {});
    const lite = !!o.lite;
    const R = resolve(scn, data);
    const rng = mulberry32(o.seed);
    const w = R.ctl.blend == null ? 0.5 : R.ctl.blend;
    const out = { R, stocks: {}, basket: null };
    // One set of model-uncertainty draws shared by every company: when a draw makes demand more elastic or
    // duration longer, it does so for all of them, so the basket range keeps that correlation.
    const P = [];
    for (let d = 0; d < o.draws; d++) {
      P.push({ elastMult: Math.max(0, 1 + 0.35 * randn(rng)), passAdj: 0.12 * randn(rng), cmMult: Math.max(0.3, 1 + 0.2 * randn(rng)),
               durMult: Math.max(0.4, 1 + 0.2 * randn(rng)), erpMult: Math.max(0, 1 + 0.3 * randn(rng)),
               fxMult: Math.max(0, 1 + 0.25 * randn(rng)), pwMult: Math.max(0, 1 + 0.3 * randn(rng)),
               fundMult: Math.max(0, 1 + 0.3 * randn(rng)), optMult: Math.max(0, 1 + 0.3 * randn(rng)), fast: true,
               z: R.names.map(() => randn(rng)) });
    }
    const basketSims = new Array(o.draws).fill(0);
    let nB = 0, nH = 0, nF = 0, basketH = 0, basketF = 0;
    data.stocks.forEach(st => {
      const H = historyLens(st, R, P, rng, lite);
      const F = fundamentalsLens(st, R, lite ? FAST : null);
      const fs = F ? P.map(p => fundamentalsLens(st, R, p).mean) : [];
      const fsSorted = fs.slice().sort((a, b) => a - b);
      const blendSims = [];
      for (let d = 0; d < o.draws; d++) {
        const h = H ? H.sims[d] : null, f = F ? fs[d] : null;
        const v = h == null ? f : f == null ? h : (1 - w) * h + w * f;
        blendSims.push(v);
        basketSims[d] += v;
      }
      const bs = blendSims.slice().sort((a, b) => a - b);
      const blendMean = H && F ? (1 - w) * H.mean + w * F.mean : (H ? H.mean : F.mean);
      out.stocks[st.id] = {
        hist: H && { mean: H.mean, lo: H.lo, hi: H.hi, partsLog: H.partsLog, parts: H.parts, fundOnly: H.fundOnly, fundOnlyKeys: H.fundOnlyKeys, r2: H.r2, n: H.n },
        fund: F && { mean: F.mean, lo: quantile(fsSorted, 0.1), hi: quantile(fsSorted, 0.9), channels: F.channels, fin: F.fin },
        blend: { mean: blendMean, lo: quantile(bs, 0.1), hi: quantile(bs, 0.9) }
      };
      nB++; if (H) { nH++; basketH += H.mean; } if (F) { nF++; basketF += F.mean; }
    });
    const bsims = basketSims.map(v => v / nB).sort((a, b) => a - b);
    const vals = Object.values(out.stocks).map(s => s.blend.mean);
    out.basket = { mean: vals.reduce((a, b) => a + b, 0) / nB, lo: quantile(bsims, 0.1), hi: quantile(bsims, 0.9), hist: nH ? basketH / nH : null, fund: nF ? basketF / nF : null };
    // S&P 500 for comparison (history lens only)
    if (data.benchmarks && data.benchmarks.SPY) {
      const sp = historyLens(data.benchmarks.SPY, R, [], rng);
      out.spx = sp ? sp.mean : null;
    }
    return out;
  }

  function prepare(data) {
    if (isFinite(data.rf) && data.rf > 0) BASE.rf = data.rf;
    data.stocks.forEach(calibrate);
    return data;
  }

  root.TorqueModel = { DEFAULT_SCENARIO, CAUSES, ELASTICITY, BASE, resolve, run, prepare, calibrate, historyLens, fundamentalsLens, dcf, quantile, mulberry32 };
}
TorqueModelFactory(typeof window !== 'undefined' ? window : globalThis);
if (typeof window !== 'undefined') window.TorqueModelFactory = TorqueModelFactory;
