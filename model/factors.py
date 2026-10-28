import numpy as np, pandas as pd, load
def ols(y, X):
    X1 = np.column_stack([np.ones(len(X)), X])
    b, *_ = np.linalg.lstsq(X1, y, rcond=None)
    e = y - X1 @ b
    n, k = X1.shape
    s2 = e @ e / (n - k)
    XtXi = np.linalg.inv(X1.T @ X1)
    # Newey-West (lag 2) robust SE
    L = 2; S = np.zeros((k, k))
    for l in range(L + 1):
        w = 1 if l == 0 else 1 - l / (L + 1)
        G = (X1[l:] * e[l:, None]).T @ (X1[:n - l] * e[:n - l, None])
        S += w * (G if l == 0 else G + G.T)
    V = XtXi @ S @ XtXi
    r2 = 1 - (e @ e) / ((y - y.mean()) @ (y - y.mean()))
    return b, np.sqrt(np.diag(V)), r2, e
def resid(y, X):
    b, se, r2, e = ols(y, X); return e
def monthly_factors(start='2014-01'):
    m = load.monthly()
    m = m.copy()
    # a daily FRED series can lag the price data by a few days at month end: use the latest weekly value
    try:
        w = load.weekly()
        for col in ('DFII10', 'DGS2', 'T10YIE'):
            if col in m.columns and col in w.columns and pd.isna(m[col].iloc[-1]):
                m.loc[m.index[-1], col] = float(w[col].dropna().iloc[-1])
    except Exception:
        pass
    px = load.usd_prices(m)
    with np.errstate(divide='ignore', invalid='ignore'):
        r = np.log(px.where(px > 0)).diff()
    F = pd.DataFrame(index=m.index)
    F['RR'] = m['DFII10'].diff()                 # real 10y yield change, pp
    F['BE'] = m['T10YIE'].diff()                 # 10y breakeven change, pp
    F['USD'] = np.log(m['DX-Y.NYB']).diff()      # dollar
    F['JPY'] = np.log(m['JPY=X']).diff()         # + = yen weaker
    F['OIL'] = np.log(m['CL=F']).diff()
    F['CU'] = np.log(m['HG=F']).diff()
    # The factory cycle is not a history factor: monthly survey changes arrive after prices have moved, so their
    # betas are near zero for every industrial. The fundamentals lens carries the cycle in both lenses.
    # Credit: the actual ICE BofA high-yield spread change where FRED has it (Nov 2023 on); before that, high-yield
    # bond returns net of duration-matched Treasuries, demeaned to strip the bond carry (corr 0.79 with the spread).
    with np.errstate(all='ignore'):
        proxy = -(np.log(m['HYG']).diff() - 0.21 * np.log(m['TLT']).diff()) / 3.5 * 100 * 0.87
    proxy = proxy - proxy.loc[start:].mean()
    oas = m['BAMLH0A0HYM2'].diff() if 'BAMLH0A0HYM2' in m.columns else pd.Series(np.nan, index=m.index)
    F['CREDIT'] = oas.where(oas.notna(), proxy)
    raw = pd.DataFrame({'SPY': r['SPY'], 'SOXX': r['SOXX'], 'ASHR': r['ASHR']})
    D = pd.concat([F, raw, r], axis=1).loc[start:]
    D = D.loc[:, ~D.columns.duplicated()]
    return _finish(D, BASE)


# Currencies. The yen is a history factor only for the three Japanese makers, measured net of the S&P 500 so a
# risk-on rally is not read as a currency effect. The dollar is not a history factor at all: its measured betas
# change sign with the specification because dollar moves travel with risk appetite. For the dollar, and for the
# yen outside Japan, both lenses use the fundamentals lens's currency translation instead.
JPY_NAMES = ['6954.T', '6506.T', '6324.T']
BASE = ['RR', 'BE', 'JPY', 'OIL', 'CU', 'CREDIT']
DISPLAY = ['RR', 'BE', 'USD_RAW', 'JPY_RAW', 'OIL', 'CU', 'CREDIT', 'SEMI', 'CHINA']


def _finish(D, base):
    ok = D[base + ['USD', 'SPY', 'SOXX', 'ASHR']].dropna().index
    D = D.loc[ok].copy()
    D['USD_RAW'] = D['USD']; D['JPY_RAW'] = D['JPY']
    D['JPY'] = resid(D['JPY'].values, D[['SPY']].values)
    D['SEMI'] = resid(D['SOXX'].values, D[['SPY']].values)
    D['CHINA'] = resid(D['ASHR'].values, D[['SPY']].values)
    D['MKT'] = resid(D['SPY'].values, D[base].values) + D['SPY'].mean()
    return D, base + ['SEMI', 'CHINA', 'MKT']


def regressors(FN, sym):
    """Factor names used for one company: the yen only for the Japanese makers."""
    return [x for x in FN if x != 'JPY' or sym in JPY_NAMES]

def weekly_factors():
    w = load.weekly()
    px = load.usd_prices(w)
    with np.errstate(all='ignore'):
        r = np.log(px.where(px > 0)).diff()
    F = pd.DataFrame(index=w.index)
    F['RR'] = w['DFII10'].diff()
    F['BE'] = w['T10YIE'].diff()
    F['USD'] = np.log(w['DX-Y.NYB']).diff()
    F['JPY'] = np.log(w['JPY=X']).diff()
    F['OIL'] = np.log(w['CL=F']).diff()
    F['CU'] = np.log(w['HG=F']).diff()
    F['CREDIT'] = w['BAMLH0A0HYM2'].diff()
    raw = pd.DataFrame({'SPY': r['SPY'], 'SOXX': r['SOXX'], 'ASHR': r['ASHR']})
    D = pd.concat([F, raw, r.drop(columns=['SPY','SOXX','ASHR'])], axis=1)
    return _finish(D, BASE)
