# FMKT256-ClaudeProject

Torque, a scenario simulator for physical AI stocks, built by Felix and Suhanaa for FMKT 256 at Duke University,
fall 2026. It covers sixteen robotics companies, from NVIDIA's robot computers to Unitree's humanoids, and shows how
interest rates, the dollar, the yen, oil, copper, credit, factory activity, AI chips, China, tariffs and
robotics-specific forces move them.

Live site: https://felixw1020.github.io/FMKT256-ClaudeProject/

Every scenario runs through two lenses:

- **History lens.** Monthly dollar returns from January 2014 are regressed on the factors history measures
  reliably: the real 10-year yield, breakeven inflation, oil, copper, high-yield spreads, semiconductors and China
  A-shares against the market, the broad market, and the yen for the three Japanese makers. Short histories are pulled
  toward peer averages. A second window uses weekly returns since November 2023. The dollar, the factory cycle,
  tariffs, wages and the robotics forces have no stable history factor, so both lenses take them from the
  cash-flow model.
- **Fundamentals lens.** Each company has a driver profile (end markets, regions, currencies, cost shares, margins,
  cash and debt, the value of future businesses). A twenty-year cash-flow model is solved for the discount rate that
  reproduces today's price, and each scenario moves demand, costs, currency, funding, future businesses and the
  discount rate.

## Turn on the live site (no login needed for viewers)

1. In this repository, open Settings, then Pages. Under Build and deployment choose Deploy from a branch, branch
   `main`, folder `/ (root)`, and save.
2. Open the Actions tab, pick Refresh data and press Run workflow once.

The site appears at the address above within a few minutes. From then on the workflow runs every weekday at
22:17 UTC, after the US close, and commits a fresh `data/latest.json`; Pages redeploys on each commit. The workflow
asks for write access in its own file; if its first run cannot push, set Settings, Actions, General, Workflow
permissions to Read and write.

## How the refresh works

`scripts/update_data.py` calls `scripts/fetch_data.py`, which downloads daily history from Yahoo Finance (through
`yfinance`, with the chart API as a fallback) and FRED, and writes month-end and Friday values to `data/raw/` in a
plain-text format. If a download fails, the previous values for that series are kept. The run fails without writing
anything if a US benchmark, an exchange rate, a core FRED rate series or more than three other price series are
missing, so the last good data stays in place. The script then re-estimates
the factor sensitivities (`model/estimate.py`), replays the history episodes (`model/episodes.py`) and builds the
site's data file (`model/build_data.py`). It checks the result before replacing `data/latest.json`, so a broken run
never reaches the site. Market values follow the latest closes; company forecasts and balance sheets come from the
October 27, 2026 research pass (October 26 closes) in `model/fundamentals.py` and `model/research/companies/`.

The page loads `data/latest.json` when it can and falls back to the snapshot embedded in `index.html`, so it also
works when opened as a file.

Run it yourself:

```
pip install -r scripts/requirements.txt
python scripts/update_data.py            # fetch and rebuild
python scripts/update_data.py --offline  # rebuild from data/raw only
python -m http.server 8000               # then open http://localhost:8000
```

## Bring your own data

The **Data and method** section of the page takes a Yahoo Finance CSV (a Date column and a Close or Adj Close
column). It lines the prices up with the factor history, estimates the company's sensitivities in the browser,
pulls them toward peer averages and adds the company to the stack, the forces section and the simulator.

## Files

| Path | What it is |
|---|---|
| `index.html` | The whole site in one file, with the October 26, 2026 snapshot embedded |
| `data/latest.json` | The newest refresh, loaded by the page |
| `data/raw/` | Month-end and Friday values for every series, plus refresh metadata |
| `model/` | Factor construction, estimation, episode replays, company profiles and the data build |
| `scripts/` | The fetcher, the refresh entry point and Python requirements |
| `src/` | Page sources (HTML template, CSS, JavaScript) for anyone changing the design |
| `.github/workflows/refresh-data.yml` | The weekday refresh job |

## Sources

Prices: Yahoo Finance. Rates, credit, activity and labor series: FRED, Federal Reserve Bank of St. Louis. Company
figures: filings, earnings releases and investor relations pages, linked in each company profile on the site.

For education only. Nothing here is investment advice.
