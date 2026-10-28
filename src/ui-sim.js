/* Torque simulator: the teach pendant (controls) and the viewport (results). */
(function (root) {
  'use strict';
  const C = root.TorqueCore, M = root.TorqueModel;
  const { fmt, el, svg, esc } = C;

  const CONTROLS = [
    { group: 'macro', key: 'usd', label: 'Dollar index', min: -15, max: 15, step: 0.5, unit: '%', fundOnly: true },
    { group: 'macro', key: 'jpy', label: 'Yen per dollar', min: -20, max: 20, step: 0.5, unit: '%', hint: 'Positive means a weaker yen' },
    { group: 'macro', key: 'oil', label: 'Oil', min: -50, max: 80, step: 1, unit: '%' },
    { group: 'macro', key: 'copper', label: 'Copper and metals', min: -40, max: 50, step: 1, unit: '%' },
    { group: 'macro', key: 'cycle', label: 'Factory activity', min: -40, max: 40, step: 1, unit: ' pts', hint: 'Philadelphia Fed activity index', fundOnly: true },
    { group: 'macro', key: 'credit', label: 'High-yield credit spread', min: -150, max: 500, step: 5, unit: 'bp' },
    { group: 'macro', key: 'mood', label: 'Broad market', min: -30, max: 30, step: 0.5, unit: '%', hint: 'S&P 500 move beyond what macro explains' },
    { group: 'macro', key: 'semis', label: 'AI chip cycle', min: -40, max: 40, step: 1, unit: '%', hint: 'Semiconductors versus the market' },
    { group: 'macro', key: 'china', label: 'China', min: -30, max: 30, step: 1, unit: '%', hint: 'China A-shares versus the market' },
    { group: 'macro', key: 'wages', label: 'US wage growth', min: -2, max: 3, step: 0.1, unit: 'pp', fundOnly: true },
    { group: 'macro', key: 'tariff', label: 'Tariffs on robots and parts', min: -10, max: 40, step: 1, unit: 'pp', fundOnly: true },
    { group: 'micro', key: 'timeline', label: 'Humanoid and autonomy timeline', min: -3, max: 3, step: 0.25, unit: ' yr', hint: 'Negative means sooner than the market expects', fundOnly: true },
    { group: 'micro', key: 'pricewar', label: 'Chinese price competition', min: 0, max: 1, step: 0.05, unit: '', words: v => v < 0.05 ? 'None' : v < 0.45 ? 'Mild' : v < 0.8 ? 'Moderate' : 'Severe', fundOnly: true },
    { group: 'micro', key: 'funding', label: 'Funding for pre-profit companies', min: -1, max: 1, step: 0.1, unit: '', words: v => v < -0.6 ? 'Shut' : v < -0.15 ? 'Tight' : v <= 0.15 ? 'Normal' : v < 0.6 ? 'Easy' : 'Very easy', fundOnly: true }
  ];
  const SEGS = {
    magnets: { label: 'Rare-earth magnet supply', opts: [['0', 'Normal'], ['1', 'Tight'], ['2', 'Embargo']] },
    incident: { label: 'Safety incident', opts: [['none', 'None'], ['av', 'Robotaxi or truck'], ['humanoid', 'Humanoid']] }
  };
  const CHANNEL_LABEL = { rates: 'Interest rates', risk: 'Risk premium', demand: 'Demand', costs: 'Costs and pricing', fx: 'Currency', funding: 'Funding', optionality: 'Future businesses' };
  const FACTOR_LABEL = { RR: 'Real yield', BE: 'Breakeven inflation', USD: 'Dollar', JPY: 'Yen', OIL: 'Oil', CU: 'Copper', CYC: 'Factory activity', CREDIT: 'Credit spread', SEMI: 'AI chip cycle', CHINA: 'China', MKT: 'Broad market', FUNDONLY: 'Cash-flow drivers' };
  // names for the forces both lenses take from the cash-flow model
  const UNMEASURED = { usd: 'the dollar', jpy: 'the yen', cycle: 'factory activity', wages: 'wages', tariff: 'tariffs', timeline: 'the humanoid timeline', pricewar: 'price competition', magnets: 'magnet supply', funding: 'funding conditions', incident: 'the incident' };
  const CUR_NAME = { JPY: 'yen', CNY: 'yuan', HKD: 'Hong Kong dollars' };
  const DRAWS = 320, SEED = 11;

  // ---------- Monte Carlo ranges off the main thread ----------
  // Point estimates take well under a millisecond and render at once. The 320-draw ranges run in a Web Worker
  // built from the same engine, so scrolling and springs never wait for them; without a worker they run inline.
  function bandsOf(o) {
    const st = {};
    for (const id in o.stocks) {
      const r = o.stocks[id];
      st[id] = { b: [r.blend.lo, r.blend.hi], h: r.hist ? [r.hist.lo, r.hist.hi] : null, f: r.fund ? [r.fund.lo, r.fund.hi] : null };
    }
    return { basket: [o.basket.lo, o.basket.hi], stocks: st };
  }
  const MC = (function () {
    let worker = null, broken = false, posted = null, postedN = -1, seq = 0, waiting = null, watchdog = null;
    const slim = data => ({ rf: data.rf, factors: data.factors, benchmarks: data.benchmarks, stocks: data.stocks.map(s => ({ id: s.id, hist: s.hist, fund: s.fund })) });
    function inline(w) { w.cb(bandsOf(M.run(w.scn, w.data, { draws: DRAWS, seed: SEED }))); }
    function fail() {
      broken = true;
      if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } }
      worker = null;
      if (waiting) { const w = waiting; waiting = null; inline(w); }
    }
    function start() {
      if (worker || broken) return worker;
      try {
        if (!root.Worker || !root.Blob || !root.URL || !root.TorqueModelFactory) throw new Error('no worker support');
        const src = '(' + root.TorqueModelFactory.toString() + ')(self);\n' +
          'var D = null;\n' +
          'self.onmessage = function (e) {\n' +
          '  var m = e.data;\n' +
          '  if (m.type === "data") { D = self.TorqueModel.prepare(m.data); return; }\n' +
          '  var o = self.TorqueModel.run(m.scn, D, { draws: m.draws, seed: m.seed });\n' +
          '  self.postMessage({ seq: m.seq, bands: (' + bandsOf.toString() + ')(o) });\n' +
          '};\n';
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        worker.onmessage = e => {
          if (!waiting || e.data.seq !== waiting.seq) return;
          clearTimeout(watchdog);
          const w = waiting; waiting = null; w.cb(e.data.bands);
        };
        worker.onerror = fail;
      } catch (e) { broken = true; worker = null; }
      return worker;
    }
    function request(scn, data, cb) {
      const job = { scn: Object.assign({}, scn), data, cb };
      const w = start();
      if (!w) { inline(job); return; }
      if (posted !== data || postedN !== data.stocks.length) { w.postMessage({ type: 'data', data: slim(data) }); posted = data; postedN = data.stocks.length; }
      job.seq = ++seq; waiting = job;
      w.postMessage({ type: 'run', seq: job.seq, scn: job.scn, draws: DRAWS, seed: SEED });
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { if (waiting === job) fail(); }, 5000);
    }
    return { request };
  })();

  function rangeControl(spec, value, onInput) {
    const id = 'ctl-' + spec.key;
    const w = el('div', { class: 'range' });
    w.innerHTML = `<div class="top"><label for="${id}">${esc(spec.label)}</label><output id="${id}-out" for="${id}"></output></div>
      <input type="range" id="${id}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${value}">` +
      (spec.hint ? `<div class="hint">${esc(spec.hint)}</div>` : '');
    const input = w.querySelector('input'), out = w.querySelector('output');
    const paint = (v, linked) => {
      const lo = (Math.min(0, v) - spec.min) / (spec.max - spec.min) * 100, hi = (Math.max(0, v) - spec.min) / (spec.max - spec.min) * 100;
      const zero = (0 - spec.min) / (spec.max - spec.min) * 100;
      input.style.setProperty('--lo', (v < 0 ? lo : zero) + '%');
      input.style.setProperty('--hi', (v < 0 ? zero : hi) + '%');
      input.style.setProperty('--fill', 'var(--ink-2)');
      out.classList.toggle('linked', !!linked);
    };
    input.addEventListener('input', () => { onInput(spec.key, Number(input.value)); });
    return { node: w, input, out, paint, spec };
  }

  // A rebuilt simulator (after a company is added) takes over the page's fixed controls: they are bound by
  // property, observers from the previous instance are disconnected, and one window listener serves whichever
  // instance is live.
  let live = null, upBound = false;
  const observers = [];

  function Simulator(opts) {
    const data = opts.data, host = opts.host;
    let scn = Object.assign({}, M.DEFAULT_SCENARIO, opts.initial || {});
    let selected = opts.selected || data.stocks[0].id;
    let result = null, presetKey = opts.presetKey || null;
    const ctlNodes = {};
    observers.splice(0).forEach(o => o.disconnect());

    // ---------- pendant ----------
    const pend = host.querySelector('.pendant');
    const presetBox = pend.querySelector('.presets');
    data.presets.forEach(p => {
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', 'data-key': p.key }, esc(p.label));
      b.addEventListener('click', () => applyPreset(p.key));
      presetBox.appendChild(b);
    });
    // rates
    const ratesBox = pend.querySelector('[data-group="rates"]');
    const dy = rangeControl({ key: 'dy10', label: '10-year Treasury yield', min: -200, max: 300, step: 5, unit: 'bp' }, scn.dy10, setVal);
    dy.input.classList.add('accent');
    ratesBox.appendChild(dy.node); ctlNodes.dy10 = dy;
    const causeSeg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Why rates move' });
    Object.entries(M.CAUSES).forEach(([k, c]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(scn.cause === k), 'data-cause': k }, esc(c.label));
      b.addEventListener('click', () => { scn.cause = k; presetKey = null; sync(); recompute(); });
      causeSeg.appendChild(b);
    });
    const causeWrap = el('div', { class: 'range' }, '<div class="top"><label>Why rates move</label><output class="cause-split"></output></div>');
    causeWrap.appendChild(causeSeg);
    ratesBox.appendChild(causeWrap);
    // macro and micro
    const macroBox = pend.querySelector('[data-group="macro"]'), microBox = pend.querySelector('[data-group="micro"]');
    CONTROLS.forEach(spec0 => {
      const spec = spec0.key === 'cycle' && data.cycleNow ? Object.assign({}, spec0, { hint: `Philadelphia Fed activity index, ${data.cycleNow.value} in ${data.cycleNow.month}` }) : spec0;
      const c = rangeControl(spec, scn[spec.key], setVal);
      (spec.group === 'macro' ? macroBox : microBox).appendChild(c.node); ctlNodes[spec.key] = c;
    });
    Object.entries(SEGS).forEach(([key, s]) => {
      const wrap = el('div', { class: 'range' }, `<div class="top"><label>${esc(s.label)}</label></div>`);
      const seg = el('div', { class: 'seg', role: 'group', 'aria-label': s.label, style: `grid-template-columns: repeat(${s.opts.length}, minmax(0, 1fr))` });
      s.opts.forEach(([v, lab]) => {
        const b = el('button', { type: 'button', 'aria-pressed': 'false', 'data-v': v }, esc(lab));
        b.addEventListener('click', () => { scn[key] = key === 'magnets' ? Number(v) : v; presetKey = null; sync(); recompute(); });
        seg.appendChild(b);
      });
      wrap.appendChild(seg);
      microBox.appendChild(wrap);
      ctlNodes[key] = { seg };
    });
    // lens and settings
    const lensSeg = pend.querySelector('.lens-seg');
    lensSeg.querySelectorAll('button').forEach(b => { b.onclick = () => { scn.lens = b.dataset.lens; sync(); recompute(); }; });
    const blend = pend.querySelector('#ctl-blend'), blendOut = pend.querySelector('#ctl-blend-out');
    blend.oninput = () => { scn.blend = Number(blend.value); sync(); recompute(); };
    const linked = pend.querySelector('#ctl-linked');
    linked.onchange = () => { scn.linked = linked.checked; sync(); recompute(); };
    pend.querySelector('.reset').onclick = () => applyPreset('rates-up');
    // a soft fade at the bottom of the pendant while more controls sit below the fold
    let fade = pend.querySelector('.pend-fade');
    if (!fade) { fade = el('div', { class: 'pend-fade', 'aria-hidden': 'true' }); pend.appendChild(fade); }
    const fadeCheck = () => pend.classList.toggle('more-below', pend.scrollTop + pend.clientHeight < pend.scrollHeight - 6);
    pend.onscroll = fadeCheck;
    const fro = new ResizeObserver(fadeCheck); fro.observe(pend); observers.push(fro);
    pend.querySelectorAll('details').forEach(d => { d.ontoggle = fadeCheck; });

    function setVal(key, v) { scn[key] = v; presetKey = null; sync(true); recompute(); }
    function applyPreset(key) {
      const p = data.presets.find(x => x.key === key); if (!p) return;
      const keep = { lens: scn.lens, blend: scn.blend, linked: scn.linked };
      scn = Object.assign({}, M.DEFAULT_SCENARIO, keep, p.scn);
      presetKey = key;
      sync(); recompute();
      try { localStorage.setItem('torque:preset', key); } catch (e) { /* storage unavailable */ }
    }

    function sync(fromSlider) {
      presetBox.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.key === presetKey)));
      causeSeg.querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.cause === scn.cause)); const cz = M.CAUSES[b.dataset.cause]; b.textContent = scn.dy10 < 0 ? cz.down : cz.label; });
      Object.entries(SEGS).forEach(([key]) => ctlNodes[key].seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(String(scn[key]) === b.dataset.v))));
      lensSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lens === scn.lens)));
      blend.value = scn.blend; linked.checked = !!scn.linked;
      const bw = Math.round(scn.blend * 100);
      blendOut.textContent = bw === 0 ? 'History only' : bw === 100 ? 'Fundamentals only' : `${100 - bw}% history, ${bw}% fundamentals`;
      if (!fromSlider) Object.values(ctlNodes).forEach(c => { if (c.input) c.input.value = scn[c.spec ? c.spec.key : 'dy10']; });
    }

    // ---------- results ----------
    const res = host.querySelector('.results');
    const big = res.querySelector('.headline .big'), sub = res.querySelector('.headline .sub'), cmp = res.querySelector('.headline .cmp');
    const bigSpring = new C.Spring(0, 140, 1);
    const bigAnim = dt => { const m = bigSpring.step(dt); big.textContent = fmt.pct(bigSpring.x); big.className = 'big num ' + (bigSpring.x < -0.0005 ? 'loss' : bigSpring.x > 0.0005 ? 'gain' : ''); return m; };
    const forest = res.querySelector('.forest');
    const detail = res.querySelector('.detail');
    const ladderHost = res.querySelector('.ladder-wrap'), ladderCard = res.querySelector('.ladder-card');
    // chart widths come from a ResizeObserver, so redrawing the detail charts never forces a synchronous layout
    const sizes = { wf: 0, qp: 0 };
    let sizeTimer = null;
    const dro = new ResizeObserver(ents => {
      ents.forEach(en => { const w = Math.round(en.contentRect.width); if (en.target.classList.contains('waterfall')) sizes.wf = w; else sizes.qp = w; });
      clearTimeout(sizeTimer); sizeTimer = setTimeout(() => renderDetail(), 60);
    });
    dro.observe(detail.querySelector('.waterfall')); dro.observe(detail.querySelector('.qpath')); observers.push(dro);

    // forest plot (built once, animated with springs)
    const ROWH = 30, PADT = 34;
    let NAMEW = 188, VALW = 64;
    const fsvg = svg('svg', { role: 'img', 'aria-label': 'Modeled price change by company' }, forest);
    const gAxis = svg('g', {}, fsvg), gRows = svg('g', {}, fsvg);
    const rows = {};
    const dLo = new C.Spring(-0.3, 120, 1), dHi = new C.Spring(0.1, 120, 1);
    data.stocks.forEach((st, i) => {
      const g = svg('g', { class: 'row', tabindex: '0', role: 'button', 'aria-label': st.name }, gRows);
      const bg = svg('rect', { class: 'rowbg', x: 0, y: -ROWH / 2, height: ROWH, rx: 6, fill: 'transparent' }, g);
      const name = svg('text', { x: 10, y: 4, 'font-size': 13.5, fill: 'var(--ink)' }, g); name.textContent = st.short || st.name;
      const tk = svg('text', { x: 10, y: 4, 'font-size': 11.5, fill: 'var(--ink-3)' }, g); tk.textContent = st.ticker;
      const band = svg('line', { y1: 0, y2: 0, 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.22 }, g);
      const hDot = svg('circle', { r: 4, cy: 0, fill: 'var(--panel)', stroke: 'var(--ink-2)', 'stroke-width': 1.5 }, g);
      const fDot = svg('path', { d: 'M0 -5 L5 0 L0 5 L-5 0 Z', fill: 'var(--panel)', stroke: 'var(--ink-2)', 'stroke-width': 1.5 }, g);
      const dot = svg('circle', { r: 6, cy: 0, stroke: 'var(--panel)', 'stroke-width': 2 }, g);
      const val = svg('text', { y: 4.5, 'font-size': 13, 'text-anchor': 'end', fill: 'var(--ink)', 'font-weight': 600, class: 'num' }, g);
      g.addEventListener('click', () => select(st.id));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(st.id); } });
      g.addEventListener('mousemove', e => {
        const r = result && result.stocks[st.id]; if (!r) return;
        const range = result.bands === 'none' ? '' : ` (80% range of model estimates ${fmt.pct(r.blend.lo, 0)} to ${fmt.pct(r.blend.hi, 0)})`;
        C.tip(`<b>${esc(st.name)}</b><br>Blend ${fmt.pct(r.blend.mean)}${range}<br>History ${r.hist ? fmt.pct(r.hist.mean) : 'n/a'} · Fundamentals ${r.fund ? fmt.pct(r.fund.mean) : 'n/a'}`, e.clientX, e.clientY);
      });
      g.addEventListener('mouseleave', () => C.tip(null));
      rows[st.id] = { g, bg, name, tk, band, hDot, fDot, dot, val, nameW: null, y: new C.Spring(PADT + i * ROWH + ROWH / 2, 160, 1), x: new C.Spring(0, 160, 1), lo: new C.Spring(0, 160, 1), hi: new C.Spring(0, 160, 1), h: new C.Spring(0, 160, 1), f: new C.Spring(0, 160, 1) };
    });
    let W = 760;
    const H = PADT + data.stocks.length * ROWH + 12;
    function layoutForest() {
      W = Math.max(280, forest.clientWidth || 760);
      const narrow = W < 520;
      NAMEW = narrow ? 112 : 188; VALW = narrow ? 54 : 64;
      Object.values(rows).forEach(r => {
        r.tk.style.display = narrow ? 'none' : ''; r.name.setAttribute('font-size', narrow ? 12.5 : 13.5);
        if (!narrow) {
          if (r.nameW == null && r.name.getComputedTextLength) r.nameW = r.name.getComputedTextLength() || null;
          r.tk.setAttribute('x', (10 + (r.nameW || 80) + 6).toFixed(1));
        }
        r.bg.setAttribute('width', W); r.val.setAttribute('x', W - 6);
      });
      fsvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      fsvg.setAttribute('height', H);
    }
    const ro = new ResizeObserver(() => { layoutForest(); drawAxis(); kickForest(); });
    ro.observe(forest); observers.push(ro);
    layoutForest();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Object.values(rows).forEach(r => { r.nameW = null; }); layoutForest(); kickForest(); });
    function xScale(v) { const lo = dLo.x, hi = dHi.x, x0 = NAMEW, x1 = W - VALW - 8; return x0 + (v - lo) / (hi - lo) * (x1 - x0); }
    function drawAxis() {
      gAxis.innerHTML = '';
      const lo = dLo.t, hi = dHi.t, tk = C.ticks(lo, hi, W < 520 ? 3 : 6);
      tk.forEach(v => {
        const x = NAMEW + (v - lo) / (hi - lo) * (W - VALW - 8 - NAMEW);
        svg('line', { x1: x, x2: x, y1: PADT - 10, y2: H - 6, stroke: v === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': v === 0 ? 1.25 : 1 }, gAxis);
        const t = svg('text', { x, y: PADT - 16, 'font-size': 11.5, 'text-anchor': 'middle', fill: 'var(--ink-3)', class: 'num' }, gAxis);
        t.textContent = fmt.pct(v, 0);
      });
    }
    let forestAnimating = false;
    function kickForest() {
      if (forestAnimating) return; forestAnimating = true;
      C.animate(function forestAnim(dt) {
        let moving = dLo.step(dt); if (dHi.step(dt)) moving = true;
        Object.values(rows).forEach(r => {
          ['y', 'x', 'lo', 'hi', 'h', 'f'].forEach(k => { if (r[k].step(dt)) moving = true; });
          r.g.setAttribute('transform', `translate(0, ${r.y.x.toFixed(2)})`);
          r.band.setAttribute('x1', xScale(r.lo.x).toFixed(2)); r.band.setAttribute('x2', xScale(r.hi.x).toFixed(2));
          r.hDot.setAttribute('cx', xScale(r.h.x).toFixed(2));
          r.fDot.setAttribute('transform', `translate(${xScale(r.f.x).toFixed(2)},0)`);
          r.dot.setAttribute('cx', xScale(r.x.x).toFixed(2));
        });
        if (!moving) forestAnimating = false;
        return moving;
      });
    }

    // phone dock: while the controls fill the screen, keep the answer in view
    let dock = document.querySelector('.sim-dock');
    if (!dock) {
      dock = el('div', { class: 'sim-dock' }, '<div class="dk-txt"><span class="dk-l">Basket</span> <b class="dk-v num">–</b><span class="dk-s"></span></div><button type="button" class="chip dk-go">See results</button>');
      document.body.appendChild(dock);
    }
    dock.querySelector('.dk-go').onclick = () => { const y = res.getBoundingClientRect().top + window.scrollY - 64; window.scrollTo({ top: y, behavior: C.reduceMotion ? 'auto' : 'smooth' }); };
    const dockState = { pend: false, res: false };
    const dockIO = new IntersectionObserver(ents => {
      ents.forEach(en => { if (en.target === pend) dockState.pend = en.isIntersecting; else dockState.res = en.isIntersecting; });
      dock.classList.toggle('on', dockState.pend && !dockState.res && matchMedia('(max-width: 980px)').matches);
    }, { threshold: 0, rootMargin: '0px 0px -30% 0px' });
    dockIO.observe(pend); dockIO.observe(res.querySelector('.headline-card')); observers.push(dockIO);
    if (matchMedia('(max-width: 980px)').matches) pend.querySelectorAll('details.more[open]').forEach(d => d.removeAttribute('open'));

    function select(id) {
      selected = id;
      Object.entries(rows).forEach(([k, r]) => r.g.classList.toggle('sel', k === id));
      renderDetail();
      renderLadderDebounced();
      updateDock();
      if (opts.onSelect) opts.onSelect(id);
    }

    // ---------- recompute ----------
    let dragging = false, settleTimer = null, frameQueued = false, bandTimer = null, lastDetail = 0;
    pend.onpointerdown = e => { if (e.target.matches('input[type=range]')) dragging = true; };
    const release = () => { if (dragging) { dragging = false; clearTimeout(settleTimer); settleTimer = setTimeout(() => recompute(), 30); } };
    live = { release };
    if (!upBound) { window.addEventListener('pointerup', () => { if (live) live.release(); }); window.addEventListener('pointercancel', () => { if (live) live.release(); }); upBound = true; }
    function recompute() {
      if (dragging && !frameQueued) { frameQueued = true; requestAnimationFrame(() => { frameQueued = false; doRecompute(false); }); return; }
      if (dragging) return;
      doRecompute(true);
    }
    // While nothing is known about the new ranges, each one keeps its last width around the moving centre.
    function carryBands(prev, cur) {
      const shift = (p, c) => {
        if (p && isFinite(p.lo) && isFinite(p.hi)) { c.lo = c.mean - (p.mean - p.lo); c.hi = c.mean + (p.hi - p.mean); return true; }
        c.lo = c.hi = c.mean; return false;
      };
      let any = false;
      Object.entries(cur.stocks).forEach(([id, r]) => { const p = prev && prev.stocks[id]; if (shift(p && p.blend, r.blend)) any = true; });
      shift(prev && prev.basket, cur.basket);
      cur.bands = prev && prev.bands !== 'none' && any ? 'carried' : 'none';
    }
    function applyBands(b) {
      result.basket.lo = b.basket[0]; result.basket.hi = b.basket[1];
      Object.entries(b.stocks).forEach(([id, x]) => {
        const r = result.stocks[id]; if (!r) return;
        r.blend.lo = x.b[0]; r.blend.hi = x.b[1];
        if (r.hist && x.h) { r.hist.lo = x.h[0]; r.hist.hi = x.h[1]; }
        if (r.fund && x.f) { r.fund.lo = x.f[0]; r.fund.hi = x.f[1]; }
      });
      result.bands = 'mc';
      renderResult();
    }
    function doRecompute(full) {
      const prev = result;
      result = M.run(scn, data, { draws: 0, seed: SEED });
      carryBands(prev, result);
      renderResult();
      const now = performance.now();
      if (full || now - lastDetail > 120) { renderDetail(); lastDetail = now; }
      renderLadderDebounced();
      if (opts.onResult) opts.onResult(result, scn);
      afterRun();
      if (full) {
        clearTimeout(bandTimer);
        const mine = result, s0 = Object.assign({}, scn);
        bandTimer = setTimeout(() => MC.request(s0, data, b => { if (result === mine) applyBands(b); }), 30);
      }
    }
    function renderResult() {
      // headline
      const b = result.basket;
      bigSpring.set(b.mean);
      C.animate(bigAnim);
      const bd = Math.max(Math.abs(b.lo), Math.abs(b.hi)) < 0.05 ? 1 : 0;
      const hasRange = result.bands !== 'none' && isFinite(b.lo) && isFinite(b.hi) && b.hi - b.lo > 0.0005;
      sub.innerHTML = describe(result.R) + (hasRange ? ` The 80% range of model estimates for the basket is ${fmt.pct(b.lo, bd)} to ${fmt.pct(b.hi, bd)}.` : '');
      cmp.innerHTML = `<span>History lens <b>${fmt.pct(b.hist)}</b></span><span>Fundamentals lens <b>${fmt.pct(b.fund)}</b></span>` + (result.spx != null ? `<span>S&amp;P 500, measured factors only <b>${fmt.pct(result.spx)}</b></span>` : '');
      // forest rows: sort by blended change, most exposed first
      const order = data.stocks.map(s => s.id).sort((a, c) => result.stocks[a].blend.mean - result.stocks[c].blend.mean);
      let mn = -0.02, mx = 0.02;
      order.forEach(id => { const r = result.stocks[id]; [r.blend.lo, r.blend.hi, r.hist ? r.hist.mean : 0, r.fund ? r.fund.mean : 0].forEach(v => { if (isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }); });
      const span = mx - mn, step = C.niceStep(span, 5);
      dLo.set(Math.floor((mn - span * 0.04) / step) * step); dHi.set(Math.ceil((mx + span * 0.04) / step) * step);
      drawAxis();
      order.forEach((id, i) => {
        const r = result.stocks[id], row = rows[id];
        if (!row) return;
        row.y.set(PADT + i * ROWH + ROWH / 2);
        row.x.set(r.blend.mean); row.lo.set(r.blend.lo); row.hi.set(r.blend.hi);
        row.h.set(r.hist ? r.hist.mean : r.blend.mean); row.f.set(r.fund ? r.fund.mean : r.blend.mean);
        const col = r.blend.mean < 0 ? 'var(--loss)' : 'var(--gain)';
        row.dot.setAttribute('fill', col); row.band.setAttribute('stroke', col);
        row.val.textContent = fmt.pct(r.blend.mean);
        row.hDot.style.display = r.hist ? '' : 'none'; row.fDot.style.display = r.fund ? '' : 'none';
      });
      kickForest();
      updateDock();
    }
    function updateDock() {
      if (!result) return;
      const b = result.basket, sr = result.stocks[selected], stSel = data.stocks.find(x => x.id === selected);
      const dv = dock.querySelector('.dk-v');
      dv.textContent = fmt.pct(b.mean); dv.className = 'dk-v num ' + (b.mean < -0.0005 ? 'loss' : b.mean > 0.0005 ? 'gain' : '');
      dock.querySelector('.dk-s').textContent = sr && stSel ? `${stSel.short || stSel.name} ${fmt.pct(sr.blend.mean)}` : '';
    }

    const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
    function describe(R) {
      const c = R.ctl, out = [];
      const floor = { '%': 0.5, 'bp': 3, ' pts': 1, 'pp': 0.05 };
      const items = { user: [], cause: [], linked: [] };
      const say = (k, label, unit = '%', d = 0) => {
        const v = c[k], from = R.linkedFill[k] ? 'linked' : R.overlayed[k] ? 'cause' : 'user';
        if (Math.abs(v) < (from === 'user' ? 1e-6 : floor[unit])) return;
        items[from].push(`${label} ${fmt.signed(v, d, unit)}`);
      };
      say('usd', 'the dollar'); say('jpy', 'yen per dollar'); say('oil', 'oil'); say('copper', 'copper'); say('cycle', 'factory activity', ' pts');
      say('credit', 'credit spreads', 'bp'); say('mood', 'the broad market'); say('semis', 'the AI chip cycle'); say('china', 'China');
      say('wages', 'wage growth', 'pp', 1); say('tariff', 'tariffs', 'pp');
      if (c.dy10) {
        const up = c.dy10 > 0;
        out.push(`The 10-year yield ${up ? 'rises' : 'falls'} ${Math.abs(c.dy10)}bp on ${up ? R.cause.phraseUp : R.cause.phraseDown} (real yield ${fmt.signed(R.rr * 100, 0, 'bp')}, breakeven ${fmt.signed(R.be * 100, 0, 'bp')}).`);
        if (items.cause.length || items.linked.length) {
          const a = items.cause.length ? `That cause brings ${list(items.cause)}` : '';
          const b = items.linked.length ? `${a ? ', and ' : ''}${a ? 'history' : 'History'} adds ${list(items.linked)}` : '';
          out.push(a + b + '.');
        }
      } else if (items.linked.length) out.push(`History adds ${list(items.linked)}.`);
      const micro = [];
      if (c.timeline) micro.push(`the humanoid and autonomy timeline ${Math.abs(c.timeline)} ${Math.abs(c.timeline) === 1 ? 'year' : 'years'} ${c.timeline < 0 ? 'sooner' : 'later'}`);
      if (c.pricewar > 0.04) micro.push(`${CONTROLS.find(x => x.key === 'pricewar').words(c.pricewar).toLowerCase()} Chinese price competition`);
      if (c.magnets) micro.push(c.magnets === 2 ? 'a rare-earth magnet embargo' : 'tight magnet supply');
      if (c.funding) { const fw = CONTROLS.find(x => x.key === 'funding').words(c.funding); micro.push(fw === 'Shut' ? 'no new funding for pre-profit companies' : `${fw.toLowerCase()} funding for pre-profit companies`); }
      if (c.incident !== 'none') micro.push(c.incident === 'av' ? 'a serious robotaxi or truck incident' : 'a serious humanoid incident');
      const rest = items.user.concat(micro);
      if (rest.length) out.push(`${c.dy10 || items.linked.length ? 'You also set' : 'You set'} ${list(rest)}.`);
      if (!out.length) return 'No shock applied. Move a control or pick a preset.';
      return out.join(' ');
    }

    // ---------- detail panel for the selected company ----------
    function renderDetail() {
      if (!result) return;
      const st = data.stocks.find(s => s.id === selected), r = result.stocks[selected];
      if (!st || !r) return;
      const f = r.fund, F = f && f.fin, cur = st.currency, c = result.R.ctl;
      const head = detail.querySelector('.d-head');
      head.innerHTML = `<div><h3>${esc(st.name)} <span class="faint">${esc(st.ticker)}</span></h3><p class="muted">${esc(st.role || '')}</p></div>
        <div class="d-big num ${r.blend.mean < 0 ? 'loss' : 'gain'}">${fmt.pct(r.blend.mean)}</div>`;
      // bridge table
      const tb = detail.querySelector('.bridge tbody');
      const rowsHtml = [];
      if (F) {
        // [label, base, scenario, change text, change value, sign of its effect on value, row class]
        rowsHtml.push(['Revenue, next 12 months', fmt.bn(F.rev0), fmt.bn(F.rev1), fmt.pct(F.rev1 / F.rev0 - 1), F.rev1 / F.rev0 - 1, 1]);
        if (Math.abs(F.m0) > 1) rowsHtml.push(['EBIT margin', 'n/m', 'n/m', '–', 0, 1]);
        else rowsHtml.push(['EBIT margin', fmt.pct(F.m0, 1, false), fmt.pct(F.m1, 1, false), fmt.signed((F.m1 - F.m0) * 100, 1, 'pp'), F.m1 - F.m0, 1]);
        rowsHtml.push([`EPS, next 12 months (${cur})`, fmt.money(F.eps0, cur), fmt.money(F.eps1, cur), F.eps0 > 0 ? fmt.pct(F.eps1 / F.eps0 - 1) : fmt.money(F.eps1 - F.eps0, cur).replace(/^(?!−)/, '+'), F.eps1 - F.eps0, 1]);
        rowsHtml.push(['Discount rate', F.k0.toFixed(2) + '%', F.k1.toFixed(2) + '%', fmt.signed((F.k1 - F.k0) * 100, 0, 'bp'), F.k1 - F.k0, -1]);
        rowsHtml.push(['from the 10-year yield', F.rf0.toFixed(2) + '%', F.rf1.toFixed(2) + '%', fmt.signed((F.rf1 - F.rf0) * 100, 0, 'bp'), F.rf1 - F.rf0, -1, 'sub']);
        rowsHtml.push(['from the risk premium', F.prem0.toFixed(2) + '%', F.prem1.toFixed(2) + '%', fmt.signed((F.prem1 - F.prem0) * 100, 0, 'bp'), F.prem1 - F.prem0, -1, 'sub']);
        if (Math.abs(F.g1 - F.g0) > 0.00005) rowsHtml.push(['Long-run nominal growth', F.g0.toFixed(2) + '%', F.g1.toFixed(2) + '%', fmt.signed((F.g1 - F.g0) * 100, 0, 'bp'), F.g1 - F.g0, 1]);
        rowsHtml.push([`Fair value per share (${cur})`, fmt.money(F.value0, cur), fmt.money(F.value1, cur), fmt.pct(F.value1 / F.value0 - 1), F.value1 / F.value0 - 1, 1]);
      }
      const tone = (v, dir) => { const e = v * dir; return Math.abs(v) < 1e-6 ? '' : e < 0 ? 'loss' : 'gain'; };
      tb.innerHTML = rowsHtml.map(rw => `<tr${rw[6] ? ` class="${rw[6]}"` : ''}><td>${rw[0]}</td><td>${rw[1]}</td><td>${rw[2]}</td><td class="${tone(rw[4], rw[5])}">${rw[3]}</td></tr>`).join('');
      const note = detail.querySelector('.bridge-note');
      if (note) {
        let t = '';
        if (F && cur === 'JPY') t = `Per-share rows are in yen at the scenario exchange rate (yen per dollar ${fmt.signed(c.jpy, 1, '%')}). Returns elsewhere on the page are in dollars.`;
        else if (F && cur === 'CNY') t = `Per-share rows are in yuan at the scenario exchange rate (yuan per dollar ${fmt.signed(c.usd * 0.5, 1, '%')}, half the dollar index move). Returns elsewhere on the page are in dollars.`;
        else if (F && cur === 'HKD') t = 'Per-share rows are in Hong Kong dollars, which are pegged to the US dollar.';
        note.textContent = t; note.hidden = !t;
      }
      drawWaterfall(detail.querySelector('.waterfall'), r, st);
      drawPath(detail.querySelector('.qpath'), r, st);
      detail.querySelector('.why').innerHTML = explain(st, r);
    }

    function drawWaterfall(host, r, st) {
      host.innerHTML = '';
      const mode = host.dataset.mode || 'fund';
      let steps = [];
      if (mode === 'fund' && r.fund) {
        steps = Object.entries(r.fund.channels).map(([k, v]) => ({ k, label: CHANNEL_LABEL[k], v })).filter(s => Math.abs(s.v) > 0.0005);
      } else if (r.hist) {
        steps = Object.entries(r.hist.parts || {}).map(([k, v]) => ({ k, label: FACTOR_LABEL[k] || k, v })).filter(s => Math.abs(s.v) > 0.0005);
      }
      steps.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
      const total = mode === 'fund' && r.fund ? r.fund.mean : r.hist ? r.hist.mean : 0;
      const Wd = Math.max(300, sizes.wf || 380), rowH = 26, top = 8, labelW = 128;
      const Hd = top + (steps.length + 1) * rowH + 6;
      const s = svg('svg', { viewBox: `0 0 ${Wd} ${Hd}`, width: '100%', height: Hd, role: 'img', 'aria-label': 'Price change by channel' }, host);
      let cum = 0, lo = 0, hi = 0;
      steps.forEach(x => { cum += x.v; lo = Math.min(lo, cum); hi = Math.max(hi, cum); });
      lo = Math.min(lo, total, 0); hi = Math.max(hi, total, 0);
      const pad = (hi - lo) * 0.12 + 0.005; lo -= pad; hi += pad;
      const X = v => labelW + (v - lo) / (hi - lo) * (Wd - labelW - 56);
      svg('line', { x1: X(0), x2: X(0), y1: top - 4, y2: Hd - 2, stroke: 'var(--axis)', 'stroke-width': 1.25 }, s);
      cum = 0;
      steps.forEach((x, i) => {
        const y = top + i * rowH;
        const a = X(cum), b = X(cum + x.v);
        svg('rect', { x: Math.min(a, b), y: y + 6, width: Math.max(1.5, Math.abs(b - a)), height: rowH - 12, rx: 3, fill: x.v < 0 ? 'var(--loss)' : 'var(--gain)', opacity: 0.85 }, s);
        const t = svg('text', { x: 0, y: y + rowH / 2 + 4, 'font-size': 12.5, fill: 'var(--ink)' }, s); t.textContent = x.label;
        const vt = svg('text', { x: Math.max(a, b) + 6, y: y + rowH / 2 + 4, 'font-size': 12, fill: 'var(--ink-2)', class: 'num' }, s); vt.textContent = fmt.pct(x.v);
        cum += x.v;
      });
      const y = top + steps.length * rowH;
      svg('rect', { x: Math.min(X(0), X(total)), y: y + 5, width: Math.max(1.5, Math.abs(X(total) - X(0))), height: rowH - 10, rx: 3, fill: 'var(--ink-2)' }, s);
      const t = svg('text', { x: 0, y: y + rowH / 2 + 4, 'font-size': 12.5, 'font-weight': 650, fill: 'var(--ink)' }, s); t.textContent = mode === 'fund' ? 'Fundamentals lens' : 'History lens';
      const vt = svg('text', { x: Math.max(X(0), X(total)) + 6, y: y + rowH / 2 + 4, 'font-size': 12, 'font-weight': 650, fill: 'var(--ink)', class: 'num' }, s); vt.textContent = fmt.pct(total);
      const note = host.parentElement && host.parentElement.querySelector('.wf-note');
      if (note) {
        const hasU = mode !== 'fund' && steps.some(x => x.k === 'FUNDONLY');
        note.textContent = mode === 'fund' ? 'Blue raises the price, red lowers it. Channels interact, so they are scaled to add up.'
          : 'Each measured factor times its sensitivity' + (hasU ? ', plus the cash-flow model’s estimate for forces history cannot measure' : '') + '. Blue raises the price, red lowers it. Factors compound, so they are scaled to add up.';
      }
    }

    function drawPath(host, r, st) {
      host.innerHTML = '';
      if (!r.fund) { host.innerHTML = '<p class="hint">No fundamentals profile for this company yet.</p>'; return; }
      const F = r.fund.fin, f = st.fund;
      // Eight quarters. The first four add up to next-12-month revenue on both lines, so the path matches the table:
      // demand phases in and fades, currency translation lands at once, and price competition stays.
      const qg = Math.pow(1 + f.g1, 0.25) - 1;
      const w = [0, 1, 2, 3, 4, 5, 6, 7].map(q => Math.pow(1 + qg, q));
      const s4 = w[0] + w[1] + w[2] + w[3];
      const baseQ = w.map(x => F.rev0 * x / s4);
      const PH = [0.55, 0.9, 1.2, 1.35, 1.1, 0.8, 0.6, 0.5];
      const k1 = s4 / (w[0] * PH[0] + w[1] * PH[1] + w[2] * PH[2] + w[3] * PH[3]);
      const fx = F.dFxRev || 0, pw = F.dPwRev || 0, dem = F.rev1 / F.rev0 - 1 - fx - pw;
      const scnQ = baseQ.map((b, q) => b * (1 + dem * PH[q] * k1 + fx * (q < 4 ? 1 : 0.75) + pw));
      const Wd = Math.max(300, sizes.qp || 380), Hd = 190, l = 46, rr = 70, t = 16, bm = 28;
      const all = baseQ.concat(scnQ);
      let lo = Math.min(...all), hi = Math.max(...all);
      const pad = (hi - lo) * 0.25 + hi * 0.02; lo -= pad; hi += pad;
      const X = i => l + i * (Wd - l - rr) / 7, Y = v => t + (hi - v) / (hi - lo) * (Hd - t - bm);
      const s = svg('svg', { viewBox: `0 0 ${Wd} ${Hd}`, width: '100%', height: Hd, role: 'img', 'aria-label': 'Quarterly revenue, base and scenario' }, host);
      C.ticks(lo, hi, 4).forEach(v => {
        svg('line', { x1: l, x2: Wd - rr, y1: Y(v), y2: Y(v), stroke: 'var(--grid)' }, s);
        const tx = svg('text', { x: l - 6, y: Y(v) + 4, 'font-size': 11, 'text-anchor': 'end', fill: 'var(--ink-3)', class: 'num' }, s); tx.textContent = fmt.bn(v);
      });
      for (let q = 0; q < 8; q++) { const tx = svg('text', { x: X(q), y: Hd - 8, 'font-size': 11, 'text-anchor': 'middle', fill: 'var(--ink-3)' }, s); tx.textContent = 'Q' + (q + 1); }
      const line = (arr, color, wd) => svg('path', { d: arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' '), fill: 'none', stroke: color, 'stroke-width': wd, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, s);
      const down = scnQ[0] + scnQ[1] + scnQ[2] + scnQ[3] < F.rev0;
      line(baseQ, 'var(--ink-3)', 2);
      line(scnQ, down ? 'var(--loss)' : 'var(--gain)', 2.5);
      let yb = Y(baseQ[7]) + 4, ys = Y(scnQ[7]) + 4;
      if (Math.abs(yb - ys) < 14) { const mid = (yb + ys) / 2, up = scnQ[7] >= baseQ[7]; ys = mid + (up ? -7 : 7); yb = mid + (up ? 7 : -7); }
      const lb = svg('text', { x: X(7) + 8, y: yb, 'font-size': 11.5, fill: 'var(--ink-2)' }, s); lb.textContent = 'Base';
      const ls = svg('text', { x: X(7) + 8, y: ys, 'font-size': 11.5, fill: 'var(--ink)', 'font-weight': 600 }, s); ls.textContent = 'Scenario';
      [[baseQ, 'var(--ink-3)'], [scnQ, down ? 'var(--loss)' : 'var(--gain)']].forEach(([arr, col]) => svg('circle', { cx: X(7), cy: Y(arr[7]), r: 3.5, fill: col, stroke: 'var(--panel)', 'stroke-width': 1.5 }, s));
    }

    function explain(st, r) {
      const out = [];
      const blend = r.blend.mean, c = result.R.ctl;
      out.push(`${esc(st.short || st.name)} ${blend < 0 ? 'falls' : 'rises'} ${fmt.pct(Math.abs(blend), 1, false)} in the blend.`);
      if (r.fund) {
        const ch = Object.entries(r.fund.channels).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).filter(([, v]) => Math.abs(v) > 0.002).slice(0, 2);
        const f = st.fund, fin = r.fund.fin;
        const late = Math.round((f._lateShare || 0.6) * 100);
        // subject and verb agree: "wider credit spreads raise", "a weaker market raises"
        const riskWhat = v => {
          const bits = [];
          if (Math.abs(c.credit) > 1) bits.push(c.credit > 0 ? 'wider credit spreads' : 'narrower credit spreads');
          if (Math.abs(c.mood) > 0.2) bits.push(c.mood < 0 ? 'a weaker market' : 'a firmer market');
          const plural = bits.length > 1 || (bits.length === 1 && bits[0].endsWith('spreads'));
          const verb = v < 0 ? (plural ? 'raise' : 'raises') : (plural ? 'lower' : 'lowers');
          return `${bits.length ? bits.join(' and ') : 'the scenario'} ${verb}`;
        };
        const costWhat = v => {
          const parts = [];
          if (fin.costShock > 0.0005) parts.push(`input costs it cannot pass on take ${fmt.pct(fin.costShock, 1, false)} of revenue off its margin`);
          else if (fin.costShock < -0.0005) parts.push(`cheaper inputs add ${fmt.pct(-fin.costShock, 1, false)} of revenue to its margin`);
          if (fin.dPwRev < -0.0005) parts.push(`Chinese price competition takes ${fmt.pct(-fin.dPwRev, 1, false)} off revenue`);
          else if (fin.dPwRev > 0.0005) parts.push(`it wins ${fmt.pct(fin.dPwRev, 1, false)} of extra revenue from weaker rivals`);
          return (parts.length ? parts.join(', and ') : 'costs and pricing shift its margin') + ` (${fmt.pct(v)})`;
        };
        const say = {
          rates: v => `${f._dcfOK ? `${late}% of its modeled value arrives after 2031` : 'it has no profits yet and its value sits far in the future'}, so ${v < 0 ? 'a higher risk-free rate cuts' : 'a lower risk-free rate lifts'} it by ${fmt.pct(Math.abs(v), 1, false)}`,
          risk: v => `${riskWhat(v)} the return investors demand, and its beta of ${f.beta.toFixed(2)} magnifies that (${fmt.pct(v)})`,
          demand: v => {
            const sup = Math.abs(fin.dSupply || 0) > 0.0005;
            return `${sup ? 'demand and lost magnet supply move' : 'demand moves'} revenue ${fmt.pct(fin.dDemand + (fin.dSupply || 0))}${sup ? '' : ' through its end markets'}, and operating leverage turns that into a ${fmt.pct(v)} change in value`;
          },
          costs: v => costWhat(v),
          fx: v => `currency translation moves its dollar revenue ${fmt.pct(fin.dFxRev)} and shifts its margin through costs in other currencies (${fmt.pct(v)})`,
          funding: v => `it still burns cash, so ${v < 0 ? 'tighter funding means more dilution' : 'easier funding means less dilution at better prices'} (${fmt.pct(v)})`,
          optionality: v => `about ${Math.round((f.opt ? f.opt.share : 0) * 100)}% of its ${f._dcfOK ? 'value' : 'future business'} rests on humanoid or autonomy businesses, ${c.incident !== 'none' ? 'and a serious incident removes part of that value' : 'which gain or lose value as the timeline moves'} (${fmt.pct(v)})`
        };
        const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
        const PHRASE = { rates: 'interest rates', risk: 'the risk premium', demand: 'demand', costs: 'costs and pricing', fx: 'currency', funding: 'funding', optionality: 'future businesses' };
        const PLURAL = { rates: true, costs: true, optionality: true };
        ch.forEach(([k, v], i) => {
          const body = say[k] ? say[k](v) : `${PHRASE[k]} contributes ${fmt.pct(v)}`;
          out.push(i === 0 ? `In the fundamentals lens the biggest channel is ${PHRASE[k]}: ${body}.` : `${cap(PHRASE[k])} ${PLURAL[k] ? 'come' : 'comes'} next: ${body}.`);
        });
      }
      if (r.hist && r.hist.partsLog.FUNDONLY != null) {
        const u = Math.expm1(r.hist.partsLog.FUNDONLY);
        if (Math.abs(u) >= 0.005) {
          const keys = r.hist.fundOnlyKeys || [];
          const names = Object.keys(UNMEASURED).filter(k => keys.indexOf(k) >= 0).map(k => UNMEASURED[k]);
          out.push(`For ${names.length ? list(names.slice(0, 3)) : 'the forces history cannot measure'}, both lenses use the cash-flow model’s estimate of ${fmt.pct(u)}.`);
        }
      }
      if (r.hist && r.fund) {
        out.push(gapText(r));
        if (r.hist.n === 0) out.push('It listed in August 2026, so its history lens is the peer average for Chinese growth names.');
        else if (r.hist.n < 48) out.push(`Its price history is short (${r.hist.n} ${scn.lens === 'weekly' ? 'weeks' : 'months'}), so its history lens leans on peers.`);
      }
      return out.join(' ');
    }
    // Where the two lenses part ways, compare like with like: measured factors against the channels that carry
    // the same forces, leaving out the cash-flow drivers both lenses share.
    function gapText(r) {
      const gap = r.fund.mean - r.hist.mean, pts = Math.round(Math.abs(gap) * 100);
      if (pts < 4) return `Both lenses agree within ${Math.max(1, pts)} ${pts <= 1 ? 'point' : 'points'}.`;
      const hp = r.hist.parts || {}, fc = r.fund.channels || {}, fo = r.hist.fundOnly || {};
      const H = ks => ks.reduce((a, k) => a + (hp[k] || 0), 0);
      const F = ks => ks.reduce((a, k) => a + (fc[k] || 0) - (fo[k] || 0), 0);
      const parts = [
        { key: 'rates', h: H(['RR', 'BE']), f: F(['rates']) },
        { key: 'risk', h: H(['CREDIT', 'MKT']), f: F(['risk', 'funding']) },
        { key: 'business', h: H(['OIL', 'CU', 'SEMI', 'CHINA', 'JPY', 'USD', 'CYC']), f: F(['demand', 'costs', 'fx', 'optionality']) }
      ];
      parts.sort((a, b) => Math.abs(b.f - b.h) - Math.abs(a.f - a.h));
      const p = parts[0], head = `The two lenses are ${pts} points apart: history ${fmt.pct(r.hist.mean)}, fundamentals ${fmt.pct(r.fund.mean)}.`;
      if (p.key === 'rates') {
        let why = `Most of the gap is interest rates: valuation math gives ${fmt.pct(p.f)}, while the stock's measured sensitivity to real yields and inflation gives ${fmt.pct(p.h)}.`;
        if (Math.abs(p.f) > Math.abs(p.h)) {
          why += scn.cause === 'growth'
            ? ' The fundamentals lens already credits the growth news with higher cash flows, so the rest of the gap is how little the stock has actually moved with yields.'
            : ' Stocks have usually moved less with yields than duration implies, partly because rate moves have tended to arrive with news about growth and inflation that also changed expected profits.';
        } else why += ' The stock has moved more with yields than its cash flows imply, which usually means investors have traded it as a rate theme.';
        return head + ' ' + why;
      }
      if (p.key === 'risk') return head + ` Most of the gap is the risk premium: the cash-flow model turns the credit and market moves into ${fmt.pct(p.f)} through the stock's beta and duration, while history measured ${fmt.pct(p.h)}.`;
      return head + ` Most of the gap is the business itself: the driver profile turns oil, copper, chips, China and currency into ${fmt.pct(p.f)}, while history measured ${fmt.pct(p.h)} for the same moves.`;
    }
    detail.querySelectorAll('.wf-seg button').forEach(b => {
      b.onclick = () => {
        detail.querySelector('.waterfall').dataset.mode = b.dataset.mode;
        detail.querySelectorAll('.wf-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        renderDetail();
      };
    });

    // ---------- rate ladder ----------
    const LADDER = [-200, -100, -50, -25, 25, 50, 100, 200];
    let ladderTimer = null;
    function renderLadderDebounced() { clearTimeout(ladderTimer); ladderTimer = setTimeout(renderLadder, 120); }
    // Thirty-two runs fill the ladder, one cause per frame, so a full refresh never blocks scrolling or a drag.
    let ladderJob = 0;
    function renderLadder() {
      const job = ++ladderJob, target = ladderHost.dataset.target || 'basket';
      const causes = Object.entries(M.CAUSES), tbody = ladderHost.querySelector('tbody');
      if (tbody.rows.length !== causes.length) tbody.innerHTML = causes.map(([, c]) => `<tr><td>${esc(c.neutral || c.label)}</td>${LADDER.map(() => '<td class="cell"><span>–</span></td>').join('')}</tr>`).join('');
      const st = data.stocks.find(s => s.id === selected);
      ladderCard.querySelector('.ladder-target').textContent = target === 'basket' ? `the ${data.stocks.length}-stock basket` : st.name;
      let i = 0;
      const step = () => {
        if (job !== ladderJob) return;
        const [k, c] = causes[i];
        const cells = LADDER.map(bp => {
          const o = M.run({ dy10: bp, cause: k, lens: scn.lens, blend: scn.blend, linked: scn.linked }, data, { draws: 0, lite: true });
          const v = target === 'basket' ? o.basket.mean : o.stocks[selected].blend.mean;
          const a = Math.min(1, Math.abs(v) / 0.25);
          const bg = v < 0 ? `color-mix(in srgb, var(--loss) ${Math.round(a * 32)}%, transparent)` : `color-mix(in srgb, var(--gain) ${Math.round(a * 32)}%, transparent)`;
          return `<td class="cell" style="--cellbg:${bg}"><span>${fmt.pct(v)}</span></td>`;
        }).join('');
        tbody.rows[i].innerHTML = `<td>${esc(c.neutral || c.label)}</td>${cells}`;
        if (++i < causes.length) requestAnimationFrame(step);
      };
      step();
    }
    ladderCard.querySelectorAll('button[data-target]').forEach(b => {
      b.onclick = () => {
        ladderHost.dataset.target = b.dataset.target;
        ladderCard.querySelectorAll('button[data-target]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        renderLadder();
      };
    });

    // control outputs reflect linked values after each run
    function afterRun() {
      const R = result.R;
      ctlNodes.dy10.out.textContent = fmt.bp(scn.dy10);
      ctlNodes.dy10.paint(scn.dy10);
      host.querySelector('.cause-split').textContent = scn.dy10 ? `real ${fmt.signed(R.rr * 100, 0, 'bp')}, inflation ${fmt.signed(R.be * 100, 0, 'bp')}` : '';
      CONTROLS.forEach(spec => {
        const c = ctlNodes[spec.key], user = scn[spec.key], shown = R.ctl[spec.key];
        const isLinked = (R.linkedFill[spec.key] || R.overlayed[spec.key]) && Math.abs(user) < 1e-9;
        const v = isLinked ? shown : user;
        c.out.textContent = spec.words ? spec.words(v) : (Math.abs(v) < 1e-9 ? '0' + spec.unit.trim() : fmt.signed(v, spec.step < 1 ? (spec.step < 0.1 ? 2 : 1) : 0, spec.unit)) + (isLinked ? (R.overlayed[spec.key] ? ' with rates' : ' linked') : '');
        c.paint(user, isLinked);
      });
    }

    sync(); recompute();
    select(selected);
    return { applyPreset, get scenario() { return scn; }, get result() { return result; }, select, recompute: () => recompute() };
  }

  root.TorqueSim = { Simulator, CONTROLS, CHANNEL_LABEL, FACTOR_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
