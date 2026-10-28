import os, numpy as np, pandas as pd, json, load, factors as f, estimate as est
HERE = os.path.dirname(os.path.abspath(__file__))
EPIS = [
 ('china2015', 'China slowdown and yuan devaluation', '2015-06', '2016-02'),
 ('trade2018', 'Trade war and Fed tightening', '2018-02', '2018-12'),
 ('covid2020', 'Covid crash', '2020-02', '2020-03'),
 ('reflation', 'Stimulus and reflation boom', '2020-04', '2021-02'),
 ('rates2022', '2022 rate shock', '2022-01', '2022-10'),
 ('ai2023', 'AI boom, first leg', '2023-01', '2023-07'),
 ('tariff2025', 'Tariff shock', '2025-02', '2025-04'),
 ('oil2026', 'Oil spike and real-rate surge', '2026-02', '2026-09'),
]
LONG = ['NVDA','TSLA','ISRG','TER','ROK','6954.T','6506.T','6324.T','300124.SZ','CGNX']
def betas_excluding(D, FN, a, b):
    Dx = D.drop(D.loc[a:b].index)
    fits = {}
    for s in load.UNIV + ['BOTZ','ARKK']:
        y = Dx[s].dropna(); st = load.START.get(s)
        if st: y = y.loc[st:]
        if len(y) < 24: continue
        use = f.regressors(FN, s)
        bb, se, r2, e = f.ols(y.values, Dx.loc[y.index, use].values)
        beta = np.zeros(len(FN)); sev = np.ones(len(FN)); used = np.zeros(len(FN), bool)
        for j, nm in enumerate(use):
            k = FN.index(nm); beta[k] = bb[1 + j]; sev[k] = se[1 + j]; used[k] = True
        fits[s] = dict(beta=beta, se=sev, used=used)
    B = np.array([fits[s]['beta'] for s in LONG]); tau = np.maximum(B.std(axis=0), 0.05); prior0 = B.mean(axis=0)
    ji = FN.index('JPY'); prior0[ji] = np.mean([fits[s]['beta'][ji] for s in f.JPY_NAMES]); tau[ji] = max(0.05, np.std([fits[s]['beta'][ji] for s in f.JPY_NAMES]))
    ci, mi = FN.index('CHINA'), FN.index('MKT')
    pri = {'us_spec': fits['ARKK']['beta'], 'cn_growth': prior0.copy()}; pri['cn_growth'][ci] = 1.0; pri['cn_growth'][mi] = max(1.5, prior0[mi]); pri['cn_growth'][ji] = 0.0
    out = {}
    for s, v in fits.items():
        prior = pri.get(est.PRIOR_GROUP.get(s), prior0)
        w_d = 1 / v['se']**2; w_p = 1 / (tau * (1.0 if s in LONG else 0.8))**2
        out[s] = np.where(v['used'], (v['beta'] * w_d + prior * w_p) / (w_d + w_p), 0.0)
    return out
def main():
    D, FN = f.monthly_factors('2014-01')
    out = []
    for key, title, a, b in EPIS:
        win = D.loc[a:b]; fac = win[FN].sum()
        B = betas_excluding(D, FN, a, b)
        rows = {}
        for s in load.UNIV + ['BOTZ']:
            if s not in B: continue
            y = D[s].dropna(); st = load.START.get(s)
            if st: y = y.loc[st:]
            inwin = y.loc[a:b]
            if len(inwin) < len(win): continue
            pred = float(fac.values @ B[s])
            rows[s] = dict(actual=round(float(np.expm1(inwin.sum())) * 100, 1), predicted=round(float(np.expm1(pred)) * 100, 1))
        acts = np.array([v['actual'] for v in rows.values()]); preds = np.array([v['predicted'] for v in rows.values()])
        corr = float(np.corrcoef(acts, preds)[0, 1]) if len(rows) > 3 else None
        mae = float(np.mean(np.abs(acts - preds)))
        shown = win[f.DISPLAY].sum()
        shown = {k.replace('_RAW', ''): round(float(v), 4) for k, v in shown.items()}
        out.append(dict(key=key, title=title, start=a, end=b, factors={k: round(float(v), 4) for k, v in fac.items()}, shown=shown, stocks=rows, xs_corr=None if corr is None else round(corr, 2), mae=round(mae, 1)))
        print(f"\n{title} {a}..{b}  corr={corr if corr is None else round(corr,2)}  MAE={mae:.1f}pts")
        print('  ', ' '.join(f"{s}:{v['actual']:+.0f}/{v['predicted']:+.0f}" for s, v in rows.items()))
    json.dump(out, open(os.path.join(HERE, 'episodes.json'), 'w'))
if __name__ == '__main__':
    main()
