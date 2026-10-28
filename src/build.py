"""Rebuild ../index.html from these sources, embedding ../data/latest.json as the offline fallback."""
import os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
rd = lambda f: open(os.path.join(HERE, f), encoding='utf-8').read()
safe = lambda s: s.replace('</script', '<\\/script')   # inline code must never close its own script tag
data = 'window.TORQUE_DATA = ' + open(os.path.join(ROOT, 'data', 'latest.json'), encoding='utf-8').read() + ';\n'
js = '\n'.join(rd(f) for f in ['core.js', 'model.js', 'ui-sim.js', 'ui-sections.js'])
page = (rd('index.html').replace('/*__CSS__*/', rd('styles.css')).replace('/*__DATA__*/', safe(data)).replace('/*__JS__*/', safe(js))
        .replace('/*__MAIN__*/', safe(rd('main.js'))).replace('/*__HERO__*/', safe(rd('hero.js'))))
page = page.replace('<script>window.TORQUE_DATA', "<script>window.TORQUE_LIVE_URL = 'data/latest.json';</script>\n<script>window.TORQUE_DATA", 1)
cut = page.index('<header')
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       + page[:cut] + '</head>\n<body>\n' + page[cut:] + '\n</body>\n</html>\n')
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(doc)
print('index.html', len(doc) // 1024, 'KB')
