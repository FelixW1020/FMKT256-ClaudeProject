# Company driver profiles for the fundamentals lens, rebuilt on Oct 27, 2026 from the research files in
# /home/claude/research/companies (filings, earnings releases, consensus pages; each file lists its sources).
#
# Amounts in USD bn unless noted. Local amounts are converted at the rates in FX (Fed H.10 / spot, Oct 2026).
# Field guide:
#   price, cur, sharesM: listing price and share count (economic shares; ADS-equivalent for Hesai)
#   mcap, cash, debt: USD bn; floating = share of debt that reprices with short rates
#   rev: next-12-month revenue (Nov 2026 to Oct 2027) built from guidance and consensus; g1: growth the year after
#   m1: next-12-month EBIT margin (GAAP-like, stock pay counted as a cost); mT: long-run margin by year eight
#   eps: next-12-month EPS in the listing currency (consensus where one exists)
#   tax, conv (FCF / NOPAT), beta (5-year monthly where reported), pass (share of cost shocks passed on),
#   cm (contribution margin on volume), endMix/region/revCcy/costCcy (shares), costs (shares of revenue),
#   tariffRole (importer/domestic/none), pwExposure (revenue exposed to Chinese price competition),
#   pwGain (share gain in a price war), chinaMagnets (sources magnets inside China),
#   opt (share of EV that is humanoid/autonomy optionality, its duration, and the share of it a serious
#   safety incident would erase), burn (annual cash burn), durFallback (duration of a pre-profit business),
#   magnetSecured (share of magnet needs covered by secured supply outside China's controls),
#   rep (reporting currency when it differs from the listing currency, so a refresh converts at the new rate).
#   basis: one line per judgment so the site can show where each input came from.
FX = {'USD': 1.0, 'JPY': 156.91, 'CNY': 6.686, 'HKD': 7.8478}
FUND = {}


def add(id, **kw):
    FUND[id] = kw


def usd(x, cur):
    return x / FX[cur]


# ---------------- Brain ----------------
add('nvda', price=216.00, cur='USD', sharesM=24150, mcap=5216.4, cash=56.6, debt=33.4, floating=0.0,
    rev=620.0, g1=0.18, m1=0.64, mT=0.42, eps=14.5, tax=0.15, conv=0.85, beta=2.22, pass_=0.7, cm=0.75,
    endMix=dict(semis=0.92, consumer=0.04, electronics=0.02, auto=0.01, research=0.01),
    region=dict(us=0.62, china=0.08, row=0.30),
    revCcy=dict(USD=1.0), costCcy=dict(USD=0.8, OTHER=0.2),
    costs=dict(metals=0.01, magnets=0.0, chips=0.15, labor=0.05, energy=0.0, imported=0.03),
    tariffRole='none', pwExposure=0.02, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.03, dur=14, av=0.05, humanoid=0.05), burn=0.0,
    basis=dict(rev='Q4 FY27 implied by the $411.7B FY27 consensus plus three quarters of the $692.2B FY28 consensus',
               m1='Non-GAAP operating margin of 66.5% in Q2 FY27, which now includes stock pay',
               mT='Assumes custom accelerators and competition pull margins toward 42% by year eight',
               opt='Robotics and automotive were about 1% of FY26 revenue, so little value rests on future businesses'))

# ---------------- Senses ----------------
add('cgnx', price=55.63, cur='USD', sharesM=168.22, mcap=9.36, cash=0.755, debt=0.0,
    rev=1.22, g1=0.11, m1=0.20, mT=0.24, eps=1.80, tax=0.18, conv=0.95, beta=1.45, pass_=0.5, cm=0.6,
    endMix=dict(logistics=0.30, electronics=0.25, auto=0.12, semis=0.08, general=0.10, healthcare=0.07, consumer=0.08),
    region=dict(us=0.35, europe=0.25, china=0.16, japan=0.05, row=0.19),
    revCcy=dict(USD=0.41, EUR=0.25, CNY=0.16, JPY=0.05, OTHER=0.13), costCcy=dict(USD=0.5, OTHER=0.5),
    costs=dict(metals=0.02, magnets=0.0, chips=0.12, labor=0.25, energy=0.0, imported=0.05),
    tariffRole='none', pwExposure=0.25, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.04, dur=14, av=0.0, humanoid=0.03), burn=0.0,
    basis=dict(rev='FY26 guide of $1.13-1.15B plus growth and RealSense (about $85M)',
               m1='GAAP operating margin; adjusted EBITDA margin is guided at 29-31%',
               mT='Investor Day target of 20-30% adjusted EBITDA margin',
               opt='RealSense depth cameras for robots, estimated at 7% of revenue'))
add('hsai', price=13.69, cur='USD', rep='CNY', sharesM=156.44, mcap=2.14, cash=usd(7.051, 'CNY'), debt=usd(0.638, 'CNY'),
    rev=usd(5.0, 'CNY'), g1=0.25, m1=0.06, mT=0.15, eps=0.66, tax=0.15, conv=0.7, beta=1.45, pass_=0.3, cm=0.45,
    endMix=dict(auto=0.62, consumer=0.12, logistics=0.10, research=0.08, general=0.08),
    region=dict(china=0.743, us=0.183, europe=0.04, row=0.034),
    revCcy=dict(CNY=0.74, USD=0.22, EUR=0.04), costCcy=dict(CNY=0.85, OTHER=0.15),
    costs=dict(metals=0.02, magnets=0.01, chips=0.18, labor=0.12, energy=0.0, imported=0.03),
    tariffRole='importer', pwExposure=0.35, pwGain=0.0, chinaMagnets=True,
    opt=dict(share=0.15, dur=14, av=0.10, humanoid=0.05), burn=0.0,
    basis=dict(rev='FY26 near RMB 4.2B on the Q3 guide of RMB 1.10-1.15B, then about 20% growth',
               m1='Operating margin was 5.6% in FY25 and 0.3% in Q2 26 as lidar prices halved',
               mT='Assumes scale and in-house chips restore mid-teens margins',
               opt='Robotics lidar and actuation modules, estimated at 35% of revenue'))

# ---------------- Muscles ----------------
add('hds', price=5090, cur='JPY', sharesM=94.67, mcap=3.07, cash=usd(22.16, 'JPY'), debt=usd(16.89, 'JPY'), floating=0.5,
    rev=usd(80.0, 'JPY'), g1=0.12, m1=0.114, mT=0.18, eps=68.0, tax=0.30, conv=0.75, beta=1.40, pass_=0.5, cm=0.55,
    endMix=dict(general=0.30, semis=0.30, electronics=0.10, auto=0.05, healthcare=0.05, research=0.10, gov=0.10),
    region=dict(japan=0.30, row=0.18, europe=0.28, us=0.18, china=0.06),
    revCcy=dict(JPY=0.42, EUR=0.28, USD=0.18, CNY=0.06, OTHER=0.06), costCcy=dict(JPY=0.50, EUR=0.31, USD=0.15, OTHER=0.04),
    costs=dict(metals=0.10, magnets=0.0, chips=0.0, labor=0.25, energy=0.02, imported=0.05),
    tariffRole='importer', pwExposure=0.5, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.45, dur=14, av=0.0, humanoid=0.20), burn=0.0,
    basis=dict(rev='FY3/27 guide of JPY 74.5B, rolled forward on record orders (+56%)',
               m1='FY3/27 operating margin guide of 11.4%',
               mT='Medium-term target of more than 15% by FY2030',
               opt='At about 75x forward earnings, most of the price rests on future humanoid joint demand',
               fx='Cost currencies reflect local production at Harmonic Drive SE and the US unit; Q1 FX gains imply about 1.4% of operating profit per 1% yen move'))
add('yaskawa', price=3980, cur='JPY', sharesM=259.44, mcap=6.58, cash=usd(70.2, 'JPY'), debt=usd(125.3, 'JPY'), floating=0.3,
    rev=usd(620.0, 'JPY'), g1=0.07, m1=0.105, mT=0.12, eps=190.0, tax=0.27, conv=0.75, beta=1.30, pass_=0.55, cm=0.38,
    endMix=dict(electronics=0.25, auto=0.18, general=0.30, semis=0.17, logistics=0.03, energy=0.07),
    region=dict(japan=0.248, china=0.234, us=0.273, europe=0.117, row=0.128),
    revCcy=dict(JPY=0.248, CNY=0.234, USD=0.273, EUR=0.117, OTHER=0.128), costCcy=dict(JPY=0.38, CNY=0.27, USD=0.16, EUR=0.08, OTHER=0.11),
    costs=dict(metals=0.07, magnets=0.04, chips=0.07, labor=0.18, energy=0.02, imported=0.12),
    tariffRole='importer', pwExposure=0.55, pwGain=0.0, chinaMagnets=False, magnetSecured=0.7,
    opt=dict(share=0.05, dur=14, av=0.0, humanoid=0.05), burn=0.0,
    basis=dict(rev='FY26 guide of JPY 600B, raised on the weak yen, with record orders (+38%)',
               m1='Second-half margin implied by the cut OP guide of JPY 57.5B (ERP rollout cost about JPY 4B)',
               mT='Long-run margin near the pre-ERP trend',
               opt='Humanoid actuators through Tokyo Robotics, small so far',
               fx='Cost currencies set so a 1% broad yen move shifts operating profit by about JPY 1bn, as the October 2026 deck indicates'))
add('inovance', price=55.25, cur='CNY', sharesM=2711.07, mcap=22.4, cash=usd(9.01, 'CNY'), debt=usd(3.18, 'CNY'), floating=0.5,
    rev=usd(56.0, 'CNY'), g1=0.15, m1=0.115, mT=0.13, eps=2.43, tax=0.12, conv=0.6, beta=1.20, pass_=0.35, cm=0.3,
    endMix=dict(general=0.42, electronics=0.10, auto=0.38, energy=0.05, research=0.05),
    region=dict(china=0.934, row=0.066),
    revCcy=dict(CNY=0.934, OTHER=0.066), costCcy=dict(CNY=0.92, OTHER=0.08),
    costs=dict(metals=0.12, magnets=0.05, chips=0.10, labor=0.10, energy=0.02, imported=0.02),
    tariffRole='none', pwExposure=0.15, pwGain=0.06, chinaMagnets=True,
    opt=dict(share=0.06, dur=14, av=0.0, humanoid=0.05), burn=0.0,
    basis=dict(rev='Nine-month revenue of RMB 38.0B (+19.9%) rolled forward',
               m1='Nine-month operating profit margin of 12.3%, which includes fair-value gains',
               mT='NEV powertrain margins are under price pressure (12.8% gross margin)',
               opt='Humanoid arms and frameless motors sampled to humanoid makers'))

# ---------------- Bodies ----------------
add('fanuc', price=5639, cur='JPY', sharesM=924.91, mcap=33.2, cash=usd(787.1, 'JPY'), debt=0.0,
    rev=usd(1050.0, 'JPY'), g1=0.06, m1=0.237, mT=0.22, eps=250.0, tax=0.27, conv=0.9, beta=1.05, pass_=0.5, cm=0.45,
    endMix=dict(general=0.42, auto=0.20, electronics=0.25, semis=0.05, logistics=0.04, research=0.04),
    region=dict(japan=0.125, china=0.287, us=0.265, europe=0.162, row=0.161),
    revCcy=dict(JPY=0.125, CNY=0.287, USD=0.265, EUR=0.162, OTHER=0.161), costCcy=dict(JPY=0.85, OTHER=0.15),
    costs=dict(metals=0.08, magnets=0.03, chips=0.05, labor=0.12, energy=0.02, imported=0.20),
    tariffRole='importer', pwExposure=0.45, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.03, dur=14, av=0.0, humanoid=0.03), burn=0.0,
    basis=dict(rev='FY26 guide of JPY 1,013.7B, raised on record orders of JPY 306B (+49%)',
               m1='FY26 operating margin guide of 23.7%',
               mT='Long-run margin a little below today, as Chinese brands take share',
               opt='NVIDIA physical-AI tie-up; most projects are still trials'))
add('ter', price=309.00, cur='USD', sharesM=156.34, mcap=48.3, cash=0.517, debt=0.0,
    rev=5.9, g1=0.10, m1=0.29, mT=0.27, eps=10.8, tax=0.15, conv=0.85, beta=1.75, pass_=0.5, cm=0.6,
    endMix=dict(semis=0.84, electronics=0.085, general=0.05, logistics=0.025),
    region=dict(china=0.12, japan=0.05, row=0.70, us=0.08, europe=0.05),
    revCcy=dict(USD=0.92, OTHER=0.08), costCcy=dict(USD=0.6, OTHER=0.4),
    costs=dict(metals=0.02, magnets=0.005, chips=0.10, labor=0.20, energy=0.0, imported=0.02),
    tariffRole='none', pwExposure=0.08, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.04, dur=14, av=0.0, humanoid=0.05), burn=0.0,
    basis=dict(rev='Q4 26 plus three quarters of the $6.3B FY27 consensus; Q3 26 reports Oct 27',
               m1='Q3 26 guide of 28-30% non-GAAP operating margin',
               mT='Target model of about $6B revenue at 59-61% gross margin',
               opt='Universal Robots and MiR were 7.5% of Q2 26 revenue'))
add('isrg', price=451.63, cur='USD', sharesM=346.64, mcap=156.6, cash=6.8, debt=0.0,
    rev=12.6, g1=0.13, m1=0.34, mT=0.36, eps=11.9, tax=0.18, conv=0.85, beta=1.46, pass_=0.55, cm=0.65,
    endMix=dict(healthcare=1.0),
    region=dict(us=0.68, europe=0.15, china=0.04, japan=0.05, row=0.08),
    revCcy=dict(USD=0.68, EUR=0.14, JPY=0.05, CNY=0.04, OTHER=0.09), costCcy=dict(USD=0.7, OTHER=0.3),
    costs=dict(metals=0.02, magnets=0.005, chips=0.03, labor=0.15, energy=0.0, imported=0.06),
    tariffRole='none', pwExposure=0.03, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.0, dur=14, av=0.0, humanoid=0.0), burn=0.0,
    basis=dict(rev='LTM revenue of $11.6B rolling toward the $13.3B FY27 consensus',
               m1='Non-GAAP operating margin of about 40% less about 7 points of stock pay',
               mT='China price cuts and extended-use instruments trim revenue per procedure 3-5% in 2027',
               opt='No humanoid or autonomy business priced in'))
add('tsla', price=391.62, cur='USD', sharesM=3952.8, mcap=1548.0, cash=45.45, debt=9.52, floating=0.2,
    rev=115.0, g1=0.12, m1=0.05, mT=0.10, eps=1.9, tax=0.18, conv=0.75, beta=1.92, pass_=0.4, cm=0.22,
    endMix=dict(consumer=0.88, energy=0.10, research=0.02),
    region=dict(us=0.47, china=0.21, europe=0.15, row=0.17),
    revCcy=dict(USD=0.5, CNY=0.21, EUR=0.15, OTHER=0.14), costCcy=dict(USD=0.55, CNY=0.25, EUR=0.1, OTHER=0.1),
    costs=dict(metals=0.10, magnets=0.01, chips=0.05, labor=0.10, energy=0.01, imported=0.05),
    tariffRole='domestic', pwExposure=0.35, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.85, dur=14, av=0.20, humanoid=0.08), burn=0.0,
    basis=dict(rev='LTM revenue of $103.6B rolling toward the $122.3B FY27 consensus',
               m1='GAAP operating margin was 2.6% in Q3 26 and 3.3% over the last year',
               mT='Mature auto and energy margin',
               opt='Our illustrative estimate: about 85% of value rests on robotaxis and Optimus'))
add('ubtech', price=68.50, cur='HKD', rep='CNY', sharesM=503.4, mcap=4.39, cash=usd(2.651, 'CNY'), debt=usd(0.997, 'CNY'), floating=0.5,
    rev=usd(3.6, 'CNY'), g1=0.6, m1=-0.15, mT=0.15, eps=-1.1, tax=0.0, conv=0.75, beta=1.65, pass_=0.25, cm=0.3,
    endMix=dict(research=0.34, general=0.24, consumer=0.25, logistics=0.10, auto=0.07),
    region=dict(china=0.78, row=0.22), revCcy=dict(CNY=0.78, OTHER=0.22), costCcy=dict(CNY=0.92, OTHER=0.08),
    costs=dict(metals=0.05, magnets=0.04, chips=0.12, labor=0.20, energy=0.0, imported=0.02),
    tariffRole='none', pwExposure=0.35, pwGain=0.0, chinaMagnets=True,
    opt=dict(share=0.7, dur=13, av=0.0, humanoid=0.30), burn=usd(1.19, 'CNY'), durFallback=20,
    basis=dict(rev='H1 26 revenue of RMB 1.27B (+104%) rolled forward',
               m1='H1 26 operating margin was -22%',
               mT='Assumes humanoid scale brings mid-teens margins',
               opt='Humanoids were about half of H1 26 revenue; the price assumes it reaches its 10,000-unit 2026 target'))
add('unitree', price=672.00, cur='CNY', sharesM=404.46, mcap=40.65, cash=usd(8.09, 'CNY'), debt=usd(0.098, 'CNY'),
    rev=usd(3.0, 'CNY'), g1=0.45, m1=0.30, mT=0.25, eps=2.19, tax=0.15, conv=0.9, beta=1.80, pass_=0.4, cm=0.55,
    endMix=dict(research=0.45, consumer=0.25, general=0.20, gov=0.10),
    region=dict(china=0.55, us=0.12, europe=0.15, japan=0.04, row=0.14),
    revCcy=dict(CNY=0.55, USD=0.28, EUR=0.10, OTHER=0.07), costCcy=dict(CNY=0.95, OTHER=0.05),
    costs=dict(metals=0.06, magnets=0.04, chips=0.12, labor=0.12, energy=0.0, imported=0.01),
    tariffRole='importer', pwExposure=0.2, pwGain=0.05, chinaMagnets=True,
    opt=dict(share=0.6, dur=13, av=0.0, humanoid=0.30), burn=0.0,
    basis=dict(rev='H1 26 revenue of RMB 1.15B (+48.5%) rolled forward',
               m1='Q2 26 operating margin of 37.6%; FY25 was 19%',
               mT='Assumes price cuts as rivals scale',
               opt='At about 130x sales, most of the price rests on a future humanoid business'))

# ---------------- Systems and deployers ----------------
add('rok', price=429.89, cur='USD', sharesM=111.05, mcap=47.74, cash=0.479, debt=3.258, floating=0.21,
    rev=9.58, g1=0.07, m1=0.205, mT=0.22, eps=14.91, tax=0.195, conv=0.95, beta=1.51, pass_=0.6, cm=0.42,
    endMix=dict(general=0.40, auto=0.10, semis=0.05, logistics=0.12, healthcare=0.08, energy=0.15, electronics=0.05, consumer=0.05),
    region=dict(us=0.64, europe=0.175, china=0.04, row=0.145),
    revCcy=dict(USD=0.62, EUR=0.15, CNY=0.04, OTHER=0.19), costCcy=dict(USD=0.55, EUR=0.12, OTHER=0.33),
    costs=dict(metals=0.05, magnets=0.005, chips=0.09, labor=0.22, energy=0.01, imported=0.08),
    tariffRole='domestic', pwExposure=0.05, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.03, dur=14, av=0.0, humanoid=0.02), burn=0.0,
    basis=dict(rev='FY27 (Oct 26 to Sep 27) consensus of $9.58B; guidance comes Nov 5',
               m1='FY26 enterprise operating margin of about 21.5%, less corporate costs',
               mT='Margin expansion from productivity, offset by memory-chip inflation',
               opt='OTTO and Clearpath mobile robots, not disclosed separately'))
add('sym', price=37.90, cur='USD', sharesM=604.8, mcap=22.92, cash=1.746, debt=0.0,
    rev=3.6, g1=0.22, m1=0.05, mT=0.16, eps=0.6, tax=0.21, conv=0.8, beta=1.97, pass_=0.3, cm=0.3,
    endMix=dict(logistics=1.0),
    region=dict(us=0.88, row=0.12), revCcy=dict(USD=0.9, OTHER=0.1), costCcy=dict(USD=0.92, OTHER=0.08),
    costs=dict(metals=0.12, magnets=0.01, chips=0.08, labor=0.25, energy=0.0, imported=0.08),
    tariffRole='domestic', pwExposure=0.0, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.25, dur=14, av=0.0, humanoid=0.0), burn=0.0,
    basis=dict(rev='FY27 (Sep 26 to Sep 27) consensus of $3.6B; Walmart was 90.5% of Q3 26 revenue',
               m1='GAAP operating margin was 4.6% in Q3 26',
               mT='Assumes software and services lift margins toward mid-teens',
               opt='Walmart store micro-fulfillment and the GreenBox venture'))
add('serv', price=2.64, cur='USD', sharesM=86.71, mcap=0.229, cash=0.24, debt=0.0,
    rev=0.025, g1=1.0, m1=-6.0, mT=0.15, eps=-2.0, tax=0.0, conv=0.8, beta=2.5, pass_=0.2, cm=0.3,
    endMix=dict(logistics=0.6, consumer=0.2, healthcare=0.2),
    region=dict(us=1.0), revCcy=dict(USD=1.0), costCcy=dict(USD=1.0),
    costs=dict(metals=0.05, magnets=0.01, chips=0.15, labor=0.40, energy=0.01, imported=0.10),
    tariffRole='domestic', pwExposure=0.0, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.8, dur=12, av=0.10, humanoid=0.0), burn=0.17, durFallback=18,
    basis=dict(rev='2026 guide cut to $9-10M; FY27 consensus $33.5M',
               m1='Cost of revenue ran 3.7 times revenue in Q2 26',
               mT='Long-run margin if the delivery network scales',
               opt='The market values Serve at about its cash, so the price gives its robot business little value yet'))
add('aur', price=4.87, cur='USD', sharesM=2004.16, mcap=9.76, cash=1.217, debt=0.0,
    rev=0.10, g1=1.5, m1=-9.0, mT=0.30, eps=-0.45, tax=0.0, conv=0.8, beta=2.7, pass_=0.2, cm=0.4,
    endMix=dict(logistics=1.0),
    region=dict(us=1.0), revCcy=dict(USD=1.0), costCcy=dict(USD=1.0),
    costs=dict(metals=0.02, magnets=0.0, chips=0.10, labor=0.30, energy=0.05, imported=0.02),
    tariffRole='domestic', pwExposure=0.0, pwGain=0.0, chinaMagnets=False,
    opt=dict(share=0.9, dur=13, av=0.35, humanoid=0.0), burn=0.82, durFallback=22,
    basis=dict(rev='2026 guide of $14-16M; FY27 consensus $188M as driverless trucks scale',
               m1='Operating loss of about $0.97B over the last year',
               mT='Driver-as-a-Service subscriptions from 2027 carry software-like margins',
               opt='Nearly all of the value rests on driverless freight'))
