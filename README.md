# PSX Ledger

A Next.js app for looking up historical price, volume, dividend and financial-highlight
data for companies listed on the Pakistan Stock Exchange (PSX).

- **Framework:** Next.js 16 (App Router, TypeScript), Tailwind v4
- **UI:** hand-built shadcn-style primitives (Button, Card, Badge, Table, Tabs, Input,
  Skeleton) + a shadcn-style chart wrapper over Recharts
- **Primary data source:** PSX's own Data Portal, `dps.psx.com.pk`
- **Secondary data source:** `khistocks.com` (dividends & financial highlights only)

## How the data layer works

### PSX (`lib/psx/`)

`dps.psx.com.pk` has no official public API. Two endpoints are used here, verified
against the request/response shapes used by the open-source `psx-data-reader` Python
package (the most reliable reference available for this site):

- `GET /symbols` — the full list of listed symbols, names and sectors. Used to power
  search and to show the company name/sector on a stock's page.
- `POST /historical` with form fields `{ symbol, month, year }` — returns a
  server-rendered HTML table of daily OHLCV bars for that single month. There is no
  native date-range query, so `lib/psx/historical.ts` issues one request per month in
  the requested range (batched 6-at-a-time) and merges the results. Each month is
  cached independently (`unstable_cache`, 6h revalidate) so overlapping ranges reuse
  work instead of re-scraping.

There's no separate "live quote" endpoint wired up, because PSX doesn't expose one
with a documented, stable shape. Instead, `lib/psx/stats.ts` derives the current
snapshot (last close, day change, day range, period high/low, average volume) from the
most recent bar(s) already loaded. This is accurate for end-of-day analysis but is
**not** a real-time streaming quote.

### khistocks.com (`lib/khistocks/`)

khistocks.com doesn't publish an API either, and unlike PSX's `/historical` endpoint,
several of its pages render tables via client-side AJAX rather than static server HTML
— meaning a plain server-side fetch can't always see the data. `lib/khistocks/scrape.ts`
is a best-effort scraper: it tries a few common query-param names (`symbol`, `scrip`,
`company`, `code`) against the dividend-data and financial-highlights pages and parses
whatever `<table>` elements it can find. **Treat this as a bonus, not a guarantee** —
for some symbols it will come back empty, and the UI is designed to say so plainly
rather than show a broken table. If you want to make this more reliable, the fastest
path is to open the relevant khistocks.com page in a browser, inspect the Network tab
for the actual AJAX request it fires, and swap that into `lib/khistocks/scrape.ts`.

## ⚠️ Data-use terms

PSX's own terms for `dps.psx.com.pk` restrict market data to personal, non-commercial
use — no redistribution, resale, or commercial dissemination of the feed. This project
is built for personal/educational analysis on that basis. If you plan to use this for
anything beyond that, review PSX's terms of use on their site first, and check
khistocks.com's terms as well.

## Project structure

```
app/
  page.tsx                        Landing page (search + featured symbols)
  stock/[symbol]/page.tsx         Stock detail page (server component)
  api/symbols/route.ts            GET full symbol directory
  api/stock/[symbol]/history/     GET OHLCV bars for a range
  api/stock/[symbol]/extras/      GET khistocks dividends + financial highlights
components/
  ui/                             Hand-built shadcn-style primitives
  stock/                          Search, charts, tables, stat cards, tabs
  site-header.tsx
lib/
  psx/                            symbols.ts, historical.ts, stats.ts, types.ts
  khistocks/                      scrape.ts, dividends.ts, financials.ts
  format.ts, utils.ts
```

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. Note that the PSX/khistocks scrapers need real outbound
network access to `dps.psx.com.pk` and `khistocks.com` — if you're developing behind a
restrictive proxy/firewall, those requests will fail.

## Deploying to Vercel

1. Push this project to your GitHub repo (see below).
2. In Vercel, **Add New → Project**, import the repo. Framework preset "Next.js" is
   auto-detected — no environment variables are required.
3. Deploy. The two data API routes (`.../history` and `.../extras`) are configured
   with `maxDuration` (60s and 30s) since scraping several months of PSX data in one
   request can take a little while — on Vercel's Hobby plan this works out of the box;
   confirm your plan's function-duration limits if you extend the range options.

### Pushing this project to `hamzawasim07/StockAnalysis`

This was built in a sandboxed environment without push access to your GitHub account,
so from your machine:

```bash
git clone https://github.com/hamzawasim07/StockAnalysis.git
# copy this project's files into that folder (replacing the placeholder README), then:
cd StockAnalysis
git add .
git commit -m "Initial PSX Ledger app"
git push origin main
```

## Known limitations / ideas for v2

- Historical range is capped at 5Y in the UI; PSX's per-month scraping means longer
  ranges cost more requests — raise `HistoryRangeKey` in `lib/psx/types.ts` if you need
  more, and consider raising `maxDuration` accordingly.
- No true intraday/live quotes (see above) — could be added via `dps.psx.com.pk`'s
  market-watch page if you verify its response shape.
- khistocks integration is best-effort by design; a browser-based scrape (e.g. a
  headless-browser scraping service) would be needed for full reliability against its
  AJAX-rendered pages.
- No persistence/database — every request re-fetches (subject to caching), so there's
  no historical snapshot of your own beyond PSX's own history.
