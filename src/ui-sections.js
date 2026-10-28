/* Torque page sections: backdrop, robot stack and profiles, forces map, payback calculator,
   history lab, data and method (CSV import, add a company). */
(function (root) {
  'use strict';
  const C = root.TorqueCore, M = root.TorqueModel;
  const { fmt, el, svg, esc } = C;
  const LAYERS = [
    { key: 'brain', name: 'Compute and software', desc: 'Chips and autonomy software' },
    { key: 'senses', name: 'Sensors', desc: 'Machine vision and lidar' },
    { key: 'muscles', name: 'Motion components', desc: 'Gears, servo motors and drives' },
    { key: 'bodies', name: 'Robot makers', desc: 'Industrial, surgical, humanoid and legged robots' },
    { key: 'deployers', name: 'Automation and operators', desc: 'Factory and warehouse systems, and companies that run robots' }
  ];
  const MIX_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#eb6834', '#008300', '#9aa5af'];
  const END_LABEL = { general: 'General industry', auto: 'Autos', electronics: 'Electronics', semis: 'Semis and AI', logistics: 'Logistics', healthcare: 'Healthcare', consumer: 'Consumer', energy: 'Energy and process', research: 'Research and other', gov: 'Government' };
  const REGION_LABEL = { us: 'United States', china: 'China', japan: 'Japan', europe: 'Europe', row: 'Rest of world' };

  // ---------- backdrop ----------
  function renderBackdrop(host, data) {
    host.innerHTML = '';
    data.backdrop.forEach(b => {
      const d = el('div', { class: 'bd' });
      const tone = b.change == null || b.goodUp == null ? 'muted' : (b.change > 0) === b.goodUp ? 'gain' : 'loss';
      const ch = b.changeText ? `<span class="d ${tone}">${esc(b.changeText)}</span>` : '';
      d.innerHTML = `<span class="k">${esc(b.label)}</span><span class="v num${b.valueText.length > 8 ? ' long' : ''}">${esc(b.valueText)}</span>${ch}`;
      if (b.spark && b.spark.length > 2) {
        const s = svg('svg', { viewBox: '0 0 100 26', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, d);
        const lo = Math.min(...b.spark), hi = Math.max(...b.spark), n = b.spark.length;
        const X = i => i / (n - 1) * 98 + 1, Y = v => 23 - (v - lo) / (hi - lo || 1) * 20;
        svg('path', { d: b.spark.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(2) + ' ' + Y(v).toFixed(2)).join(' '), fill: 'none', stroke: 'var(--ink-3)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, s);
        svg('circle', { cx: X(n - 1), cy: Y(b.spark[n - 1]), r: 2.4, fill: 'var(--yellow)', stroke: 'var(--ink)', 'stroke-width': 0.8, 'vector-effect': 'non-scaling-stroke' }, s);
      }
      d.title = b.source || '';
      host.appendChild(d);
    });
  }

  // ---------- robot stack ----------
  function renderStack(host, data, openProfile) {
    host.innerHTML = '';
    LAYERS.forEach(L => {
      const items = data.stocks.filter(s => s.layer === L.key);
      if (!items.length) return;
      const row = el('div', { class: 'layer' });
      row.innerHTML = `<div class="lname"><strong>${esc(L.name)}</strong><span>${esc(L.desc)}</span></div>`;
      const tiles = el('div', { class: 'tiles' });
      items.forEach(st => {
        const t = el('button', { class: 'tile', type: 'button', 'aria-label': `Open profile for ${st.name}` });
        const ytd = st.perf && st.perf.ytd, ipo = st.perf && st.perf.ipo;
        const perfTxt = ytd != null ? fmt.pct(ytd, 0) + ' YTD' : ipo != null ? fmt.pct(ipo, 0) + ' since IPO' : '';
        const perfV = ytd != null ? ytd : ipo;
        t.innerHTML = `<span class="nm">${esc(st.name)}</span><span class="mc">${fmt.bn(st.fund ? st.fund.mcap : null)}</span>
          <span class="tk">${esc(st.ticker)} · ${esc(st.country)}</span><span class="yt ${perfV < 0 ? 'loss' : 'gain'}">${perfTxt}</span>
          <span class="role">${esc(st.role)}</span>`;
        t.addEventListener('click', () => openProfile(st.id));
        tiles.appendChild(t);
      });
      row.appendChild(tiles);
      host.appendChild(row);
    });
  }

  function mixBar(mix, labels) {
    const entries = Object.entries(mix || {}).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
    const bar = entries.map(([k, v], i) => `<span style="width:${(v * 100).toFixed(1)}%;background:${MIX_COLORS[i % MIX_COLORS.length]}" title="${esc(labels[k] || k)} ${Math.round(v * 100)}%"></span>`).join('');
    const leg = entries.map(([k, v], i) => `<span><i style="background:${MIX_COLORS[i % MIX_COLORS.length]}"></i>${esc(labels[k] || k)} ${Math.round(v * 100)}%</span>`).join('');
    return `<div class="mixbar" role="img" aria-label="${esc(entries.map(([k, v]) => `${labels[k] || k} ${Math.round(v * 100)}%`).join(', '))}">${bar}</div><div class="mixlegend">${leg}</div>`;
  }

  function Drawer(data, onSimulate) {
    // data-lenis-prevent: the smooth scroller leaves this panel to the browser, so the wheel scrolls the profile
    const back = el('div', { class: 'drawer-back' }), dr = el('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Company profile', 'data-lenis-prevent': '' });
    document.body.append(back, dr);
    let lastFocus = null;
    const announce = open => window.dispatchEvent(new CustomEvent('torque:drawer', { detail: { open } }));
    function close() {
      if (!dr.classList.contains('open')) return;
      back.classList.remove('open'); dr.classList.remove('open'); document.documentElement.style.overflow = '';
      announce(false);
      if (lastFocus) lastFocus.focus({ preventScroll: true });   // back to the tile without jumping the page
    }
    back.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dr.classList.contains('open')) close(); });
    function open(id) {
      const st = data.stocks.find(s => s.id === id); if (!st) return;
      lastFocus = document.activeElement;
      const f = st.fund || {}, p = st.profile || {}, h = st.hist && st.hist.monthly;
      const unitBeta = (name, unit) => { if (!h) return null; const i = data.factors.monthly.names.indexOf(name); return i < 0 || !h.beta[i] ? null : h.beta[i] * unit; };
      const sens = [
        ['Real 10-year yield +100bp', unitBeta('RR', 1)], ['Credit spread +100bp', unitBeta('CREDIT', 1)], ['Yen 10% weaker', unitBeta('JPY', 0.1)],
        ['AI chip cycle +10%', unitBeta('SEMI', 0.1)], ['China +10%', unitBeta('CHINA', 0.1)], ['Broad market +10%', unitBeta('MKT', 0.1)]
      ].filter(x => x[1] != null);
      const maxS = Math.max(0.05, ...sens.map(x => Math.abs(x[1])));
      const sensHtml = sens.map(([lab, v]) => `<div class="sens"><span>${esc(lab)}</span><span class="sbar"><i style="left:${v < 0 ? 50 - Math.abs(v) / maxS * 50 : 50}%;width:${Math.abs(v) / maxS * 50}%;background:${v < 0 ? 'var(--loss)' : 'var(--gain)'}"></i></span><b class="num">${fmt.pct(Math.expm1(v))}</b></div>`).join('');
      const netCash = (f.cash || 0) - (f.debt || 0);
      const metrics = [
        ['Price', fmt.money(st.price, st.currency)], ['Market cap', fmt.bn(f.mcap)], ['Forward P/E', p.pe ? p.pe.toFixed(1) + 'x' : 'n/m'],
        ['Revenue, next 12m', fmt.bn(f.rev)], ['EBIT margin', f.m1 != null ? fmt.pct(f.m1, 1, false) : '–'], p.userAdded ? ['Net cash', 'Not entered'] : [netCash >= 0 ? 'Net cash' : 'Net debt', fmt.bn(Math.abs(netCash))]
      ];
      const optPct = Math.round((f._opt0 / Math.max(1e-9, f._ev0)) * 100);
      let implied;
      if (f._dcfOK) {
        implied = `The discount rate that reproduces today's price is ${f._k0.toFixed(1)}%, and ${Math.round(f._lateShare * 100)}% of the modeled value arrives after 2031.` +
          (f._impliedCagr != null ? ` At a CAPM rate of ${f._kCapm.toFixed(1)}%, the price would need revenue growing about ${fmt.pct(f._impliedCagr, 0, false)} a year over the next decade.` : '');
        if (f._optImplied > 0.005) implied += ` Even a 5% discount rate cannot reach the price, so the remaining ${Math.round(f._optImplied * 100)}% of enterprise value is treated as the value of future businesses.`;
      } else {
        implied = `It does not earn a profit yet, so the model values it as a long-dated business (duration ${Math.round(f._durCore)} years) minus about ${fmt.bn(f._burnPV)} of cash it will burn first.`;
      }
      dr.innerHTML = `<button class="iconbtn close" type="button" aria-label="Close profile">✕</button>
        <h3>${esc(st.name)}</h3><p class="muted">${esc(st.ticker)} · ${esc(st.exchange || '')} · ${esc(LAYERS.find(L => L.key === st.layer).name)}</p>
        <div class="kv">${metrics.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
        <p>${esc(p.what || st.role || '')}</p>
        <h4>What the price already assumes</h4><p class="muted">${esc(implied)}${f.opt && f.opt.share ? ` About ${optPct}% of ${f._dcfOK ? 'enterprise value' : 'that future business'} rests on future humanoid or autonomy businesses.` : ''}</p>
        <h4>Revenue by end market</h4>${mixBar(f.endMix, END_LABEL)}
        <h4>Revenue by region</h4>${mixBar(f.region, REGION_LABEL)}
        <h4>Measured sensitivities, ${h && h.n >= 150 ? 'monthly 2014 to 2026' : h && h.n > 0 ? 'monthly since listing' : 'peer averages'}</h4><div class="senslist">${sensHtml}</div>
        <p class="hint">${h ? (h.n === 0 ? 'No usable price history yet, so these are the peer averages for Chinese growth names.' : `Fit on ${h.n} months, R² ${h.r2.toFixed(2)}. ${h.n < 60 ? 'Short history, so estimates lean on peers.' : ''}`) : ''}</p>
        ${p.basis ? `<h4>Model inputs</h4><div class="inputs">${[['Revenue, next 12 months', fmt.bn(f.rev), p.basis.rev], ['EBIT margin, next 12 months', Math.abs(f.m1) > 1 ? 'n/m' : fmt.pct(f.m1, 1, false), p.basis.m1], ['Long-run margin', fmt.pct(f.mT, 0, false), p.basis.mT], ['Future businesses', optPct + (f._dcfOK ? '% of value' : '% of the future business'), p.basis.opt]].concat(p.basis.fx ? [['Costs in yen', Math.round(((f.costCcy || {}).JPY || 0) * 100) + '%', p.basis.fx]] : []).map(([k, v, b]) => `<div class="inp"><div class="k">${esc(k)}</div><div class="v num">${esc(v)}</div><div class="b">${esc(b || '')}</div></div>`).join('')}</div>` : ''}
        ${p.next ? `<p class="hint" style="margin-top:10px">${p.stale ? `Reported after these inputs were set: ${esc(p.next)}. The inputs may trail those results.` : `Next: ${esc(p.next)}`}</p>` : ''}
        ${p.drivers && p.drivers.length ? `<h4>What drives it</h4><ul>${p.drivers.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${p.risks && p.risks.length ? `<h4>What could go wrong</h4><ul>${p.risks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${p.events && p.events.length ? `<h4>Recent events</h4><ul>${p.events.map(x => `<li><span class="faint num">${esc(x.date)}</span> ${esc(x.text)}</li>`).join('')}</ul>` : ''}
        ${p.sources && p.sources.length ? `<h4>Sources</h4><ul class="srcs">${p.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
        <p style="margin-top:20px"><button class="btn" type="button" data-sim="${esc(st.id)}">Simulate ${esc(st.short || st.name)}</button></p>`;
      dr.querySelector('.close').addEventListener('click', close);
      dr.querySelector('[data-sim]').addEventListener('click', () => { close(); onSimulate(st.id); });
      back.classList.add('open'); dr.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
      announce(true);
      dr.scrollTop = 0;
      setTimeout(() => dr.querySelector('.close').focus(), 60);
    }
    return { open, close };
  }

  // ---------- forces map ----------
  const FORCES = [
    { key: 'term', label: 'Rates up: term premium', shock: { dy10: 100, cause: 'term' }, says: 'The 10-year Treasury yield rises 1 point because investors want more to hold long bonds.' },
    { key: 'infl', label: 'Rates up: inflation', shock: { dy10: 100, cause: 'inflation' }, says: 'The 10-year yield rises 1 point on higher expected inflation.' },
    { key: 'fed', label: 'Rates up: Fed hikes', shock: { dy10: 100, cause: 'policy' }, says: 'The 10-year yield rises 1 point as the Fed raises rates.' },
    { key: 'usd', label: 'Stronger dollar', shock: { usd: 10 }, says: 'The dollar index rises 10%.' },
    { key: 'jpy', label: 'Weaker yen', shock: { jpy: 10 }, says: 'The yen falls 10% against the dollar.' },
    { key: 'oil', label: 'Oil up', shock: { oil: 30 }, says: 'Oil prices rise 30%.' },
    { key: 'cu', label: 'Metals up', shock: { copper: 20 }, says: 'Copper and other metals rise 20%.' },
    { key: 'cyc', label: 'Factory upturn', shock: { cycle: 15 }, says: 'The Philadelphia Fed factory activity index rises 15 points.' },
    { key: 'credit', label: 'Credit stress', shock: { credit: 150 }, says: 'High-yield bond spreads widen by 1.5 points.' },
    { key: 'mood', label: 'Market drop', shock: { mood: -10 }, says: 'The S&P 500 falls 10% for reasons the macro data do not explain.' },
    { key: 'ai', label: 'Chip stocks rally', shock: { semis: 20 }, says: 'Semiconductor stocks beat the S&P 500 by 20%.' },
    { key: 'china', label: 'China stocks rally', shock: { china: 15 }, says: 'Chinese A-shares beat the S&P 500 by 15%.' },
    { key: 'wages', label: 'Faster wage growth', shock: { wages: 1 }, says: 'US wage growth runs 1 point faster.' },
    { key: 'tariff', label: 'Higher tariffs', shock: { tariff: 15 }, says: 'Tariffs on robots and robot parts rise 15 points.' },
    { key: 'magnets', label: 'Magnet embargo', shock: { magnets: 2 }, says: 'China stops exporting rare-earth magnets.' },
    { key: 'timeline', label: 'Humanoids sooner', shock: { timeline: -2 }, says: 'Humanoid robots and self-driving vehicles arrive 2 years sooner than the market expects.' },
    { key: 'pricewar', label: 'Chinese price war', shock: { pricewar: 1 }, says: 'Chinese robot makers cut prices hard.' },
    { key: 'funding', label: 'Funding freeze', shock: { funding: -1 }, says: 'IPOs and venture funding stop for companies that are not yet profitable.' },
    { key: 'incident', label: 'Robotaxi crash', shock: { incident: 'av' }, says: 'A driverless vehicle is involved in a serious crash.' }
  ];
  const FORCE_GROUPS = [
    { label: 'Rates and markets', keys: ['term', 'infl', 'fed', 'usd', 'jpy', 'oil', 'cu', 'cyc', 'credit', 'mood', 'ai', 'china'] },
    { label: 'Robotics and policy', keys: ['wages', 'tariff', 'magnets', 'timeline', 'pricewar', 'funding', 'incident'] }
  ];
  const CH_ORDER = ['rates', 'risk', 'demand', 'costs', 'fx', 'funding', 'optionality'];
  const CH_LABEL = { rates: 'Interest rates', risk: 'Risk premium', demand: 'Demand', costs: 'Costs and pricing', fx: 'Currency', funding: 'Funding', optionality: 'Future businesses' };
  const CH_DESC = {
    rates: 'The 10-year yield sets what future profits are worth today.',
    risk: 'The extra return investors want for holding stocks.',
    demand: 'Orders and revenue from the markets each company sells into.',
    costs: 'Input costs, and how much of them prices can pass on.',
    fx: 'Sales and costs in other currencies, turned into dollars.',
    funding: 'What it costs a company that burns cash to raise money.',
    optionality: 'Value that rests on future humanoid and self-driving businesses.'
  };
  // what a rate rise brings with it under each cause, in words
  function companions(cause) {
    const c = M.CAUSES[cause]; if (!c) return '';
    const W = {
      credit: v => `credit spreads ${Math.abs(v)}bp ${v > 0 ? 'wider' : 'tighter'}`,
      mood: v => `the broad market ${Math.abs(v)}% ${v < 0 ? 'lower' : 'higher'}`,
      usd: v => `the dollar ${Math.abs(v)}% ${v > 0 ? 'stronger' : 'weaker'}`,
      cycle: v => `factory activity ${Math.abs(v)} points ${v > 0 ? 'higher' : 'lower'}`,
      oil: v => `oil ${Math.abs(v)}% ${v > 0 ? 'higher' : 'lower'}`,
      copper: v => `copper ${Math.abs(v)}% ${v > 0 ? 'higher' : 'lower'}`,
      wages: v => `wage growth ${Math.abs(v)} points ${v > 0 ? 'faster' : 'slower'}`
    };
    const bits = Object.entries(c.overlay).filter(([k]) => W[k]).map(([k, v]) => W[k](v));
    if (!bits.length) return '';
    const list = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1];
    return ` It comes with ${list}, the moves that usually go with this cause.`;
  }

  // One force at a time: which companies move, how far, and through which part of the business.
  function ForcesMap(host, chipsHost, data, onPick) {
    let current = 'term';
    chipsHost.innerHTML = '';
    FORCE_GROUPS.forEach(g => {
      const grp = el('div', { class: 'fl-group' }, `<span class="fl-label">${esc(g.label)}</span><div class="fl-chips"></div>`);
      const box = grp.querySelector('.fl-chips');
      g.keys.forEach(k => {
        const f = FORCES.find(x => x.key === k);
        const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(f.key === current) }, esc(f.label));
        b.addEventListener('click', () => { current = f.key; chipsHost.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
        box.appendChild(b);
      });
      chipsHost.appendChild(grp);
    });
    const list = a => a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
    function draw() {
      const F = FORCES.find(f => f.key === current);
      const out = M.run(Object.assign({ linked: false, lens: 'monthly', blend: 0.5 }, F.shock), data, { draws: 0 });
      const rows = data.stocks.map(st => {
        const r = out.stocks[st.id], ch = r.fund ? r.fund.channels : {};
        const top = Object.entries(ch).filter(([, v]) => Math.abs(v) > 0.001).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        return { id: st.id, name: st.short || st.name, v: r.blend.mean, h: r.hist ? r.hist.mean : null, f: r.fund ? r.fund.mean : null, ch: top };
      }).sort((a, b) => a.v - b.v);
      // channel mix across all companies, from the fundamentals lens
      const tot = {}; let all = 0;
      rows.forEach(r => r.ch.forEach(([k, v]) => { tot[k] = (tot[k] || 0) + Math.abs(v); all += Math.abs(v); }));
      const mix = CH_ORDER.filter(k => tot[k] && tot[k] / all >= 0.01).map(k => ({ k, s: tot[k] / all })).sort((a, b) => b.s - a.s);
      // verdict: the two ends of the ranking and the basket average
      const nv = r => `${esc(r.name)} <b class="num">${fmt.pct(r.v)}</b>`;
      const losers = rows.filter(r => r.v < 0), gainers = rows.filter(r => r.v > 0).reverse();
      const verdict = `<div><dt>Basket average</dt><dd><b class="num">${fmt.pct(out.basket.mean)}</b></dd></div>` +
        `<div><dt>${losers.length ? 'Falls most' : 'Gains least'}</dt><dd>${(losers.length ? losers.slice(0, 2) : rows.slice(0, 1)).map(nv).join(', ')}</dd></div>` +
        `<div><dt>${gainers.length ? 'Gains most' : 'Falls least'}</dt><dd>${(gainers.length ? gainers.slice(0, 2) : rows.slice(-1)).map(nv).join(', ')}</dd></div>`;
      // bars share one scale; zero sits where the range puts it, so a one-sided force uses the full width
      const neg = Math.max(0, -rows[0].v), pos = Math.max(0, rows[rows.length - 1].v), span = Math.max(1e-6, neg + pos);
      const z = neg + pos > 0 ? neg / span * 100 : 50;
      const rowsHtml = rows.map(r => {
        const w = Math.abs(r.v) / span * 100, left = r.v < 0 ? z - w : z, flat = Math.abs(r.v) < 0.0005;
        // the main driver: the biggest fundamentals channel, unless the stock's own price history carries most of the move
        const byHistory = r.h != null && (r.f == null || Math.abs(r.h) > 1.25 * Math.abs(r.f) || !r.ch.length);
        const main = flat ? 'Little effect' : byHistory ? 'Price history' : CH_LABEL[r.ch[0][0]];
        return `<li><button class="fm-row" type="button" data-id="${esc(r.id)}" aria-label="${esc(r.name)}, ${fmt.pct(r.v)}, mainly ${esc(main.toLowerCase())}. Open the company profile.">` +
          `<span class="nm">${esc(r.name)}</span><span class="mc">${esc(main)}</span>` +
          `<span class="tr" aria-hidden="true"><s style="left:${z.toFixed(2)}%"></s>${flat ? '' : `<i class="${r.v < 0 ? 'neg' : 'pos'}" style="left:${left.toFixed(2)}%;width:${Math.max(0.6, w).toFixed(2)}%"></i>`}</span>` +
          `<b class="num v">${fmt.pct(r.v)}</b></button></li>`;
      }).join('');
      const mixHtml = mix.length ? mix.map(m => `<li><span class="cn">${esc(CH_LABEL[m.k])}</span><b class="num cs">${Math.round(m.s * 100)}%</b>` +
          `<span class="cb" aria-hidden="true"><i style="width:${(m.s * 100).toFixed(1)}%"></i></span><span class="cd">${esc(CH_DESC[m.k])}</span></li>`).join('')
        : '<li><span class="cd">The fundamentals lens has no channel for this force, so each stock\'s price history carries it.</span></li>';
      const histLed = rows.filter(r => !(Math.abs(r.v) < 0.0005) && r.h != null && (r.f == null || Math.abs(r.h) > 1.25 * Math.abs(r.f) || !r.ch.length)).length;
      const isRate = !!F.shock.cause;
      host.innerHTML = `<div class="fm-head"><h3 class="fm-title">${esc(F.label)}</h3>` +
        `<p class="fm-says">${esc(F.says)}${isRate ? esc(companions(F.shock.cause)) : ''}</p>` +
        `<dl class="fm-verdict">${verdict}</dl></div>` +
        `<div class="fm-grid"><div class="fm-mix"><h4>Where the effect comes from</h4><ul>${mixHtml}</ul>` +
        `<p class="fm-fine">Shares of the total move across all ${rows.length} companies, from the fundamentals lens.${histLed ? ` Rows marked price history move mainly because of how the stock has traded with this force in the past.` : ''}</p></div>` +
        `<div class="fm-list"><div class="fm-cols" aria-hidden="true"><span class="c1">Company</span><span class="c2">Main driver</span><span class="c3">Change in share price</span></div>` +
        `<ol class="fm-rows">${rowsHtml}</ol></div></div>`;
      host.querySelectorAll('.fm-row').forEach(b => {
        const r = rows.find(x => x.id === b.dataset.id);
        const chText = r.ch.slice(0, 3).map(([k, v]) => `${CH_LABEL[k].toLowerCase()} ${fmt.pct(v)}`).join(', ');
        const html = `<b>${esc(r.name)} ${fmt.pct(r.v)}</b><br>History lens ${r.h == null ? 'n/a' : fmt.pct(r.h)}, fundamentals lens ${r.f == null ? 'n/a' : fmt.pct(r.f)}` + (chText ? `<br>Channels: ${esc(chText)}` : '');
        b.addEventListener('mousemove', e => C.tip(html, e.clientX, e.clientY));
        b.addEventListener('mouseleave', () => C.tip(null));
        b.addEventListener('click', () => { C.tip(null); if (onPick) onPick(r.id); });
      });
    }
    draw();
    return { draw };
  }

  // ---------- payback calculator ----------
  function Payback(host) {
    const inputs = [
      { k: 'cost', label: 'Robot cell, installed', min: 40, max: 400, step: 5, v: 180, f: v => '$' + v + 'k' },
      { k: 'wage', label: 'Fully loaded wage', min: 15, max: 70, step: 1, v: 48, f: v => '$' + v + '/hr', hint: 'US manufacturing averaged $48.62 an hour with benefits in June 2026 (BLS)' },
      { k: 'shifts', label: 'Shifts per day', min: 1, max: 3, step: 1, v: 2, f: v => String(v) },
      { k: 'uptime', label: 'Robot uptime', min: 60, max: 99, step: 1, v: 92, f: v => v + '%' },
      { k: 'rate', label: 'Financing rate', min: 2, max: 14, step: 0.25, v: 7.5, f: v => v.toFixed(2) + '%' }
    ];
    const state = {}; inputs.forEach(i => { state[i.k] = i.v; });
    const box = host.querySelector('.pb-inputs'), outA = host.querySelector('.pb-months'), outB = host.querySelector('.pb-irr'), note = host.querySelector('.note');
    inputs.forEach(i => {
      const w = el('div', { class: 'range' });
      w.innerHTML = `<div class="top"><label for="pb-${i.k}">${i.label}</label><output id="pb-${i.k}-out">${i.f(i.v)}</output></div><input type="range" id="pb-${i.k}" min="${i.min}" max="${i.max}" step="${i.step}" value="${i.v}">` + (i.hint ? `<div class="hint">${esc(i.hint)}</div>` : '');
      const inp = w.querySelector('input'), o = w.querySelector('output');
      inp.addEventListener('input', () => { state[i.k] = Number(inp.value); o.textContent = i.f(state[i.k]); calc(); });
      box.appendChild(w);
    });
    function months(s) {
      const cost = s.cost * 1000, annual = s.wage * 8 * s.shifts * 250 * (s.uptime / 100) - cost * 0.08;
      if (annual <= 0) return Infinity;
      const r = s.rate / 100 / 12, m = annual / 12;
      let pv = 0;
      for (let t = 1; t <= 120; t++) { pv += m / Math.pow(1 + r, t); if (pv >= cost) return t; }
      return Infinity;
    }
    function irr(s) {
      const cost = s.cost * 1000, annual = s.wage * 8 * s.shifts * 250 * (s.uptime / 100) - cost * 0.08;
      let lo = -0.5, hi = 3;
      const npv = r => { let v = -cost; for (let y = 1; y <= 7; y++) v += annual / Math.pow(1 + r, y); return v; };
      if (npv(lo) < 0) return null;
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    }
    function calc() {
      const m = months(state), r = irr(state);
      outA.textContent = isFinite(m) ? (m >= 24 ? (m / 12).toFixed(1) + ' years' : m + ' months') : 'Not within 10 years';
      outB.textContent = r == null ? 'Below zero' : fmt.pct(r, 0, false);
      const up = months(Object.assign({}, state, { rate: state.rate + 1 })), wageUp = months(Object.assign({}, state, { wage: state.wage * 1.1 })), upt = months(Object.assign({}, state, { uptime: Math.max(60, state.uptime - 5) }));
      const d = (a, b) => isFinite(a) && isFinite(b) ? b - a : null;
      const dR = d(m, up), dW = d(m, wageUp), dU = d(m, upt);
      const ms = v => (Math.abs(v) === 1 ? '1 month' : Math.abs(v) + ' months');
      note.innerHTML = `A 1-point higher financing rate ${dR == null ? 'pushes payback past ten years' : dR === 0 ? 'barely changes payback' : 'adds ' + ms(dR)}. Wages 10% higher ${dW == null ? 'still leave it uneconomic' : dW === 0 ? 'barely change it' : 'take ' + ms(-dW) + ' off'}. Losing 5 points of uptime ${dU == null ? 'breaks the case' : dU === 0 ? 'barely matters' : 'costs ' + ms(dU)}. Savings assume 8-hour shifts, 250 days a year and maintenance at 8% of cost.`;
    }
    calc();
  }

  // ---------- history lab ----------
  function HistoryLab(host, data) {
    const tabs = host.querySelector('.ep-tabs'), chart = host.querySelector('.ep-chart'), cap = host.querySelector('.ep-cap'), facts = host.querySelector('.ep-facts');
    let cur = data.episodes[data.episodes.length - 1].key;
    data.episodes.forEach(ep => {
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(ep.key === cur) }, esc(ep.short || ep.title));
      b.addEventListener('click', () => { cur = ep.key; tabs.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawEp(); });
      tabs.appendChild(b);
    });
    function drawEp() {
      const ep = data.episodes.find(e => e.key === cur);
      const rows = Object.entries(ep.stocks).map(([sym, v]) => ({ sym, name: (data.stocks.find(s => s.yahoo === sym) || { short: sym === 'BOTZ' ? 'BOTZ robotics ETF' : sym }).short || sym, a: v.actual / 100, p: v.predicted / 100 })).sort((x, y) => x.a - y.a);
      const W = Math.max(280, chart.clientWidth || 640), rowH = 24, top = 26, nameW = W < 480 ? 104 : 150;
      const H = top + rows.length * rowH + 10;
      let lo = Math.min(0, ...rows.map(r => Math.min(r.a, r.p))), hi = Math.max(0, ...rows.map(r => Math.max(r.a, r.p)));
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const X = v => nameW + (v - lo) / (hi - lo) * (W - nameW - 52);
      chart.innerHTML = '';
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': `Actual and modeled returns in ${ep.title}` }, chart);
      C.ticks(lo, hi, 5).forEach(v => {
        svg('line', { x1: X(v), x2: X(v), y1: top - 6, y2: H - 6, stroke: v === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': v === 0 ? 1.25 : 1 }, s);
        const t = svg('text', { x: X(v), y: top - 12, 'font-size': 11, 'text-anchor': 'middle', fill: 'var(--ink-3)', class: 'num' }, s); t.textContent = fmt.pct(v, 0);
      });
      rows.forEach((r, i) => {
        const y = top + i * rowH + rowH / 2;
        const t = svg('text', { x: 0, y: y + 4, 'font-size': 12.5, fill: 'var(--ink)' }, s); t.textContent = r.name;
        svg('rect', { x: Math.min(X(0), X(r.a)), y: y - 6, width: Math.max(1.5, Math.abs(X(r.a) - X(0))), height: 12, rx: 3, fill: r.a < 0 ? 'var(--loss)' : 'var(--gain)', opacity: 0.85 }, s);
        const m = svg('path', { d: `M${X(r.p)} ${y - 8} l6 8 l-6 8 l-6 -8 z`, fill: 'var(--panel)', stroke: 'var(--ink)', 'stroke-width': 1.5 }, s);
        m.addEventListener('mousemove', e => C.tip(`<b>${esc(r.name)}</b><br>Actual ${fmt.pct(r.a)} · Modeled ${fmt.pct(r.p)}`, e.clientX, e.clientY));
        m.addEventListener('mouseleave', () => C.tip(null));
        const vt = svg('text', { x: W - 4, y: y + 4, 'font-size': 11.5, 'text-anchor': 'end', fill: 'var(--ink-2)', class: 'num' }, s); vt.textContent = fmt.pct(r.a, 0);
      });
      const fx = ep.shown || ep.factors;
      const items = [['Real yield', fmt.signed(fx.RR * 100, 0, 'bp')], ['Breakeven', fmt.signed(fx.BE * 100, 0, 'bp')], ['Credit', fmt.signed(fx.CREDIT * 100, 0, 'bp')], ['Dollar', fx.USD == null ? '–' : fmt.pct(Math.expm1(fx.USD), 0)], ['Oil', fmt.pct(Math.expm1(fx.OIL), 0)], ['Copper', fmt.pct(Math.expm1(fx.CU), 0)], ['AI chips vs market', fmt.pct(Math.expm1(fx.SEMI), 0)], ['China vs market', fmt.pct(Math.expm1(fx.CHINA), 0)]];
      facts.innerHTML = items.map(([k, v]) => `<span class="chip" style="cursor:default">${k} <b class="num">${v}</b></span>`).join('');
      cap.innerHTML = `${esc(ep.title)}, ${esc(ep.range)}. Bars show what happened; diamonds show what the measured factors predicted, with betas estimated on the other months. ${ep.note ? esc(ep.note) + ' ' : ''}Average miss ${ep.mae.toFixed(0)} points.`;
    }
    // rolling sensitivity to real yields
    const rbHost = host.querySelector('.roll-chart'), rbChips = host.querySelector('.roll-chips');
    const R = data.rolling; let picks = ['NVDA', 'ROK', '6954.T', 'SYM'].filter(s => R.series[s]);
    Object.keys(R.series).forEach(sym => {
      const st = data.stocks.find(s => s.yahoo === sym); const nm = st ? st.short : sym;
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(picks.includes(sym)) }, `<i class="sw"></i>${esc(nm)}`);
      b.addEventListener('click', () => { picks = picks.includes(sym) ? picks.filter(x => x !== sym) : picks.concat([sym]).slice(-4); rbChips.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false')); rbChips.querySelectorAll('.chip').forEach(x => { const idx = picks.indexOf(x.dataset.sym); x.setAttribute('aria-pressed', String(idx >= 0)); x.querySelector('.sw').style.background = idx >= 0 ? MIX_COLORS[idx] : 'var(--mid)'; }); drawRoll(); });
      b.dataset.sym = sym; rbChips.appendChild(b);
    });
    rbChips.querySelectorAll('.chip').forEach(x => { const idx = picks.indexOf(x.dataset.sym); x.querySelector('.sw').style.background = idx >= 0 ? MIX_COLORS[idx] : 'var(--mid)'; });
    function drawRoll() {
      const W = Math.max(320, rbHost.clientWidth || 600), H = 250, l = 46, rr = 12, t = 14, b = 26;
      const n = R.dates.length;
      const vals = picks.flatMap(p => R.series[p].filter(v => v != null));
      let lo = Math.min(-0.3, ...vals), hi = Math.max(0.1, ...vals);
      const X = i => l + i / (n - 1) * (W - l - rr), Y = v => t + (hi - v) / (hi - lo) * (H - t - b);
      rbHost.innerHTML = '';
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Rolling 36-month sensitivity to the real 10-year yield' }, rbHost);
      C.ticks(lo, hi, 5).forEach(v => {
        svg('line', { x1: l, x2: W - rr, y1: Y(v), y2: Y(v), stroke: Math.abs(v) < 1e-9 ? 'var(--axis)' : 'var(--grid)' }, s);
        const tx = svg('text', { x: l - 6, y: Y(v) + 4, 'font-size': 11, 'text-anchor': 'end', fill: 'var(--ink-3)', class: 'num' }, s); tx.textContent = fmt.pct(v, 0);
      });
      R.dates.forEach((d, i) => { if (d.endsWith('-01') && Number(d.slice(0, 4)) % 2 === 0) { const tx = svg('text', { x: X(i), y: H - 8, 'font-size': 11, 'text-anchor': 'middle', fill: 'var(--ink-3)' }, s); tx.textContent = d.slice(0, 4); } });
      picks.forEach((p, k) => {
        const arr = R.series[p]; let dstr = '';
        arr.forEach((v, i) => { if (v == null) return; dstr += (dstr ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
        svg('path', { d: dstr, fill: 'none', stroke: MIX_COLORS[k], 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
      });
      // hover crosshair
      const cross = svg('line', { y1: t, y2: H - b, stroke: 'var(--ink-3)', 'stroke-width': 1, opacity: 0 }, s);
      const hit = svg('rect', { x: l, y: t, width: W - l - rr, height: H - t - b, fill: 'transparent' }, s);
      hit.addEventListener('mousemove', e => {
        const r = s.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W; const i = Math.max(0, Math.min(n - 1, Math.round((x - l) / (W - l - rr) * (n - 1))));
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 0.6);
        C.tip(`<b>${R.dates[i]}</b><br>` + picks.map((p, k) => { const st = data.stocks.find(z => z.yahoo === p); return `<span style="color:${MIX_COLORS[k]}">●</span> ${esc(st ? st.short : p)} ${R.series[p][i] == null ? 'n/a' : fmt.pct(R.series[p][i])}`; }).join('<br>'), e.clientX, e.clientY);
      });
      hit.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); C.tip(null); });
    }
    new ResizeObserver(() => { drawEp(); drawRoll(); }).observe(host);
    drawEp(); drawRoll();
  }

  // ---------- CSV import and add-a-company ----------
  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const head = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
    return { head, rows };
  }
  function Importer(host, data, onAdded) {
    const drop = host.querySelector('.drop'), file = host.querySelector('#csv-file'), status = host.querySelector('.import-status');
    const form = host.querySelector('#add-form');
    function handle(text, name) {
      try {
        const { head, rows } = parseCSV(text);
        const iDate = head.findIndex(h => /date/i.test(h));
        let iVal = head.findIndex(h => /^adj\.? ?close/i.test(h));
        if (iVal < 0) iVal = head.findIndex(h => /^close/i.test(h));
        if (iDate < 0 || iVal < 0) throw new Error('Expected a Date column and a Close or Adj Close column, as in a Yahoo Finance download.');
        const pts = rows.map(r => [r[iDate], parseFloat(r[iVal])]).filter(([d, v]) => /^\d{4}-\d{2}/.test(d) && isFinite(v) && v > 0).sort((a, b) => a[0] < b[0] ? -1 : 1);
        // last close in each month
        const byMonth = new Map(); pts.forEach(([d, v]) => byMonth.set(d.slice(0, 7), v));
        const months = data.factorTable.months;
        const px = months.map(m => byMonth.get(m)).map(v => v == null ? null : v);
        const names = data.factorTable.names || data.factors.monthly.names;
        const keep = names.map((n, k) => k).filter(k => names[k] !== 'JPY');
        const y = [], X = [];
        for (let i = 1; i < months.length; i++) {
          if (px[i] == null || px[i - 1] == null) continue;
          y.push(Math.log(px[i] / px[i - 1])); X.push(keep.map(k => data.factorTable.rows[i][k]));
        }
        if (y.length < 18) throw new Error(`Found ${y.length} overlapping months; at least 18 are needed to estimate sensitivities.`);
        const fit = C.ols(y, X);
        if (!fit) throw new Error('The regression could not be solved. Try a longer price history.');
        const prior = data.factorTable.prior, tau = data.factorTable.tau;
        const beta = names.map(() => 0), se = names.map(() => 0);
        keep.forEach((k, j) => {
          const s = fit.se[j + 1], wd = 1 / (s * s), wp = 1 / (tau[k] * tau[k]);
          beta[k] = (fit.beta[j + 1] * wd + prior[k] * wp) / (wd + wp); se[k] = Math.sqrt(1 / (wd + wp));
        });
        status.textContent = `Read ${pts.length} prices from ${name} and fit ${y.length} months (R² ${fit.r2.toFixed(2)}). Fill in the company details below to add it to the simulator.`;
        form.dataset.beta = JSON.stringify(beta); form.dataset.se = JSON.stringify(se); form.dataset.n = y.length; form.dataset.r2 = fit.r2;
        form.querySelector('#add-last').value = pts[pts.length - 1][1];
        form.hidden = false;
        const nm = form.querySelector('#add-name'); if (!nm.value) nm.value = name.replace(/\.csv$/i, '');
        nm.focus();
      } catch (err) { status.textContent = err.message; }
    }
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) f.text().then(t => handle(t, f.name)); });
    file.addEventListener('change', () => { const f = file.files[0]; if (f) f.text().then(t => handle(t, f.name)); });
    host.querySelector('.sample').addEventListener('click', () => {
      // a sample built from the snapshot itself (Rockwell's month-end closes), to show the flow
      const st = data.stocks.find(s => s.yahoo === 'ROK'); const m = data.factorTable.months; const px = data.series.monthly.px.ROK;
      const csv = 'Date,Close\n' + m.map((d, i) => px[i + data.factorTable.offset] != null ? `${d}-28,${px[i + data.factorTable.offset]}` : null).filter(Boolean).join('\n');
      handle(csv, (st ? st.short : 'Sample') + ' sample.csv');
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const g = id => form.querySelector(id).value;
      const tmpl = data.templates[g('#add-type')];
      const mcap = Number(g('#add-mcap')), rev = Number(g('#add-rev')), m1 = Number(g('#add-margin')) / 100, g1 = Number(g('#add-growth')) / 100;
      if (!(mcap > 0) || !(rev > 0)) { status.textContent = 'Enter a market cap and revenue above zero.'; return; }
      const id = 'user-' + Date.now().toString(36);
      const beta = JSON.parse(form.dataset.beta || 'null');
      // a short name that does not collide with a company already on the page
      const full = g('#add-name') || 'New company', first = full.split(' ')[0];
      const short = data.stocks.some(x => (x.short || x.name) === first) ? full : first;
      const st = {
        id, ticker: g('#add-ticker') || 'NEW', yahoo: g('#add-ticker') || id, name: full, short,
        layer: g('#add-layer'), country: 'User', currency: 'USD', price: Number(g('#add-last')) || 100, exchange: 'Added by you', role: 'Added from an imported CSV with ' + tmpl.label.toLowerCase() + ' defaults.',
        hist: beta ? { monthly: { beta, se: JSON.parse(form.dataset.se), n: Number(form.dataset.n), r2: Number(form.dataset.r2) } } : null,
        fund: Object.assign(JSON.parse(JSON.stringify(tmpl.fund)), { mcap, rev, m1, g1, debt: 0, cash: 0, price: Number(g('#add-last')) || 100, eps: 0, sharesM: 100, fx: 1, cur: 'USD' }),
        profile: { what: 'Added in your browser. It stays on this page until you reload. Cash and debt were not entered, so the model assumes none.', userAdded: true }
      };
      st.fund.sharesM = st.fund.mcap * 1000 / st.price; st.fund.eps = rev * m1 * (1 - st.fund.tax) * 1000 / st.fund.sharesM;
      st.profile.pe = st.fund.eps > 0 ? st.price / st.fund.eps : null;
      M.calibrate(st);
      data.stocks.push(st);
      status.textContent = `Added ${st.name}. It now appears in the stack, the forces map and the simulator.`;
      form.reset(); form.hidden = true;
      onAdded(st.id);
    });
  }

  root.TorqueSections = { renderBackdrop, renderStack, Drawer, ForcesMap, Payback, HistoryLab, Importer, LAYERS, FORCES };
})(typeof window !== 'undefined' ? window : globalThis);
