/* Torque UI core: formatting, springs, tooltips, small SVG helpers, OLS for in-browser re-estimation. */
(function (root) {
  'use strict';
  const MINUS = '−';
  const fmt = {
    pct(v, d = 1, sign = true) {
      if (v == null || !isFinite(v)) return '–';
      const x = v * 100;
      const s = Math.abs(x).toFixed(d);
      if (Number(s) === 0) return (0).toFixed(d) + '%';
      return (x < 0 ? MINUS : sign ? '+' : '') + s + '%';
    },
    pp(v, d = 2) { if (v == null || !isFinite(v)) return '–'; const s = Math.abs(v).toFixed(d); return (v < 0 ? MINUS : v > 0 ? '+' : '') + s; },
    num(v, d = 1) { if (v == null || !isFinite(v)) return '–'; return (v < 0 ? MINUS : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
    signed(v, d = 1, unit = '') { if (v == null || !isFinite(v)) return '–'; const s = Math.abs(v).toFixed(d); if (Number(s) === 0) return (0).toFixed(d) + unit; return (v < 0 ? MINUS : '+') + s + unit; },
    bn(v) { if (v == null || !isFinite(v)) return '–'; if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(2) + 'T'; if (Math.abs(v) >= 10) return '$' + v.toFixed(0) + 'B'; if (Math.abs(v) >= 1) return '$' + v.toFixed(1) + 'B'; return '$' + (v * 1000).toFixed(0) + 'M'; },
    money(v, cur) { if (v == null || !isFinite(v)) return '–'; const sym = { USD: '$', JPY: '¥', CNY: '¥', HKD: 'HK$' }[cur] || ''; const d = cur === 'JPY' ? 0 : 2; return (v < 0 ? MINUS : '') + sym + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
    bp(v) { if (v == null || !isFinite(v)) return '–'; const r = Math.round(v); return (r < 0 ? MINUS : r > 0 ? '+' : '') + Math.abs(r) + 'bp'; }
  };

  // ---- springs: value animation that settles smoothly (critically damped) ----
  class Spring {
    constructor(x = 0, k = 170, zeta = 1) { this.x = x; this.t = x; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k) * zeta; }
    set(t, jump) { this.t = t; if (jump) { this.x = t; this.v = 0; } }
    step(dt) { const a = -this.k * (this.x - this.t) - this.c * this.v; this.v += a * dt; this.x += this.v * dt; const moving = Math.abs(this.x - this.t) > 1e-4 || Math.abs(this.v) > 1e-4; if (!moving) { this.x = this.t; this.v = 0; } return moving; }
  }
  const reduceMotion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  // a single rAF loop that drives every registered animator until all settle
  const animators = new Set();
  let looping = false, lastT = 0;
  function tick(t) {
    const dt = Math.min(0.034, (t - lastT) / 1000 || 0.016); lastT = t;
    let any = false;
    animators.forEach(fn => { if (fn(dt)) any = true; else animators.delete(fn); });
    if (any || animators.size) requestAnimationFrame(tick); else looping = false;
  }
  function animate(fn) { animators.add(fn); if (!looping) { looping = true; lastT = performance.now(); requestAnimationFrame(tick); } }

  // ---- tooltip ----
  let tipEl = null;
  function tip(html, x, y) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    if (html == null) { tipEl.classList.remove('on'); return; }
    tipEl.innerHTML = html;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    const px = Math.min(window.innerWidth - w - 10, Math.max(10, x + 14));
    const py = y - h - 12 < 8 ? y + 18 : y - h - 12;
    tipEl.style.left = px + 'px'; tipEl.style.top = py + 'px';
    tipEl.classList.add('on');
  }

  // ---- DOM / SVG ----
  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent) { const el = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]); if (parent) parent.appendChild(el); return el; }
  function el(tag, attrs, html) { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function niceStep(span, target = 5) { const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
  function ticks(lo, hi, target = 5) { const s = niceStep(hi - lo, target), out = []; for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(Math.abs(v) < 1e-12 ? 0 : v); return out; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- OLS with Newey-West (lag 2) standard errors, used when a user imports new data ----
  function ols(y, X) {
    const n = y.length, k = X[0].length + 1;
    const A = X.map(r => [1].concat(r));
    const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
    for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += A[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += A[i][a] * A[i][b]; }
    const inv = invert(XtX); if (!inv) return null;
    const beta = inv.map(row => row.reduce((s, v, j) => s + v * Xty[j], 0));
    const e = y.map((yi, i) => yi - A[i].reduce((s, v, j) => s + v * beta[j], 0));
    const S = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let l = 0; l <= 2; l++) {
      const w = l === 0 ? 1 : 1 - l / 3;
      for (let i = l; i < n; i++) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
        const g = A[i][a] * e[i] * A[i - l][b] * e[i - l];
        S[a][b] += w * (l === 0 ? g : g + A[i - l][a] * e[i - l] * A[i][b] * e[i]);
      }
    }
    const V = mm(mm(inv, S), inv);
    const ym = y.reduce((s, v) => s + v, 0) / n;
    const sse = e.reduce((s, v) => s + v * v, 0), sst = y.reduce((s, v) => s + (v - ym) * (v - ym), 0);
    return { beta, se: V.map((r, i) => Math.sqrt(Math.max(r[i], 0))), r2: 1 - sse / sst, resid: e, n };
  }
  function mm(A, B) { return A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0))); }
  function invert(M) {
    const n = M.length, A = M.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(r => r.slice(n));
  }

  root.TorqueCore = { fmt, Spring, animate, reduceMotion, tip, svg, el, css, ticks, niceStep, esc, ols, invert, MINUS };
})(typeof window !== 'undefined' ? window : globalThis);
