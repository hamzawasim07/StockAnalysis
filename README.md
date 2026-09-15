# PSX Terminal

A Next.js app for analysing companies listed on the Pakistan Stock Exchange: historical
prices, income statement / balance sheet / cash flow, derived ratios and payout history,
in one view per company.

- **Framework:** Next.js 16 (App Router, Turbopack, TypeScript), Tailwind v4
- **UI:** hand-built shadcn-style primitives (Button, Card, Badge, Table, Tabs, Input,
  Select, Toggle Group, Command palette, Skeleton) plus a shadcn-style chart wrapper
  over Recharts
- **Price & profile data:** the PSX Data Portal, `dps.psx.com.pk`
- **Financial statements & payouts:** `khistocks.com`

## Pages

| Route | What it shows |
| --- | --- |
| `/` | Market breadth, top gainers / losers / most active, sector index, symbol search |
| `/stock/[symbol]` | Quote header plus tabs: Overview, Financials, Ratios, Dividends, Price history, Profile |
| `/screener` | The whole market-watch board, sortable by any column and filterable by sector |
| `/sectors`, `/sectors/[sector]` | Sector directory and the companies in each sector |

JSON endpoints behind the same data layer: `/api/symbols`, `/api/market`,
`/api/stock/[symbol]/history`, `/api/stock/[symbol]/financials`,
`/api/stock/[symbol]/dividends`.

## How the data layer works

Neither source publishes an API, so both are scraped. Scrapers live in `lib/psx/` and
`lib/khistocks/` and are the only code that knows about raw HTML; everything above them
works with the normalised types in `lib/data/types.ts`. `lib/data/snapshot.ts` fetches
every source in parallel and assembles one `StockSnapshot`, recording a `SourceNote` per
source so the UI can always say where a figure came from.

### PSX (`lib/psx/`)

Endpoints are listed in `lib/psx/endpoints.ts`; shapes were taken from the portal's own
front-end traffic and the open-source `psx-data-reader` package.

- `GET /symbols` — the full symbol directory (search, sector grid, company names).
- `POST /historical` with `{ symbol, month, year }` — one month of daily OHLCV as an HTML
  table. There's no date-range query, so `lib/psx/historical.ts` issues one request per
  month in the range (six in flight at a time) and merges them. Each month is cached
  independently, so overlapping ranges reuse work.
- `GET /timeseries/eod/{symbol}` — fallback close/volume series when the per-month scrape
  comes back empty. No OHLC, so those columns are filled from the close.
- `GET /company/{symbol}` — profile fields and the payout table.
- `GET /market-watch` — the whole board, used by the dashboard and screener.

There's no live-quote endpoint with a documented, stable shape, so the "current" snapshot
is the most recent close plus whatever the market-watch board reports. **These are
end-of-day figures, not a streaming quote** — the UI says so.

### khistocks.com (`lib/khistocks/`)

khistocks has no API. Its URL scheme is:

```
/company-information/financial-highlights/{SYMBOL}.html   statements
/company-information/company-profile/{SYMBOL}.html        profile
/company-information/dividend-data.html                   payouts, all companies on one page
/market-live/companies-live/detailed-view/{SYMBOL}.html   live quote
/company/getcompinfo/{SYMBOL}                             company info endpoint
```

Every page is also served under an `/index.php` prefix and on the apex domain; both are
tried as fallbacks. Because the payout page covers every listed company at once, the
dividend parser filters rows to the requested symbol (matching the ticker as a whole
token, so `LUCKY`'s payouts are never attributed to `LUCK`).

The scheme can still change, so `discover.ts` crawls the site's own navigation as well: it fetches a few entry pages,
collects every link, and scores the ones whose path or text names the symbol *and* look
like a financials, payouts or profile page. Whatever the real scheme is, the site links to
it. A company page is followed one level deeper to pick up its statement and payout links.
The hard-coded patterns in `client.ts` remain only as a fallback for when the crawl finds
nothing.

Statements are parsed by **shape, not selectors**: `parse.ts` turns any label-per-row /
period-per-column table into a grid, parsing headers like `FY2024`, `Jun-24`, `31-Dec-2023`
or `Q3 2025` into a common period type, then `financials.ts` identifies which grid is the
income statement, balance sheet and cash-flow statement by scoring the line items each one
contains. Row labels are matched by substring (`LINE_ITEMS` in `parse.ts`) so "net sales",
"turnover" and "revenue" all land in the same normalised field. Figures printed as
`Rs '000` or `Rs mn` are scaled to absolute rupees, and `(1,234)` is read as negative.

Ratios are **derived** from the parsed statements rather than scraped, so every number on
the Ratios tab is reproducible from the figures on the Financials tab.

### When a source is unreachable

Each source fails independently — a company whose financials can't be fetched still gets
its price history. When a source fails entirely, the app falls back to the deterministic
dataset in `lib/data/sample.ts` and says so: an amber banner at the top of the page, and a
per-source panel at the bottom listing every endpoint tried and why it failed. Sample data
is generated from a fixed seed; it is realistic in shape but is **not real market data**.

## ⚠️ Data-use terms

PSX's terms for `dps.psx.com.pk` restrict market data to personal, non-commercial use — no
redistribution, resale or commercial dissemination. This project is built for
personal/educational analysis on that basis. Review PSX's terms of use, and khistocks.com's,
before using this for anything beyond that. Nothing here is investment advice.

## Project structure

```
app/
  page.tsx                          Dashboard
  stock/[symbol]/page.tsx           Company page (server component)
  screener/page.tsx                 Whole-board screener
  sectors/, sectors/[sector]/       Sector directory
  api/…                             JSON endpoints over the same data layer
components/
  ui/                               shadcn-style primitives + chart wrapper
  stock/                            Quote header, charts, statement tables, sources panel
  market/                           Breadth, movers, screener table
lib/
  data/      types.ts, http.ts, html.ts, snapshot.ts, sample.ts
  psx/       endpoints.ts, symbols.ts, historical.ts, company.ts, market.ts, stats.ts
  khistocks/ client.ts, parse.ts, financials.ts, dividends.ts
  format.ts, utils.ts
```

## Tests

```bash
npm test
```

Vitest, no network. The scrapers' pure logic — number and date parsing, period headers,
unit scaling, statement identification, ratio derivation, link scoring, and the full
HTML-to-normalised-statements pipeline — runs against fixtures in `tests/fixtures/`. The
fixtures are written in the shape PSX-listed accounts are published in (line items down,
periods across, `Rs '000`, parenthesised negatives); they stand in for markup that could
not be fetched from the build environment, so they prove the parsing logic is sound, not
that any particular site markup exists. Two invariants are enforced there and worth
keeping: EPS is never multiplied by the statement's unit scale, and every generated
sample statement reconciles line by line.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The scrapers need outbound access to `dps.psx.com.pk` and
`khistocks.com`; behind a restrictive proxy or firewall those requests fail and the app
falls back to sample data (clearly flagged).

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import it. The "Next.js" preset is auto-detected;
   no environment variables are required.
3. Deploy. The history route sets `maxDuration = 60` because a 5Y pull is sixty month
   requests against PSX; the other data routes set 30. That works on Hobby — check your
   plan's function limits if you widen the range options.

## Verifying the scrapers against live sites

This was built in a sandbox whose egress policy blocks both upstream hosts, so the
parsers are written defensively against documented/observed response shapes but have
**not** been run against live HTML. Once deployed somewhere with open egress, the fastest
way to confirm each source is to hit the JSON endpoints and read the `notes` array:

```bash
curl -s https://<your-deployment>/api/symbols | head
curl -s "https://<your-deployment>/api/stock/LUCK/history?range=1M" | jq '.notes, (.bars|length)'
curl -s https://<your-deployment>/api/stock/LUCK/financials | jq '.notes, (.income|length)'
```

A note with `"source": "sample"` means that source did not parse; the accompanying
message names the endpoint and the failure.

`/api/diagnostics?symbol=LUCK` is the fuller picture: it hits every scraped endpoint once,
uncached and without the circuit breaker, and reports the HTTP status, timing, content
type, the first 400 characters of the body, what the parser extracted, and — for khistocks
— the per-symbol links discovery found on each page. The `verdict` field separates the two
failures that need different fixes:

- **Requests failing** (403, timeout, connection refused) — no parser change helps; the
  requests aren't landing.
- **Requests succeeding but nothing parsed** — the site's markup differs from what the
  scrapers expect. The `bodyPrefix`, `rowLabels` and `symbolLinks` fields say how, and the
  fix is a row-label or URL adjustment in `lib/khistocks/`.

## Known limitations / ideas next

- No true intraday or live quotes — see above.
- khistocks pages that render tables via client-side AJAX can't be read by a plain server
  fetch; those would need a headless-browser fetch step.
- History is capped at 10Y (`MAX`) because PSX's per-month scraping makes longer ranges
  expensive; raise `RANGE_MONTHS` in `lib/data/types.ts` and `maxDuration` together.
- No database — every request re-fetches, subject to the Next.js data cache.
- Quarterly statements are parsed if a source publishes them, but neither source is
  currently known to expose a quarterly page; the tabs show annual periods today.
