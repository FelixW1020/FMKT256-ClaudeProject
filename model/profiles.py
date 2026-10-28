"""Company profiles for the drawer: a short description we wrote, plus drivers, risks, dated events and sources
taken from the research files (each opened and dated by the research pass on Oct 27, 2026)."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.environ.get('TORQUE_RESEARCH_DIR') or (os.path.join(HERE, 'research', 'companies') if os.path.isdir(os.path.join(HERE, 'research', 'companies')) else '/home/claude/research/companies')

WHAT = {
  'nvda': 'Makes the chips that train robot models and the Jetson Thor computer inside many humanoids. Robotics and cars were about 1% of revenue in FY26, so the stock moves with data-center spending first.',
  'cgnx': 'The leading machine-vision supplier for factory inspection and warehouse barcode reading. Its agreed purchase of RealSense, for about $500M, adds depth cameras for mobile robots and humanoids.',
  'hsai': 'A Chinese lidar maker selling to carmakers, robotaxi fleets, lawn robots and humanoids. In 2025 volumes roughly tripled while average prices halved; in Q2 26 units rose 78% and revenue 22%.',
  'hds': 'Makes most of the world\'s small precision strain wave gears, the joints in robot arms and humanoids. The share price assumes humanoid demand well beyond today\'s sales.',
  'yaskawa': 'Japan\'s second big robot maker and a leading servo supplier, with Motoman arms and wafer-handling robots. Earnings are leveraged to the factory cycle and the yen.',
  'inovance': 'China\'s largest servo and inverter supplier and its third-largest industrial robot brand, taking share from Japanese and European rivals. Electric-vehicle drivetrains are 38% of sales.',
  'fanuc': 'The largest industrial robot and CNC maker, with about a fifth of the world robot market. Almost 90% of sales are outside Japan, so the yen and China matter as much as US rates.',
  'ter': 'A chip-test equipment maker that owns Universal Robots and MiR. AI chip testing drives most of the value; robots were 7.5% of revenue in Q2 26.',
  'isrg': 'The most profitable robot business: da Vinci surgical systems and the instruments used in each procedure. Recurring instrument revenue makes it the steadiest name in the basket.',
  'tsla': 'An electric-car and battery maker whose valuation rests mostly on robotaxis and the Optimus humanoid. Optimus entered early production in Q3 26; outside sales are targeted for late 2027.',
  'ubtech': 'A Shenzhen humanoid maker selling Walker S robots to factories and data-collection centers, plus education and consumer robots. It is growing fast and still losing money.',
  'unitree': 'The low-cost leader in legged robots, selling quadrupeds and the G1 humanoid from $13,500. It is profitable, and it listed on Shanghai\'s STAR Market on Aug 19, 2026.',
  'rok': 'The largest US pure-play factory automation company: controllers, drives, software and OTTO mobile robots. It benefits from reshoring, data-center and warehouse projects.',
  'sym': 'Builds automated case-handling warehouses for retailers. Walmart was 90.5% of revenue in Q3 FY26, so one customer\'s capital plans drive the stock.',
  'serv': 'Runs about 2,000 sidewalk delivery robots on food-delivery apps and, since January, hospital robots. The market values it at roughly its cash.',
  'aur': 'Runs driverless trucks on Texas freight lanes and plans to license its driver to fleets from 2027. It burns about $0.8B a year against $1.2B of cash.',
}

NEXT = {
  'nvda': 'Q3 FY27 results expected Nov 17, 2026', 'cgnx': 'Q3 results Nov 4, 2026 after the close',
  'hsai': 'Q3 results Nov 10, 2026', 'hds': 'First-half results around mid-November 2026',
  'yaskawa': 'Q3 results in early January 2027', 'inovance': 'Full-year 2026 report by Apr 30, 2027',
  'fanuc': 'Q3 results in late January 2027', 'ter': 'Q3 results Oct 27, 2026 after the close',
  'isrg': 'Q4 results and 2027 guidance expected Jan 21, 2027', 'tsla': 'Annual meeting Dec 3, 2026; Q4 results late January 2027',
  'ubtech': 'Full-year results in March 2027', 'unitree': 'First quarterly report as a listed company, due by Oct 31, 2026',
  'rok': 'Q4 FY26 results and FY27 guidance Nov 5, 2026', 'sym': 'Q4 FY26 results expected around Nov 23, 2026',
  'serv': 'Q3 results Nov 5, 2026', 'aur': 'Q3 results Oct 28, 2026',
}

# report dates for the stale-input note: after this date the drawer says the inputs may trail the newest results
NEXT_DATE = {'nvda': '2026-11-17', 'cgnx': '2026-11-04', 'hsai': '2026-11-10', 'ter': '2026-10-27',
             'rok': '2026-11-05', 'sym': '2026-11-23', 'serv': '2026-11-05', 'aur': '2026-10-28', 'unitree': '2026-10-31',
             'hds': '2026-11-13', 'yaskawa': '2027-01-08', 'inovance': '2027-04-30', 'fanuc': '2027-01-27',
             'isrg': '2027-01-21', 'tsla': '2027-01-27', 'ubtech': '2027-03-20'}

FILE = {'nvda': 'nvda', 'cgnx': 'cgnx', 'hsai': 'hsai', 'hds': 'hds', 'yaskawa': 'yaskawa', 'inovance': 'inovance',
        'fanuc': 'fanuc', 'ter': 'ter', 'isrg': 'isrg', 'tsla': 'tsla', 'ubtech': 'ubtech', 'unitree': 'unitree',
        'rok': 'rok', 'sym': 'sym', 'serv': 'serv', 'aur': 'aur'}


NOTE_RE = re.compile(r'\s*\((?:[^()]*\b(?:my|our|ours)\b[^()]*|[^()]*background knowledge[^()]*|[^()]*date approximate[^()]*|[^()]*not verified[^()]*|[^()]*unverified[^()]*)\)', re.I)
WORDS = [(r'\bhypergrowth\b', 'rapid growth'), (r'\bHypergrowth\b', 'Rapid growth'),
         (r'data-collection centers rather than proven factory ROI', 'data-collection centers, and factory returns are still unproven'),
         (r'research and education rather than industrial deployment', 'research and education, with little industrial deployment so far')]


def clean(t):
    t = re.sub(r'\s+', ' ', str(t)).strip()
    t = NOTE_RE.sub('', t)
    for a, b in WORDS: t = re.sub(a, b, t)
    # proper minus signs before numbers: ' -34%', '(-3.7%)', 'FCF -RMB1.19bn'
    t = re.sub(r'(^|[\s(\[:;,/])-(?=[$¥]?(?:RMB|HK\$|US\$|JPY )?\d)', lambda m: m.group(1) + '\u2212', t)
    t = t.replace(' ;', ';').replace('  ', ' ')
    return t.rstrip(';').strip()


def load_profile(id, basis, asof=None):
    d = json.load(open(os.path.join(RESEARCH, FILE[id] + '.json')))
    ev = sorted(d.get('recent_events', []), key=lambda e: e.get('date', ''))[-5:]
    events = []
    for e in reversed(ev):
        txt = clean(e.get('event', ''))
        r = clean(e.get('stock_reaction', '') or '')
        if r and not re.match(r'(not found|n/?a\b|none\b|unknown|not available|no data|pending)', r.lower()):
            txt += f' Stock: {r}.' if not r.endswith('.') else f' Stock: {r}'
        events.append(dict(date=e.get('date', ''), text=txt))
    val = d.get('valuation') or {}
    pe = val.get('pe_forward')
    return dict(
        what=WHAT[id],
        drivers=[clean(x) for x in d.get('key_drivers', [])[:4]],
        risks=[clean(x) for x in d.get('key_risks', [])[:4]],
        events=events,
        sources=[dict(title=clean(s.get('title', '')), url=s.get('url', '')) for s in d.get('sources', [])[:6] if s.get('url')],
        pe=pe if isinstance(pe, (int, float)) and pe > 0 else None,
        basis={k: clean(v) for k, v in (basis or {}).items()}, next=NEXT.get(id, ''),
        stale=bool(asof and NEXT_DATE.get(id) and asof >= NEXT_DATE[id]),
        physicalShare=(d.get('physical_ai_exposure') or {}).get('share_of_revenue_pct'),
    )
