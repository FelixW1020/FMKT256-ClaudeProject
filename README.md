# FMKT256-ClaudeProject

Torque is a scenario simulator for physical AI stocks, made by Felix and Suhanaa for FMKT 256 at Duke University,
fall 2026. Pick a shock, such as a rise in interest rates or new tariffs, and see how 16 robotics stocks would move
and why.

Live site: https://felixw1020.github.io/FMKT256-ClaudeProject/

## What's on the site

- Intro: a robot arm that follows your cursor, and a button that takes you to the simulator.
- Market backdrop: the latest 10-year Treasury yield, real yield, Fed funds rate, oil, copper, yen, high-yield
  spread and BOTZ robotics ETF.
- The robot stack: the 16 companies in five groups, from compute and sensors to robot makers and the companies that
  run robots. Select one to see its profile: size and valuation, what its share price already assumes, revenue by
  market and region, how it has moved with each factor, and recent news.
- How each force moves each stock: pick one force, such as higher rates or a magnet embargo, to see every company
  ranked by its price change and the main reason for each move. A calculator beside it shows how wages and
  financing rates change the payback on a factory robot.
- Run a scenario: start from a preset or set the controls yourself. You get the basket's move with a range of
  model estimates, every company ranked, and for any company its revenue, margin, earnings, discount rate and fair
  value before and after. A table runs the same rate move, from 25bp to 200bp up or down, under each cause.
- Check it against history: eight past episodes, from the 2015 China selloff to the 2026 oil and rate spike, compare
  what the stocks did with what the model predicts. A chart shows how each stock's sensitivity to rates has changed.
- Data and method: how the estimates work, their limits, the data sources, and a way to add a company from your own
  price file.

## How the numbers are made

Each scenario is estimated two ways, and the headline averages them:

- History lens: how each stock has moved with rates, inflation, credit, oil, copper, chip stocks, China and the
  broad market since 2014.
- Fundamentals lens: a cash-flow model of each company that changes its demand, costs, currency effects and
  discount rate.

For forces without a reliable price history, such as tariffs and the humanoid timeline, both lenses use the
cash-flow model.

## Data

Prices come from Yahoo Finance and economic data from FRED, refreshed every weekday after the US close. Company
figures come from filings and investor materials as of October 27, 2026, and each profile links its sources.

For education only. Nothing here is investment advice.
