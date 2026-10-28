import os, pandas as pd, numpy as np
D = os.path.join(os.environ.get('TORQUE_DATA_DIR', '/home/claude/data'), '')
def _parse_monthly(path):
    out = {}
    for line in open(path).read().strip().split('\n'):
        if not line or line.startswith('#'): continue
        sym, cur, start, vals = line.split('|')
        vals = [float(v) if v != '' else np.nan for v in vals.split(',')]
        idx = pd.period_range(start, periods=len(vals), freq='M')
        out[sym] = pd.Series(vals, index=idx)
    return pd.DataFrame(out)
def _parse_weekly(path):
    out = {}
    for line in open(path).read().strip().split('\n'):
        if not line or line.startswith('#'): continue
        sym, cur, start, vals = line.split('|')
        vals = [float(v) if v != '' else np.nan for v in vals.split(',')]
        idx = pd.date_range(start, periods=len(vals), freq='7D')
        out[sym] = pd.Series(vals, index=idx)
    return pd.DataFrame(out)
def monthly():
    m = pd.concat([_parse_monthly(D+'raw_m1_universe_monthly.txt'), _parse_monthly(D+'raw_m2_macro_monthly.txt'), _parse_monthly(D+'raw_f_fred_monthly.txt')], axis=1)
    return m.sort_index()
def weekly():
    w = pd.concat([_parse_weekly(D+'raw_w_weekly.txt'), _parse_weekly(D+'raw_fw_fred_weekly.txt')], axis=1)
    return w.sort_index()
UNIV = ['NVDA','TSLA','ISRG','TER','ROK','SYM','SERV','AUR','6954.T','6506.T','6324.T','300124.SZ','CGNX','HSAI','9880.HK']
CUR = {'6954.T':'JPY=X','6506.T':'JPY=X','6324.T':'JPY=X','300124.SZ':'CNY=X','9880.HK':'HKD=X','688836.SS':'CNY=X'}
# listed too recently for a regression; estimated once it has enough months, otherwise it carries a peer prior
YOUNG = ['688836.SS']
# trading start for SPAC names (exclude pre-merger trust prices)
START = {'SYM':'2022-06','AUR':'2021-11','SERV':'2024-04'}
def usd_prices(df):
    out = df.copy()
    for s, fx in CUR.items():
        if s in df.columns: out[s] = df[s] / df[fx]
    return out
def asof():
    # the last trading date in the snapshot, written by the fetcher; the October 2026 snapshot predates it
    p = D + 'raw_meta.txt'
    if os.path.exists(p):
        for line in open(p):
            if line.startswith('asof|'): return line.strip().split('|')[1]
    return '2026-10-26'
def meta():
    out = {}
    p = D + 'raw_meta.txt'
    if os.path.exists(p):
        for line in open(p):
            parts = line.strip().split('|')
            if len(parts) >= 2: out[parts[0]] = parts[1:]
    return out
