/* Torque bootstrap: wires sections together, theme, navigation, smooth scrolling and the intro. */
(function () {
  'use strict';
  const C = window.TorqueCore, M = window.TorqueModel, S = window.TorqueSections, Sim = window.TorqueSim;
  const $ = s => document.querySelector(s);
  let lenis = null;
  function scrollToEl(target) {
    const y = target.getBoundingClientRect().top + window.scrollY - 64;
    if (lenis) lenis.scrollTo(y, { duration: 1.1 }); else window.scrollTo({ top: y, behavior: C.reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- intro: the arm, its drawn stand-in, and the way in ----------
  // Wired before the data loads, so a fast three.js load is never missed.
  (function intro() {
    const stage = $('#arm-viewport'), go = $('.intro-go');
    if (!stage || !go) return;
    const fb = stage.querySelector('.fallback');
    const showFallback = on => { if (fb) fb.hidden = !on; stage.classList.toggle('nogl', on); };
    window.addEventListener('torque:hero-ready', () => showFallback(false));
    window.addEventListener('torque:hero-fallback', () => showFallback(true));
    // the 3D arm loads three.js from a CDN; if it has not started within a few seconds, the drawn arm stands in
    setTimeout(() => { if (!stage.classList.contains('gl-ready')) showFallback(true); }, 4500);
    go.addEventListener('click', e => {
      e.preventDefault();
      const armed = stage.classList.contains('gl-ready') && !C.reduceMotion;
      window.dispatchEvent(new CustomEvent('torque:intro-press'));
      // the gripper closes on the press, then the page travels to the simulator
      setTimeout(() => scrollToEl(document.getElementById('simulator')), armed ? 240 : 0);
    });
  })();

  // The GitHub Pages copy sets TORQUE_LIVE_URL and loads the newest refresh; the embedded snapshot is the fallback.
  function start() {
    const live = window.TORQUE_LIVE_URL;
    if (!live || !window.fetch) { boot(window.TORQUE_DATA, false); return; }
    let done = false;
    const go = (d, fresh) => { if (done) return; done = true; boot(d, fresh); };
    const timer = setTimeout(() => go(window.TORQUE_DATA, false), 3000);
    fetch(live, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { clearTimeout(timer); const ok = d && Array.isArray(d.stocks) && d.factors && d.stocks.length >= 10; go(ok ? d : window.TORQUE_DATA, ok); })
      .catch(() => { clearTimeout(timer); go(window.TORQUE_DATA, false); });
  }

  function boot(raw, fresh) {
  const data = M.prepare(raw);
  document.documentElement.dataset.dataSource = fresh ? 'live' : 'snapshot';

  // ---------- theme ----------
  const rootEl = document.documentElement;
  try { const t = localStorage.getItem('torque:theme'); if (t === 'light' || t === 'dark') rootEl.setAttribute('data-theme', t); } catch (e) { /* no storage */ }
  $('.theme-toggle').addEventListener('click', () => {
    const cur = rootEl.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    rootEl.setAttribute('data-theme', next);
    try { localStorage.setItem('torque:theme', next); } catch (e) { /* no storage */ }
  });

  // ---------- counts ----------
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const nStocks = data.stocks.length;
  document.querySelectorAll('.n-stocks').forEach(n => { n.textContent = String(nStocks); });
  document.querySelectorAll('.n-stocks-word').forEach(n => { const w = WORDS[nStocks] || String(nStocks); n.textContent = n.dataset.cap ? w.charAt(0).toUpperCase() + w.slice(1) : w; });

  // ---------- dates ----------
  document.querySelectorAll('.asof-date').forEach(n => { n.textContent = data.asofShort; });
  document.querySelectorAll('.asof-long').forEach(n => { n.textContent = data.asofLong; });

  // ---------- smooth scrolling (desktop pointers only) ----------
  const fine = matchMedia('(pointer: fine)').matches;
  if (window.Lenis && fine && !C.reduceMotion) {
    lenis = new window.Lenis({ lerp: 0.11, wheelMultiplier: 0.95, smoothWheel: true });
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // nested scroll areas keep their own native scrolling
    document.querySelectorAll('.pendant, .ladder-wrap, .table-wrap').forEach(n => n.setAttribute('data-lenis-prevent', ''));
    // the page holds still while a company profile is open, and picks up where it was when it closes
    window.addEventListener('torque:drawer', e => { if (e.detail.open) lenis.stop(); else lenis.start(); });
  }
  document.querySelectorAll('a[href^="#"]:not(.intro-go)').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1); const t = id === 'top' ? document.body : document.getElementById(id);
    if (!t) return; e.preventDefault(); scrollToEl(t);
  }));

  // ---------- top bar ----------
  const bar = $('.topbar');
  const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const navLinks = [...document.querySelectorAll('.nav a')];
  const io = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  ['stack', 'forces', 'simulator', 'history', 'method'].forEach(id => { const n = document.getElementById(id); if (n) io.observe(n); });

  // ---------- sections ----------
  S.renderBackdrop($('.bd-grid'), data);
  let sim = null;
  const drawer = S.Drawer(data, id => { if (sim) sim.select(id); scrollToEl(document.getElementById('simulator')); });
  S.renderStack($('.stack'), data, id => drawer.open(id));
  const forces = S.ForcesMap($('.fm-body'), $('.force-list'), data, id => drawer.open(id));
  S.Payback($('.payback'));

  // ---------- simulator ----------
  let initialPreset = 'rates-up';
  try { const p = localStorage.getItem('torque:preset'); if (p && data.presets.some(x => x.key === p)) initialPreset = p; } catch (e) { /* no storage */ }
  const hashPreset = location.hash.slice(1);
  if (data.presets.some(x => x.key === hashPreset)) initialPreset = hashPreset;
  const first = data.presets.find(p => p.key === initialPreset);
  const defaultSel = (data.stocks.find(s => s.id === 'sym') || data.stocks[0]).id;
  function buildSim(sel) {
    const host = $('.sim');
    // rebuild control groups for a fresh instance
    host.querySelectorAll('.presets, [data-group="macro"], [data-group="micro"]').forEach(n => { n.innerHTML = ''; });
    host.querySelectorAll('[data-group="rates"] .range').forEach(n => n.remove());
    host.querySelector('.forest').innerHTML = '';
    sim = Sim.Simulator({ data, host, initial: first ? first.scn : {}, presetKey: initialPreset, selected: sel || defaultSel });
  }
  buildSim();
  window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (data.presets.some(x => x.key === k)) { sim.applyPreset(k); scrollToEl($('#simulator')); } });

  // ---------- history lab and method ----------
  S.HistoryLab($('#history'), data);
  const mt = $('.method-text');
  mt.innerHTML = data.methodHtml;
  $('.src-body').innerHTML = data.sources.map(s => `<tr><td>${C.esc(s.data)}</td><td>${s.link ? `<a href="${C.esc(s.link)}" target="_blank" rel="noopener">${C.esc(s.source)}</a>` : C.esc(s.source)}</td><td>${C.esc(s.window)}</td></tr>`).join('');
  $('.refresh-note').textContent = data.refreshNote;
  $('.limits').innerHTML = data.limits.map(l => `<li>${C.esc(l)}</li>`).join('');
  const typeSel = $('#add-type');
  Object.entries(data.templates).forEach(([k, t]) => { const o = document.createElement('option'); o.value = k; o.textContent = t.label; typeSel.appendChild(o); });
  S.Importer($('.importer'), data, id => {
    S.renderStack($('.stack'), data, x => drawer.open(x));
    forces.draw();
    buildSim(id);
  });
  }

  start();
})();
