# FMKT256-ClaudeProject

Torque is a scenario simulator for physical AI stocks, made by Felix, Suhanaa and Elliot for FMKT 256 at Duke University,
fall 2026. Pick a shock, such as higher interest rates or new tariffs, and see how 16 robotics stocks would move
and why.

Live site: https://felixw1020.github.io/FMKT256-ClaudeProject/

## What's on the site

- Intro: a robot arm that follows your cursor, and a button to the simulator.
- Market backdrop: the latest Treasury yields, Fed funds rate, oil, copper, yen, credit spreads and BOTZ robotics
  ETF.
- The robot stack: the 16 companies, from chip and sensor makers to robot makers and robot operators. Select one
  for its profile: valuation, what its price already assumes, revenue mix, sensitivity to each factor and recent
  news.
- How each force moves each stock: pick one force, such as higher rates or a magnet embargo, to see every company
  ranked by its price change and the main reason behind it. Beside it, a calculator shows how wages and financing
  rates change a factory robot's payback.
- Run a scenario: use a preset or set the controls yourself. See the basket's move with its range of estimates,
  every company ranked, and any company's revenue, earnings and fair value before and after. A table runs rate
  moves from 25bp to 200bp, up and down, under each cause.
- Check it against history: eight past episodes, from the 2015 China selloff to the 2026 oil and rate spike, compare
  what the stocks did with what the model predicts.
- Data and method: how the estimates work, their limits, sources, and a way to add your own company from a price
  file.

## How the numbers are made

Each scenario is estimated two ways, and the headline averages them:

- History lens: how each stock has moved since 2014 with rates, inflation, credit, oil, copper, chip stocks, China
  and the broad market.
- Fundamentals lens: a cash-flow model of each company that adjusts its demand, costs, currency effects and
  discount rate.

For forces with no reliable price history, such as tariffs and the humanoid timeline, both lenses use the
cash-flow model.

## Data

Prices come from Yahoo Finance and economic data from FRED, refreshed every weekday after the US close. Company
figures come from filings and investor materials as of October 27, 2026.

For education only. Nothing here is investment advice.
