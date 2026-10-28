#!/usr/bin/env python3
"""Download the price and macro history Torque needs and write it in the snapshot's plain-text format.

Each line of a raw file is  SYMBOL|CURRENCY-or-KIND|FIRST-PERIOD|v1,v2,...  with one value per month
(month-end) or per week (Friday). Prices are Yahoo Finance adjusted closes in the listing currency;
macro series come from FRED. If a download fails, the previous line for that series is kept, so one bad
request never wipes out history. The run fails without writing anything when too much is missing: any of the
three US benchmarks, any exchange rate, more than three other price series, or the core FRED rate series. The
workflow then keeps the last good data instead of publishing a refresh that only pretends to be new.
"""
import os, io, sys, time, datetime as dt
import numpy as np, pandas as pd, requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(os.environ.get('TORQUE_DATA_DIR', os.path.join(ROOT, 'data', 'raw')), '')
START = '2009-12-01'
WEEK_START = '2023-10-06'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'}

UNIVERSE = [('NVDA', 'USD'), ('TSLA', 'USD'), ('ISRG', 'USD'), ('TER', 'USD'), ('ROK', 'USD'), ('SYM', 'USD'), ('SERV', 'USD'),
            ('AUR', 'USD'), ('6954.T', 'JPY'), ('6506.T', 'JPY'), ('6324.T', 'JPY'), ('300124.SZ', 'CNY'), ('CGNX', 'USD'),
            ('HSAI', 'USD'), ('9880.HK', 'HKD'), ('688836.SS', 'CNY')]
MACRO = [('SPY', 'USD'), ('QQQ', 'USD'), ('IWM', 'USD'), ('SOXX', 'USD'), ('BOTZ', 'USD'), ('ARKK', 'USD'), ('KOID', 'USD'),
         ('XLI', 'USD'), ('ASHR', 'USD'), ('^N225', 'JPY'), ('^TNX', 'USD'), ('^IRX', 'USD'), ('DX-Y.NYB', 'USD'), ('JPY=X', 'JPY'),
         ('CNY=X', 'CNY'), ('HKD=X', 'HKD'), ('CL=F', 'USD'), ('HG=F', 'USD'), ('^VIX', 'USD'), ('HYG', 'USD'), ('TLT', 'USD'),
         ('REMX', 'USD')]
WEEKLY_MACRO = [x for x in MACRO if x[0] != 'QQQ']
# monthly FRED series: 'eop' = last daily value of the month, 'avg' = a series FRED already publishes monthly
FRED_M = [('DGS2', 'eop'), ('DFII10', 'eop'), ('T10YIE', 'eop'), ('BAMLH0A0HYM2', 'eop'), ('FEDFUNDS', 'avg'), ('NEWORDER', 'avg'),
          ('INDPRO', 'avg'), ('CES0500000003', 'avg'), ('UNRATE', 'avg'), ('CPIAUCSL', 'avg'), ('JTS3000JOL', 'avg'),
          ('GACDFSA066MSFRBPHI', 'avg'), ('NOCDFSA066MSFRBPHI', 'avg'), ('DTWEXBGS', 'eop')]
FRED_W = ['DGS2', 'DFII10', 'T10YIE', 'BAMLH0A0HYM2', 'DGS10']
FRED_CORE = ['DFII10', 'T10YIE', 'DGS10']   # the rate series every scenario starts from
MAX_PRICE_GAPS = 3                           # other price series that may be carried over from the last run


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------- sources ----------------
def yahoo_chart(sym):
    """Daily adjusted and raw closes from Yahoo's chart API, dated in the exchange's own time zone."""
    p1 = int(dt.datetime(2009, 12, 1, tzinfo=dt.timezone.utc).timestamp()); p2 = int(time.time()) + 86400
    last_err = None
    for host in ('query1', 'query2'):
        url = f'https://{host}.finance.yahoo.com/v8/finance/chart/{requests.utils.quote(sym, safe="")}'
        try:
            r = requests.get(url, params=dict(period1=p1, period2=p2, interval='1d', events='div,splits', includeAdjustedClose='true'),
                             headers=UA, timeout=30)
            if r.status_code != 200:
                last_err = f'HTTP {r.status_code}'; continue
            res = r.json()['chart']['result'][0]
            ts = res.get('timestamp') or []
            if not ts:
                last_err = 'empty'; continue
            tz = res['meta'].get('exchangeTimezoneName') or 'America/New_York'
            idx = pd.to_datetime(ts, unit='s', utc=True).tz_convert(tz).tz_localize(None).normalize()
            close = pd.Series(res['indicators']['quote'][0]['close'], index=idx, dtype=float)
            adj_list = (res['indicators'].get('adjclose') or [{}])[0].get('adjclose')
            adj = pd.Series(adj_list, index=idx, dtype=float) if adj_list else close.copy()
            close = close[~close.index.duplicated(keep='last')].dropna()
            adj = adj[~adj.index.duplicated(keep='last')].dropna()
            return adj, close
        except Exception as e:  # network error, JSON shape change
            last_err = repr(e)
        time.sleep(1.0)
    raise RuntimeError(f'Yahoo chart API failed for {sym}: {last_err}')


def yahoo_yf(syms):
    """Batch download through yfinance, which copes with Yahoo's cookie checks from cloud machines."""
    import yfinance as yf
    df = yf.download(syms, start=START, interval='1d', auto_adjust=False, group_by='ticker', threads=True, progress=False)
    out = {}
    for s in syms:
        try:
            sub = df[s] if isinstance(df.columns, pd.MultiIndex) else df
            idx = pd.to_datetime(sub.index)
            if getattr(idx, 'tz', None) is not None: idx = idx.tz_localize(None)
            idx = idx.normalize()
            close = pd.Series(sub['Close'].values, index=idx, dtype=float).dropna()
            adj = pd.Series((sub['Adj Close'] if 'Adj Close' in sub else sub['Close']).values, index=idx, dtype=float).dropna()
            if len(close) > 5: out[s] = (adj, close)
        except Exception as e:
            log('  yfinance gap for', s, repr(e))
    return out


def fred(series):
    url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}'
    last_err = None
    for attempt in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=60)
            if r.status_code == 200 and ',' in r.text[:200]:
                df = pd.read_csv(io.StringIO(r.text))
                s = pd.to_numeric(df.iloc[:, 1], errors='coerce')
                s.index = pd.to_datetime(df.iloc[:, 0])
                return s.dropna()
            last_err = f'HTTP {r.status_code}'
        except Exception as e:
            last_err = repr(e)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'FRED failed for {series}: {last_err}')


# ---------------- aggregation and text format ----------------
def fmt(v):
    return '' if v is None or not np.isfinite(v) else f'{v:.6g}'


def to_monthly(s):
    s = s[s.index >= '2010-01-01']
    m = s.groupby(s.index.to_period('M')).last()
    full = pd.period_range(m.index[0], m.index[-1], freq='M')
    return m.reindex(full)


def to_weekly(s, last_friday):
    s = s[s.index >= pd.Timestamp(WEEK_START) - pd.Timedelta(days=6)]
    wk = s.groupby(s.index.to_period('W-FRI')).last()
    wk.index = wk.index.end_time.normalize()
    full = pd.date_range(pd.Timestamp(WEEK_START), last_friday, freq='7D')
    return wk.reindex(full)


def line_m(sym, kind, m):
    return f"{sym}|{kind}|{m.index[0]}|{','.join(fmt(v) for v in m.values)}"


def line_w(sym, kind, wk):
    first = wk.first_valid_index()
    wk = wk.loc[first:] if first is not None else wk
    return f"{sym}|{kind}|{wk.index[0].date()}|{','.join(fmt(v) for v in wk.values)}"


def read_existing(path):
    out = {}
    if os.path.exists(path):
        for line in open(path):
            if line.strip() and not line.startswith('#'): out[line.split('|')[0]] = line.rstrip('\n')
    return out


def write(path, header, lines):
    with open(path, 'w') as fh:
        fh.write(header + '\n' + '\n'.join(lines) + '\n')


def main():
    os.makedirs(OUT, exist_ok=True)
    today = dt.date.today()
    last_friday = pd.Timestamp(today + dt.timedelta(days=(4 - today.weekday()) % 7))
    syms = [s for s, _ in UNIVERSE + MACRO]
    got, failed = {}, []
    try:
        got = yahoo_yf(syms)
        log(f'yfinance: {len(got)} of {len(syms)} tickers')
    except Exception as e:
        log('yfinance unavailable:', repr(e))
    for s in syms:
        if s in got: continue
        try:
            got[s] = yahoo_chart(s); time.sleep(0.4)
        except Exception as e:
            failed.append(s); log('  failed', s, e)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    us_dates = [got[s][1].index[-1] for s in ('SPY', 'NVDA', 'ROK') if s in got and len(got[s][1])]
    must = ['SPY', 'NVDA', 'ROK', 'JPY=X', 'CNY=X', 'HKD=X']
    missing_must = [s for s in must if s not in got]
    others_missing = [s for s in syms if s not in got and s not in must]
    if missing_must or len(others_missing) > MAX_PRICE_GAPS or len(us_dates) < 3:
        log(f'too much is missing (required: {missing_must or "none"}; others: {others_missing}); '
            'the previous data stays in place and this run fails')
        raise SystemExit(1)
    # nothing may run past the US close the refresh is dated by (an Asian session that opened later is left out)
    cut = max(us_dates)
    got = {k: (a[a.index <= cut], c[c.index <= cut]) for k, (a, c) in got.items()}

    # prices, built in memory first
    old_m1 = read_existing(OUT + 'raw_m1_universe_monthly.txt'); old_m2 = read_existing(OUT + 'raw_m2_macro_monthly.txt')
    m1 = [line_m(s, c, to_monthly(got[s][0])) if s in got else old_m1.get(s) for s, c in UNIVERSE]
    m2 = [line_m(s, c, to_monthly(got[s][0])) if s in got else old_m2.get(s) for s, c in MACRO]
    old_w = read_existing(OUT + 'raw_w_weekly.txt')
    wl = [line_w(s, c, to_weekly(got[s][0], last_friday)) if s in got else old_w.get(s) for s, c in UNIVERSE + WEEKLY_MACRO]

    # FRED, also in memory
    old_f = read_existing(OUT + 'raw_f_fred_monthly.txt'); old_fw = read_existing(OUT + 'raw_fw_fred_weekly.txt')
    fm, fw, cache, lastobs = [], [], {}, {}
    for sid, kind in FRED_M:
        try:
            ser = fred(sid); cache[sid] = ser[ser.index <= cut]; fm.append(line_m(sid, kind, to_monthly(cache[sid])))
        except Exception as e:
            log('  FRED failed', sid, e); fm.append(old_f.get(sid)); failed.append(sid)
    for sid in FRED_W:
        try:
            ser = cache[sid] if sid in cache else fred(sid)
            ser = ser[ser.index <= cut]
            fw.append(line_w(sid, 'eop', to_weekly(ser, last_friday)))
            lastobs[sid] = ser.index[-1].date().isoformat()   # weekly rows carry the week-end label; keep the real date
        except Exception as e:
            log('  FRED failed', sid, e); fw.append(old_fw.get(sid)); failed.append(sid)
    core_missing = [sid for sid in FRED_CORE if sid in failed]
    if core_missing:
        log(f'core FRED series missing ({core_missing}); the previous data stays in place and this run fails')
        raise SystemExit(1)

    # meta: as-of date, latest raw closes for market values, real last-observation dates, Fed target range.
    # Lines this run could not refresh are carried forward from the previous run.
    old_meta = read_existing(OUT + 'raw_meta.txt')
    asof = cut.date().isoformat()
    meta = {'fetched': f'fetched|{stamp}', 'asof': f'asof|{asof}'}
    for s, _ in UNIVERSE:
        if s in got and len(got[s][1]):
            meta[f'last:{s}'] = f'last:{s}|{got[s][1].iloc[-1]:.6g}|{got[s][1].index[-1].date()}'
    for sid, d in lastobs.items():
        meta[f'lastobs:{sid}'] = f'lastobs:{sid}|{d}'
    try:
        lo, hi = fred('DFEDTARL'), fred('DFEDTARU')
        changed = hi[hi.diff() != 0].index[-1].date().isoformat()
        meta['fedtarget'] = f'fedtarget|{lo.iloc[-1]:.2f}|{hi.iloc[-1]:.2f}|{changed}'
    except Exception as e:
        log('  Fed target range unavailable, keeping the previous value', e)
    for k, line in old_meta.items():
        if k not in meta: meta[k] = line

    # everything checked: write the files together
    write(OUT + 'raw_m1_universe_monthly.txt', f'# Yahoo Finance adjusted month-end closes, local currency, fetched {stamp}', [x for x in m1 if x])
    write(OUT + 'raw_m2_macro_monthly.txt', f'# Yahoo Finance month-end closes for funds, indices, currencies and futures, fetched {stamp}', [x for x in m2 if x])
    write(OUT + 'raw_w_weekly.txt', f'# Yahoo Finance adjusted Friday closes (the current week uses its latest close), fetched {stamp}', [x for x in wl if x])
    write(OUT + 'raw_f_fred_monthly.txt', f'# FRED monthly: eop = last daily value of the month; avg = FRED monthly series, fetched {stamp}', [x for x in fm if x])
    write(OUT + 'raw_fw_fred_weekly.txt', f'# FRED Friday values (the current week uses its latest value), fetched {stamp}', [x for x in fw if x])
    write(OUT + 'raw_meta.txt', '# refresh metadata', list(meta.values()))
    log(f'done: as of {asof}; {len(failed)} series kept from the previous run' + (f' ({", ".join(failed)})' if failed else ''))
    return failed


if __name__ == '__main__':
    main()
