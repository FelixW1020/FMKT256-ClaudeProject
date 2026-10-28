#!/usr/bin/env python3
"""Refresh Torque: fetch prices and macro series, re-estimate both lenses and write data/latest.json.

    python scripts/update_data.py            # fetch from Yahoo Finance and FRED, then rebuild
    python scripts/update_data.py --offline  # rebuild from the files already in data/raw
"""
import os, sys, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('TORQUE_DATA_DIR', os.path.join(ROOT, 'data', 'raw'))
os.environ['TORQUE_OUT'] = ''
os.environ['TORQUE_OUT_JSON'] = os.path.join(ROOT, 'data', 'latest.json.tmp')
os.environ['TORQUE_PAGES'] = '1'
sys.path.insert(0, os.path.join(ROOT, 'model'))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))


def check(path):
    """Refuse to publish a broken refresh: the last good data/latest.json stays in place."""
    d = json.load(open(path))
    assert len(d['stocks']) >= 15, 'too few stocks'
    for st in d['stocks']:
        for lens in ('monthly', 'weekly'):
            b = st['hist'][lens]['beta']
            assert len(b) == len(d['factors'][lens]['names']) and all(abs(x) < 50 for x in b), f"bad betas for {st['id']}"
        f = st['fund']
        assert f['mcap'] > 0 and f['price'] > 0, f"bad market data for {st['id']}"
    assert d['factorTable']['rows'] and d['rolling']['dates'], 'empty factor history'
    return d


def main():
    if '--offline' not in sys.argv:
        import fetch_data
        fetch_data.main()
    import estimate, episodes, build_data
    estimate.main(verbose=False)
    episodes.main()
    build_data.main()
    tmp = os.environ['TORQUE_OUT_JSON']
    d = check(tmp)
    os.replace(tmp, os.path.join(ROOT, 'data', 'latest.json'))
    print(f"data/latest.json written: as of {d['asof']}, {len(d['stocks'])} stocks")


if __name__ == '__main__':
    main()
