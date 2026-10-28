"""Assemble TORQUE_DATA for the site from the verified snapshot, model estimates and company profiles."""
import os, json, math, datetime as dt, numpy as np, pandas as pd, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import load, factors as f, estimate as est
from fundamentals import FUND, FX
import profiles

OUT = os.environ.get('TORQUE_OUT', '/home/claude/site/src/data.js')
OUT_JSON = os.environ.get('TORQUE_OUT_JSON')          # the GitHub Pages copy reads data/latest.json
PAGES = os.environ.get('TORQUE_PAGES') == '1'
SNAPSHOT = '2026-10-27'                                # date of the research pass behind the company profiles (Oct 26 closes)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
def long_date(iso):
    d = dt.date.fromisoformat(iso); return f"{MONTHS[d.month - 1]} {d.day}, {d.year}"
def short_date(iso):
    d = dt.date.fromisoformat(iso); return f"{MONTHS[d.month - 1][:3]} {d.day}, {d.year}"

# ---------- universe meta ----------
META = [
  # id, yahoo, ticker, name, short, layer, country, exchange, currency, role
  ('nvda', 'NVDA', 'NVDA', 'NVIDIA', 'NVIDIA', 'brain', 'US', 'Nasdaq', 'USD', 'Robot computers and AI training chips; robotics is a small part of a data-center business'),
  ('cgnx', 'CGNX', 'CGNX', 'Cognex', 'Cognex', 'senses', 'US', 'Nasdaq', 'USD', 'Machine vision for factories and warehouses'),
  ('hsai', 'HSAI', 'HSAI', 'Hesai Group', 'Hesai', 'senses', 'China', 'Nasdaq', 'USD', 'Lidar for cars and robots, with US-China policy risk'),
  ('hds', '6324.T', '6324.T', 'Harmonic Drive Systems', 'Harmonic Drive', 'muscles', 'Japan', 'Tokyo', 'JPY', 'Strain wave gears in robot joints, priced for humanoid demand'),
  ('yaskawa', '6506.T', '6506.T', 'Yaskawa Electric', 'Yaskawa', 'muscles', 'Japan', 'Tokyo', 'JPY', 'Servo motors and drives, plus Motoman robots'),
  ('inovance', '300124.SZ', '300124.SZ', 'Shenzhen Inovance', 'Inovance', 'muscles', 'China', 'Shenzhen', 'CNY', 'China\'s servo and controls leader, taking share from Japanese suppliers'),
  ('fanuc', '6954.T', '6954.T', 'Fanuc', 'Fanuc', 'bodies', 'Japan', 'Tokyo', 'JPY', 'The largest industrial robot maker, sensitive to the yen and China'),
  ('ter', 'TER', 'TER', 'Teradyne', 'Teradyne', 'bodies', 'US', 'Nasdaq', 'USD', 'Universal Robots cobots and MiR mobile robots inside an AI chip-test business'),
  ('isrg', 'ISRG', 'ISRG', 'Intuitive Surgical', 'Intuitive', 'bodies', 'US', 'Nasdaq', 'USD', 'The most profitable robot business: da Vinci surgical systems'),
  ('tsla', 'TSLA', 'TSLA', 'Tesla', 'Tesla', 'bodies', 'US', 'Nasdaq', 'USD', 'Optimus humanoids and robotaxis account for much of the value; car sales fund the business'),
  ('ubtech', '9880.HK', '9880.HK', 'UBTech Robotics', 'UBTech', 'bodies', 'China', 'Hong Kong', 'HKD', 'Walker S humanoids for factories, a pre-profit pure play'),
  ('rok', 'ROK', 'ROK', 'Rockwell Automation', 'Rockwell', 'deployers', 'US', 'NYSE', 'USD', 'US factory automation and reshoring; owns Clearpath and OTTO mobile robots'),
  ('sym', 'SYM', 'SYM', 'Symbotic', 'Symbotic', 'deployers', 'US', 'Nasdaq', 'USD', 'Warehouse automation with a large Walmart backlog'),
  ('serv', 'SERV', 'SERV', 'Serve Robotics', 'Serve', 'deployers', 'US', 'Nasdaq', 'USD', 'Sidewalk delivery robots, pre-profit'),
  ('aur', 'AUR', 'AUR', 'Aurora Innovation', 'Aurora', 'deployers', 'US', 'Nasdaq', 'USD', 'Driverless trucks on Texas freight lanes, pre-revenue scale'),
  ('unitree', '688836.SS', '688836.SS', 'Unitree Robotics', 'Unitree', 'bodies', 'China', 'Shanghai STAR', 'CNY', 'Quadrupeds and low-cost humanoids, profitable and newly listed'),
]
IPO = {'unitree': dict(price=150.80, date='2026-08-19')}

def quote_snapshot():
    q = {}
    path = load.D + 'raw_q_yahoo_quote_snapshot.txt'
    if not os.path.exists(path): return q
    for line in open(path):
        if line.startswith('#') or not line.strip(): continue
        p = line.strip().split('|')
        fl = lambda x: float(x) if x not in ('', None) else None
        q[p[0]] = dict(currency=p[1], price=fl(p[2]), mcap=fl(p[3]), shares=fl(p[4]), pe_ttm=fl(p[5]), pe_fwd=fl(p[6]), eps_ttm=fl(p[7]),
                       eps_fwd=fl(p[8]), lo52=fl(p[9]), hi52=fl(p[10]), next_earn=p[13] or None, div=fl(p[14]))
    return q

def main():
    m = load.monthly(); w = load.weekly()
    betas = json.load(open(os.path.join(HERE, 'betas.json')))
    epis = json.load(open(os.path.join(HERE, 'episodes.json')))
    q = quote_snapshot()
    meta = load.meta()
    ASOF = load.asof()
    last_close = {k[5:]: (float(v[0]), v[1]) for k, v in meta.items() if k.startswith('last:') and len(v) >= 2}
    lastobs = {k[8:]: v[0] for k, v in meta.items() if k.startswith('lastobs:') and v}
    fx_now = {'USD': 1.0, 'JPY': float(m['JPY=X'].dropna().iloc[-1]), 'CNY': float(m['CNY=X'].dropna().iloc[-1]), 'HKD': float(m['HKD=X'].dropna().iloc[-1])}
    ybase = pd.Period(f"{int(ASOF[:4]) - 1}-12", 'M')          # year-to-date runs from the December before the as-of date
    stocks = []
    for (id, yh, tk, name, short, layer, country, exch, cur, role) in META:
        fd = dict(FUND[id]); fd['pass'] = fd.pop('pass_')
        basis = fd.pop('basis', {})
        assert fd['cur'] == cur, id
        fx = FX[cur]
        repc = fd.pop('rep', cur)
        # market data from the research pass (Oct 26 closes, economic share counts); the Yahoo snapshot is a cross-check
        fd.update(fx=fx, floating=fd.get('floating', 0.0))
        # after a refresh, market value follows the latest close and every dollar amount that was converted from a
        # local currency follows the latest exchange rate; balance sheets and forecasts stay at the research pass
        if yh in last_close and last_close[yh][0] > 0:
            fd['mcap'] = fd['mcap'] * last_close[yh][0] / fd['price'] * FX[cur] / fx_now[cur]; fd['price'] = last_close[yh][0]
            k_rep = FX[repc] / fx_now[repc]
            for k in ('cash', 'debt', 'rev', 'burn'): fd[k] = fd[k] * k_rep
            fd['fx'] = fx_now[cur]
        for k in ('mcap', 'cash', 'debt', 'rev', 'burn'): fd[k] = round(fd[k], 4)
        qq = q.get(yh)
        if qq and qq.get('price'):
            gap = abs(qq['price'] / fd['price'] - 1)
            if gap > 0.06: print(f'  note: {id} research price {fd["price"]} vs Yahoo {qq["price"]} ({gap:.0%})')
        hist = {}
        for lens in ('monthly', 'weekly'):
            b = betas[lens]['stocks'][yh]
            hist[lens] = dict(beta=b['beta'], se=b['se'], r2=b['r2'], n=b['n'])
        # performance in local currency: year to date and one year, or since listing
        perf = dict(ytd=None, y1=None)
        if yh in m.columns and m[yh].dropna().shape[0] > 1:
            px = m[yh].dropna()
            perf['ytd'] = float(fd['price'] / px.loc[ybase] - 1) if ybase in px.index else None
            perf['y1'] = float(fd['price'] / px.iloc[-13] - 1) if len(px) > 13 else None
        if id in IPO:
            perf['ipo'] = round(fd['price'] / IPO[id]['price'] - 1, 4); perf['ipoDate'] = IPO[id]['date']
        prof = profiles.load_profile(id, basis, ASOF)
        # forward P/E on the model's own next-12-month EPS, so the drawer and the bridge table agree
        prof['pe'] = round(fd['price'] / fd['eps'], 1) if fd['eps'] > 0 else None
        stocks.append(dict(id=id, yahoo=yh, ticker=tk, name=name, short=short, layer=layer, country=country, exchange=exch,
                           currency=cur, price=fd['price'], role=role, perf=perf, hist=hist, fund=fd, profile=prof))
    bench = {}
    for s in ('SPY', 'BOTZ'):
        bench[s] = {'hist': {lens: dict(beta=betas[lens]['stocks'][s]['beta'], se=betas[lens]['stocks'][s]['se'], r2=betas[lens]['stocks'][s]['r2'], n=betas[lens]['stocks'][s]['n']) for lens in ('monthly', 'weekly')}}
    # factor table for in-browser estimation of imported stocks
    D, FN = f.monthly_factors('2014-01')
    months = [str(p) for p in D.index]
    rows = [[round(float(v), 6) for v in D.loc[p, FN].values] for p in D.index]
    long_names = ['NVDA', 'TSLA', 'ISRG', 'TER', 'ROK', '6954.T', '6506.T', '6324.T', '300124.SZ', 'CGNX']
    B = np.array([betas['monthly']['stocks'][s]['beta'] for s in long_names])
    prior = B.mean(axis=0).round(5).tolist(); tau = np.maximum(B.std(axis=0), 0.05).round(5).tolist()
    start = m.index[0]
    offset = int((D.index[0] - start).n)
    px_series = {s: [None if pd.isna(v) else round(float(v), 4) for v in m[s].values] for s in ['ROK']}
    # rolling 36-month real-yield sensitivity (reduced model for stability)
    RF = ['RR', 'CREDIT', 'SEMI', 'MKT']
    roll_syms = ['NVDA', 'TSLA', 'ISRG', 'TER', 'ROK', '6954.T', '6506.T', '6324.T', '300124.SZ', 'CGNX', 'SYM', 'BOTZ']
    rdates = [str(p) for p in D.index[35:]]
    rseries = {}
    for s in roll_syms:
        vals = []
        for i in range(35, len(D)):
            win = D.iloc[i - 35:i + 1]
            y = win[s]
            st = load.START.get(s)
            if st: y = y[y.index >= pd.Period(st, 'M')]
            y = y.dropna()
            if len(y) < 30: vals.append(None); continue
            X = win.loc[y.index, RF].values
            b, se, r2, e = f.ols(y.values, X)
            vals.append(round(float(np.expm1(b[1])), 4))
        rseries[s] = vals
    # backdrop strip
    def last(col, src=m):
        sr = src[col].dropna(); return float(sr.iloc[-1])
    def spark(col, n=24, src=m):
        sr = src[col].dropna()
        vals = [round(float(v), 4) for v in sr.iloc[-n:].values]
        if src is m and col in w.columns and len(sr) and w[col].dropna().shape[0]:
            wk = w[col].dropna()
            if pd.Period(wk.index[-1], 'M') > sr.index[-1]: vals = (vals + [round(float(wk.iloc[-1]), 4)])[-n:]
        return vals
    def yago(col):
        sr = m[col].dropna(); return float(sr.iloc[-13])
    botz = m['BOTZ'].dropna(); koid = m['KOID'].dropna()
    def wlast(col):
        sr = w[col].dropna() if col in w.columns else pd.Series(dtype=float)
        if not len(sr): return (None, None)
        d = lastobs.get(col) or sr.index[-1].date().isoformat()
        return (float(sr.iloc[-1]), min(d, ASOF))
    def wago(col, weeks=52):
        sr = w[col].dropna(); return float(sr.iloc[-1 - weeks]) if len(sr) > weeks else None
    def pp(a, b): return f"{a - b:+.2f}pp vs a year ago".replace('-', '−')
    def pct(a, b, d=0): return f"{(a / b - 1) * 100:+.{d}f}% vs a year ago".replace('-', '−')
    y10, y10d = wlast('DGS10'); rr, rrd = wlast('DFII10'); hy, hyd = wlast('BAMLH0A0HYM2')
    phl = m['GACDFSA066MSFRBPHI'].dropna()
    cycle_now = dict(value=round(float(phl.iloc[-1]), 1), month=f"{MONTHS[phl.index[-1].month - 1][:3]} {phl.index[-1].year}")
    fed = meta.get('fedtarget')
    fedText = f"{float(fed[0]):.2f}–{float(fed[1]):.2f}%" if fed else '3.75–4.00%'
    fedNote = f"Since {short_date(fed[2])}" if fed and len(fed) > 2 else 'Raised 25bp on Sep 16'
    backdrop = [
      dict(label='10-year Treasury', valueText=f"{y10:.2f}%", change=y10 - wago('DGS10'), changeText=pp(y10, wago('DGS10')), goodUp=None, spark=spark('^TNX'), source=f'FRED DGS10, {short_date(y10d)}'),
      dict(label='Real 10-year yield', valueText=f"{rr:.2f}%", change=rr - wago('DFII10'), changeText=pp(rr, wago('DFII10')), goodUp=None, spark=spark('DFII10'), source=f'FRED DFII10, {short_date(rrd)}'),
      dict(label='Fed funds target', valueText=fedText, change=None, changeText=fedNote, goodUp=None, spark=spark('FEDFUNDS'), source='Federal Reserve target range; line shows FRED FEDFUNDS'),
      dict(label='WTI crude', valueText=f"${last('CL=F'):.2f}", change=last('CL=F') / yago('CL=F') - 1, changeText=pct(last('CL=F'), yago('CL=F')), goodUp=None, spark=spark('CL=F'), source='Yahoo Finance CL=F'),
      dict(label='Copper', valueText=f"${last('HG=F'):.2f}/lb", change=last('HG=F') / yago('HG=F') - 1, changeText=pct(last('HG=F'), yago('HG=F')), goodUp=None, spark=spark('HG=F'), source='Yahoo Finance HG=F'),
      dict(label='Yen per dollar', valueText=f"{last('JPY=X'):.1f}", change=last('JPY=X') / yago('JPY=X') - 1, changeText=pct(last('JPY=X'), yago('JPY=X'), 1), goodUp=None, spark=spark('JPY=X'), source='Yahoo Finance JPY=X'),
      dict(label='High-yield spread', valueText=f"{hy:.2f}%", change=None, changeText=f'ICE BofA index, {short_date(hyd)[:-6]}', goodUp=None, spark=spark('BAMLH0A0HYM2'), source='FRED BAMLH0A0HYM2'),
      dict(label='BOTZ robotics ETF', valueText=f"${float(botz.iloc[-1]):.2f}", change=float(botz.iloc[-1] / botz.loc[ybase] - 1), changeText=f"{float(botz.iloc[-1] / botz.loc[ybase] - 1) * 100:+.1f}% this year".replace('-', '−'), goodUp=True, spark=spark('BOTZ'), source='Yahoo Finance BOTZ'),
    ]
    # episodes with display labels
    short = {'china2015': '2015 China', 'trade2018': '2018 trade war', 'covid2020': '2020 crash', 'reflation': '2020 reflation', 'rates2022': '2022 rates', 'ai2023': '2023 AI rally', 'tariff2025': '2025 tariffs', 'oil2026': '2026 oil and rates'}
    notes = {
      'rates2022': 'The model was close for the industrial incumbents and too gentle on the growth names.',
      'ai2023': 'Company news dominated: NVIDIA, Symbotic and Aurora ran far past anything macro explains.',
      'oil2026': 'Semis beat the market by about 36%, which the model expected robotics to share. Most robotics stocks did not follow.',
      'covid2020': 'Two months is too short for macro betas to separate winners from losers.',
      'tariff2025': 'Chinese names rallied on domestic policy while US and Japanese automation sold off.'
    }
    def mon(p):
        y, mm = p.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][int(mm) - 1] + ' ' + y
    for e in epis:
        e['short'] = short[e['key']]; e['range'] = f"{mon(e['start'])} to {mon(e['end'])}"; e['note'] = notes.get(e['key'], '')
    presets = [
      dict(key='rates-up', label='10-year +100bp', scn=dict(dy10=100, cause='term')),
      dict(key='rates-down', label='10-year −100bp, Fed easing', scn=dict(dy10=-100, cause='policy')),
      dict(key='stagflation', label='Oil shock, inflation scare', scn=dict(dy10=75, cause='inflation', oil=35, credit=120, mood=-8, usd=3, wages=0.5, cycle=-8)),
      dict(key='soft-landing', label='Soft landing', scn=dict(dy10=-75, cause='policy', mood=6, credit=-60, cycle=6)),
      dict(key='recession', label='Recession', scn=dict(dy10=-120, cause='growth', oil=-35, copper=-25, cycle=-25, credit=300, mood=-18, china=-8, semis=-15)),
      dict(key='ai-digestion', label='AI capex pause', scn=dict(semis=-30, mood=-6, credit=60)),
      dict(key='humanoids', label='Humanoids arrive early', scn=dict(timeline=-2, semis=8, china=5, mood=4, funding=0.8)),
      dict(key='magnets', label='Magnet embargo', scn=dict(magnets=2, china=-5, copper=8, mood=-3)),
      dict(key='tariffs', label='High tariffs', scn=dict(tariff=20, usd=3, china=-10, mood=-5, cycle=-6)),
      dict(key='yen', label='Yen surge', scn=dict(jpy=-15, usd=-4)),
      dict(key='labor', label='Tight labor market', scn=dict(wages=1.5, cycle=4, dy10=30, cause='inflation')),
      dict(key='pricewar', label='China price war', scn=dict(pricewar=1, china=3)),
      dict(key='incident', label='Robotaxi incident', scn=dict(incident='av', mood=-2)),
    ]
    templates = {
      'cyclical': dict(label='Cyclical automation maker', fund=dict(g1=0.06, mT=0.18, tax=0.22, conv=0.85, beta=1.3, pass_=0.5, cm=0.4, endMix=dict(general=0.5, auto=0.2, electronics=0.2, logistics=0.1), region=dict(us=0.4, china=0.2, europe=0.2, row=0.2), revCcy=dict(USD=0.5, EUR=0.2, CNY=0.15, OTHER=0.15), costCcy=dict(USD=0.6, OTHER=0.4), costs=dict(metals=0.07, magnets=0.02, chips=0.06, labor=0.2, energy=0.02, imported=0.08), tariffRole='none', pwExposure=0.3, pwGain=0, chinaMagnets=False, opt=dict(share=0.03, dur=14, av=0, humanoid=0.05), burn=0, floating=0)),
      'growth': dict(label='Long-duration growth company', fund=dict(g1=0.25, mT=0.2, tax=0.2, conv=0.8, beta=1.8, pass_=0.35, cm=0.45, endMix=dict(logistics=0.4, general=0.3, consumer=0.3), region=dict(us=0.8, row=0.2), revCcy=dict(USD=0.85, OTHER=0.15), costCcy=dict(USD=0.85, OTHER=0.15), costs=dict(metals=0.05, magnets=0.01, chips=0.12, labor=0.25, energy=0.01, imported=0.06), tariffRole='domestic', pwExposure=0.1, pwGain=0, chinaMagnets=False, opt=dict(share=0.3, dur=14, av=0.1, humanoid=0.1), burn=0, floating=0)),
      'component': dict(label='Robot component supplier', fund=dict(g1=0.1, mT=0.2, tax=0.25, conv=0.8, beta=1.4, pass_=0.45, cm=0.5, endMix=dict(general=0.5, semis=0.2, electronics=0.2, research=0.1), region=dict(japan=0.3, china=0.25, us=0.2, europe=0.2, row=0.05), revCcy=dict(JPY=0.3, CNY=0.25, USD=0.2, EUR=0.2, OTHER=0.05), costCcy=dict(JPY=0.7, OTHER=0.3), costs=dict(metals=0.1, magnets=0.03, chips=0.03, labor=0.22, energy=0.02, imported=0.1), tariffRole='importer', pwExposure=0.45, pwGain=0, chinaMagnets=False, opt=dict(share=0.2, dur=14, av=0, humanoid=0.2), burn=0, floating=0)),
      'platform': dict(label='Platform megacap', fund=dict(g1=0.15, mT=0.3, tax=0.17, conv=0.85, beta=1.4, pass_=0.6, cm=0.6, endMix=dict(semis=0.5, consumer=0.3, research=0.2), region=dict(us=0.5, china=0.1, europe=0.15, row=0.25), revCcy=dict(USD=0.7, EUR=0.1, OTHER=0.2), costCcy=dict(USD=0.8, OTHER=0.2), costs=dict(metals=0.02, magnets=0.005, chips=0.15, labor=0.1, energy=0.01, imported=0.04), tariffRole='none', pwExposure=0.1, pwGain=0, chinaMagnets=False, opt=dict(share=0.15, dur=14, av=0.1, humanoid=0.1), burn=0, floating=0)),
    }
    for t in templates.values(): t['fund']['pass'] = t['fund'].pop('pass_')
    sources = [
      dict(data='Stock and ETF prices', source='Yahoo Finance chart data', link='https://finance.yahoo.com/', window='Monthly from 2010 or listing; weekly from Oct 2023'),
      dict(data='Real 10-year yield (DFII10)', source='FRED, St. Louis Fed', link='https://fred.stlouisfed.org/series/DFII10', window=f'2010 to {short_date(rrd)}'),
      dict(data='10-year breakeven inflation (T10YIE)', source='FRED', link='https://fred.stlouisfed.org/series/T10YIE', window=f"2010 to {short_date(wlast('T10YIE')[1])}"),
      dict(data='2-year and 10-year Treasury yields', source='FRED', link='https://fred.stlouisfed.org/series/DGS10', window=f'2010 to {short_date(y10d)}'),
      dict(data='High-yield credit spread', source='FRED, ICE BofA index (last three years only)', link='https://fred.stlouisfed.org/series/BAMLH0A0HYM2', window=f'Nov 2023 to {short_date(hyd)}; earlier months use a bond-ETF proxy'),
      dict(data='Philadelphia Fed manufacturing activity', source='FRED', link='https://fred.stlouisfed.org/series/GACDFSA066MSFRBPHI', window=f"2010 to {MONTHS[m['GACDFSA066MSFRBPHI'].dropna().index[-1].month - 1][:3]} {m['GACDFSA066MSFRBPHI'].dropna().index[-1].year}"),
      dict(data='Dollar index, yen, yuan, oil, copper', source='Yahoo Finance', link='https://finance.yahoo.com/', window=f'2010 to {short_date(ASOF)}'),
      dict(data='Company financials and guidance', source='Company filings and investor relations pages, linked in each profile', link='', window='Latest reported quarter'),
    ]
    limits = [
      'Macro factors explain 20% to 60% of monthly moves for most of these stocks. Company news drives most of the rest, and the simulator cannot anticipate it.',
      'Sensitivities change over time. The rolling chart shows real-yield sensitivity roughly doubling from 2019 to 2022 and fading since, so the long window and the recent window can disagree.',
      'The fundamentals lens uses our own driver profiles, built from filings and stated assumptions. Elasticities and cost shares are estimates. The 80% ranges show how far the model\'s own estimates move when those inputs are uncertain; they leave out company news, so real outcomes spread wider.',
      'The dollar, the factory cycle, tariffs, wages and the robotics forces come from the cash-flow model in both lenses, because history has no stable measure of them. Results for those forces rest on the driver profiles alone.',
      'In scenarios that also move credit and the market a long way, such as the recession preset, the history lens can count part of the cycle twice: past spread blowouts came with downturns, so its credit and market betas already carry some of that damage.',
      'Shocks are applied as if they happen at once, and their effects compound, so a 100bp cut lifts prices by more than a 100bp rise takes off. Very large moves, such as a 300bp rate shock, push the model past the range of its history.',
      'Returns are in dollars, so currency moves are part of the returns of Japanese, Chinese and Hong Kong stocks. Per-share figures in the detail panel are in the listing currency.',
      'Unitree listed on August 19, 2026, so its history lens is the peer average for Chinese growth names, with wide ranges.',
      f'Company inputs date from the {long_date(SNAPSHOT)} research pass, which used October 26 closes. Teradyne reports after the close that day, Aurora on October 28 and Unitree by October 31, so their inputs may trail their newest results.'
    ]
    method_html = (
      f'<p><b>History lens.</b> Monthly dollar returns from January 2014 to {MONTHS[D.index[-1].month - 1]} {D.index[-1].year} are regressed on the factors history measures reliably: the real 10-year yield, breakeven inflation, oil, copper, high-yield spreads, semiconductors against the market, China A-shares against the market and the part of the S&amp;P 500 that macro does not explain. The three Japanese makers also carry the yen, measured net of the S&amp;P 500. Short histories are pulled toward peer averages in proportion to their standard errors. A second window uses weekly returns since November 2023.</p>'
      '<p><b>Fundamentals lens.</b> Each company has a driver profile: revenue by end market, region and currency, cost shares for metals, magnets, chips, labor, energy and tariffed imports, pricing power, operating leverage, debt and cash. A twenty-year cash-flow model, with growth fading toward 3.5% and margins reaching their long-run level by year eight, is calibrated to today’s market value. The discount rate that reproduces the price is the company’s implied cost of capital, and the model’s sensitivity to it is the company’s duration. A scenario moves demand, costs, currency, funding and the value of future businesses through the cash flows, and moves the discount rate through that duration.</p>'
      '<p><b>Forces history cannot measure.</b> The dollar, the factory cycle, tariffs, wage growth, magnet supply, Chinese price competition, funding conditions, safety incidents and the humanoid timeline enter both lenses through the cash-flow model. Their measured betas are unstable or missing: dollar betas change sign depending on what else is in the regression, and survey-based activity indexes move after prices do. The two lenses therefore agree on these forces, and any gap between them comes from rates, credit, the market, oil, copper, chips, China and the yen.</p>'
      '<p><b>Why rates move.</b> A 10-year move is split into real yield and breakeven inflation according to its cause. Growth-led rises also lift expected cash flows and come with tighter credit and firmer activity, so the same 100bp does far less damage than a rise driven by term premium or Fed tightening. Inflation-led rises pass partly into nominal growth, by as much as each company can pass costs on.</p>'
      '<p><b>Blend and ranges.</b> The headline blends both lenses, equal-weighted by default. Each run draws 320 versions of the uncertain inputs: beta standard errors, demand elasticities, cost pass-through, operating leverage, duration, the risk-premium response, currency effects, price-war intensity, funding terms and the value of future businesses, shared across companies so the basket keeps their correlation. The 80% range is the spread of those model estimates. It leaves out company news, so actual outcomes spread wider. A rate move brings the dollar and yen moves that history pairs with it. Oil, copper, credit and the cycle follow the cause you pick, because their link to rates flips sign depending on why rates moved.</p>'
    )
    data = dict(
      asof=ASOF, asofShort=short_date(ASOF), asofLong=long_date(ASOF), profilesAsof=SNAPSHOT,
      factors={lens: dict(names=betas[lens]['factors'], cov=betas[lens]['cov'], link=betas[lens]['link'], proj=betas[lens]['proj'], window=betas[lens]['window'], obs=betas[lens]['obs']) for lens in ('monthly', 'weekly')},
      rf=round(y10, 3), cycleNow=cycle_now,
      stocks=stocks, benchmarks=bench, episodes=epis, presets=presets, templates=templates,
      factorTable=dict(months=months, rows=rows, prior=prior, tau=tau, offset=offset, names=FN),
      series=dict(monthly=dict(start=str(start), px=px_series)),
      rolling=dict(dates=rdates, series=rseries, factor='RR'),
      backdrop=backdrop, sources=sources, limits=limits, methodHtml=method_html,
      refreshNote=(f'Prices and macro series run to the {long_date(ASOF)} close and refresh each weekday after the US close through a scheduled workflow that pulls Yahoo Finance and FRED and re-estimates every sensitivity. Company profiles date from the {long_date(SNAPSHOT)} research pass; market values follow the latest prices.'
                   if PAGES else f'This copy holds the snapshot from the {long_date(ASOF)} close. The GitHub Pages copy refreshes each weekday after the US close through a scheduled workflow that pulls Yahoo Finance and FRED and re-estimates every sensitivity.')
    )
    payload = json.dumps(data, separators=(',', ':'), allow_nan=False)
    if OUT:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, 'w').write('window.TORQUE_DATA = ' + payload + ';\n')
        print('wrote', OUT, len(payload) // 1024, 'KB')
    if OUT_JSON:
        os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
        open(OUT_JSON, 'w').write(payload)
        print('wrote', OUT_JSON, len(payload) // 1024, 'KB')

if __name__ == '__main__':
    main()
