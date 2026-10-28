import os, numpy as np, pandas as pd, json, load, factors as f
HERE = os.path.dirname(os.path.abspath(__file__))
# scale each factor into an intuitive shock unit for display
UNITS = {'RR': (1.0, '+100bp real 10y yield'), 'BE': (1.0, '+100bp 10y breakeven inflation'),
         'USD': (0.10, '+10% dollar (DXY)'), 'JPY': (0.10, '+10% USD/JPY (weaker yen)'),
         'OIL': (0.10, '+10% oil'), 'CU': (0.10, '+10% copper'), 'CYC': (1.0, '+10pt Philly Fed activity'),
         'CREDIT': (1.0, '+100bp high-yield spread'), 'SEMI': (0.10, '+10% semis vs market'),
         'CHINA': (0.10, '+10% China A-shares vs market'), 'MKT': (0.10, '+10% market mood')}
PRIOR_GROUP = {'SYM': 'us_spec', 'AUR': 'us_spec', 'SERV': 'us_spec', 'HSAI': 'cn_growth', '9880.HK': 'cn_growth'}
def fit(D, FN, s):
    y = D[s].dropna()
    st = load.START.get(s)
    if st: y = y.loc[st:]
    use = f.regressors(FN, s)
    X = D.loc[y.index, use].values
    b, se, r2, e = f.ols(y.values, X)
    beta = np.zeros(len(FN)); sev = np.zeros(len(FN)); mask = np.zeros(len(FN), bool)
    for j, nm in enumerate(use):
        k = FN.index(nm); beta[k] = b[1 + j]; sev[k] = se[1 + j]; mask[k] = True
    return dict(n=len(y), alpha=b[0], beta=beta, se=sev, used=mask, r2=r2, resid_sd=float(np.std(e, ddof=len(use)+1)))
def shrink(est, prior, tau):
    used = est.get('used', np.ones(len(est['beta']), bool))
    se = np.where(used, est['se'], 1.0)
    w_data = 1 / se**2; w_prior = 1 / tau**2
    post = (est['beta'] * w_data + prior * w_prior) / (w_data + w_prior)
    post_se = np.sqrt(1 / (w_data + w_prior))
    # factors left out of a company's regression (the yen for non-Japanese names) stay at zero
    post = np.where(used, post, 0.0); post_se = np.where(used, post_se, 0.0)
    return post, post_se, np.where(used, w_data / (w_data + w_prior), 0.0)
def run(D, FN, label):
    long_names = ['NVDA','TSLA','ISRG','TER','ROK','6954.T','6506.T','6324.T','300124.SZ','CGNX']
    est = {s: fit(D, FN, s) for s in load.UNIV + ['BOTZ','ARKK','SPY','SOXX']}
    B = np.array([est[s]['beta'] for s in long_names])
    tau = np.maximum(B.std(axis=0), 0.05)            # cross-sectional dispersion as prior uncertainty
    sector_prior = B.mean(axis=0)
    ji = FN.index('JPY')                              # the yen prior comes from the Japanese makers alone
    sector_prior[ji] = np.mean([est[s]['beta'][ji] for s in f.JPY_NAMES]); tau[ji] = max(0.05, np.std([est[s]['beta'][ji] for s in f.JPY_NAMES]))
    priors = {'us_spec': est['ARKK']['beta'], 'cn_growth': sector_prior.copy()}
    ci = FN.index('CHINA'); mi = FN.index('MKT')
    priors['cn_growth'][ci] = 1.0; priors['cn_growth'][mi] = max(1.5, sector_prior[mi])
    priors['cn_growth'][ji] = 0.0                     # Chinese names carry no yen beta
    tau_cn = tau.copy(); tau_cn[ji] = 0.0
    out = {}
    for s in load.UNIV:
        e = est[s]
        prior = priors.get(PRIOR_GROUP.get(s), sector_prior)
        post, pse, wdata = shrink(e, prior, tau * (1.0 if s in long_names else 0.8))
        out[s] = dict(n=e['n'], r2=round(e['r2'], 3), resid_sd=round(e['resid_sd'], 4),
                      raw=[round(x, 4) for x in e['beta']], raw_se=[round(x, 4) for x in e['se']],
                      beta=[round(x, 4) for x in post], se=[round(x, 4) for x in pse],
                      data_weight=[round(x, 2) for x in wdata])
    for s in ['BOTZ','ARKK','SPY','SOXX']:
        e = est[s]; out[s] = dict(n=e['n'], r2=round(e['r2'], 3), beta=[round(x, 4) for x in e['beta']], se=[round(x, 4) for x in e['se']])
    # a company with too little history (Unitree listed Aug 19, 2026) carries the Chinese growth prior until it has 18 months
    for s in load.YOUNG:
        n = int(D[s].dropna().shape[0]) if s in D.columns else 0
        if n >= 18:
            e = fit(D, FN, s)
            post, pse, wdata = shrink(e, priors['cn_growth'], tau * 0.8)
            out[s] = dict(n=e['n'], r2=round(e['r2'], 3), resid_sd=round(e['resid_sd'], 4), raw=[round(x, 4) for x in e['beta']],
                          raw_se=[round(x, 4) for x in e['se']], beta=[round(x, 4) for x in post], se=[round(x, 4) for x in pse],
                          data_weight=[round(x, 2) for x in wdata])
        else:
            out[s] = dict(n=0, r2=None, resid_sd=None, raw=None, raw_se=None,
                          beta=[round(float(x), 4) for x in priors['cn_growth']], se=[round(float(x), 4) for x in tau_cn * 0.8],
                          data_weight=[0.0] * len(FN))
    out['_priors'] = dict(sector=[round(float(x), 4) for x in sector_prior], us_spec=[round(float(x), 4) for x in priors['us_spec']],
                          cn_growth=[round(float(x), 4) for x in priors['cn_growth']], tau=[round(float(x), 4) for x in tau])
    return out
LINK = ['RR', 'BE', 'USD_RAW', 'JPY_RAW']   # what a rate move brings with it: raw currency moves, as the controls show them
def link(D, nd):
    return dict(names=['RR', 'BE', 'USD', 'JPY'], cov=np.round(D[LINK].cov().values, nd).tolist())
def proj(D, FN):
    """What the measured factors imply for the currencies the history lens leaves out: monthly regressions of the
    dollar and the yen (log changes) on the factors (R-squared about 0.35 to 0.4). The factory cycle is not netted
    out: the month's factor moves explain only 8% of changes in the Philadelphia Fed index, with unstable signs."""
    X = [x for x in FN if x != 'JPY']
    out = dict(names=X)
    for key, y in (('usd', D['USD_RAW']), ('jpy', D['JPY_RAW'])):
        ok = y.notna() & D[X].notna().all(axis=1)
        b, se, r2, _ = f.ols(y[ok].values, D.loc[ok, X].values)
        out[key] = [round(float(v), 6) for v in b[1:]]; out[key + '_r2'] = round(float(r2), 3)
    return out
def main(verbose=True):
    Dm, FNm = f.monthly_factors('2014-01')
    Dw, FNw = f.weekly_factors()
    P = proj(Dm, FNm)       # monthly co-movement, used by both windows
    res = {'monthly': {'factors': FNm, 'window': f"{Dm.index[0]} to {Dm.index[-1]}", 'obs': len(Dm), 'stocks': run(Dm, FNm, 'monthly'),
                       'cov': np.round(Dm[FNm].cov().values, 6).tolist(), 'mean': np.round(Dm[FNm].mean().values, 6).tolist(), 'link': link(Dm, 7), 'proj': P},
           'weekly': {'factors': FNw, 'window': f"{Dw.index[0].date()} to {Dw.index[-1].date()}", 'obs': len(Dw), 'stocks': run(Dw, FNw, 'weekly'),
                      'cov': np.round(Dw[FNw].cov().values, 7).tolist(), 'mean': np.round(Dw[FNw].mean().values, 7).tolist(), 'link': link(Dw, 8), 'proj': P}}
    json.dump(res, open(os.path.join(HERE, 'betas.json'), 'w'))
    if not verbose: return res
    for lens in ['monthly', 'weekly']:
        FN = res[lens]['factors']
        print(f"\n== {lens} ({res[lens]['window']}) shrunk betas, in display units ==")
        rows = []
        for s, v in res[lens]['stocks'].items():
            if s.startswith('_'): continue
            row = {'sym': s, 'n': v['n'], 'R2': v['r2']}
            for k, nm in enumerate(FN):
                row[nm] = round(v['beta'][k] * UNITS[nm][0] * 100, 1)
            rows.append(row)
        print(pd.DataFrame(rows).set_index('sym').to_string())

if __name__ == '__main__':
    main()
