# UK Gilt Curve Tracker — Project Spec

## Overview

A daily-updated UK gilt yield curve viewer with historical overlay capability, covering nominal, real (index-linked), implied inflation, and OIS curves. Hosted on Railway (data pipeline + API) with a Vercel frontend.

---

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  Railway Service        │     │  Vercel Frontend          │
│                         │     │                           │
│  Python data pipeline   │────▶│  React (Next.js or Vite)  │
│  + FastAPI REST API     │     │  Interactive chart UI     │
│  + PostgreSQL (Railway) │     │                           │
│  + Daily cron job       │     │  Recharts / D3 for curves │
└─────────────────────────┘     └──────────────────────────┘
```

### Two services on Railway:
1. **Data pipeline** — Python scheduled job that fetches curve data daily
2. **API server** — FastAPI serving curve data to the frontend

These can be a single Railway service (one Python app doing both), keeping it simple.

### One app on Vercel:
- React frontend with interactive curve visualisation

---

## Data Sources

### 1. Bank of England — Fitted Yield Curves (PRIMARY)

**URL pattern for daily data download:**
```
https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=DD/Mon/YYYY&Dateto=DD/Mon/YYYY&SeriesCodes=SERIES1,SERIES2&UsingCodes=Y
```

**Curve types and key series codes:**

#### Nominal gilt curve (spot rates)
Series codes follow the pattern `IUDMNZC` (nominal zero coupon) at various maturities:
- Short end (monthly intervals to 5Y): e.g. `IUDMNZC` series
- Long end (semi-annual to 40Y)
- Check BoE website for exact series code list

#### Real (index-linked) gilt curve
- `IUDMRZC` pattern (real zero coupon spot rates)
- Available where index-linked gilts exist to anchor the curve

#### Implied inflation term structure
- Derived as: nominal forward - real forward
- BoE publishes this directly in the yield curve spreadsheets

#### OIS curve
- `IUDMNOA` pattern (OIS nominal spot rates)
- Based on SONIA-linked OIS contracts

**Update frequency:** Daily, published by noon the following business day.
**Historical depth:** Data available from mid-1990s for nominal, varies for others.
**Format:** CSV via the URL-based query, or Excel spreadsheet download.

> **Important note:** The BoE explicitly states yield curve data are NOT available via a formal API. The URL-based CSV download from their database is the pragmatic workaround. It works, it's just not officially supported as an API — so build in resilience for format changes.

### 2. FRED API (SUPPLEMENTARY)

For cross-reference and backup:
- `IRLTLT01GBM156N` — UK 10Y benchmark gilt yield (OECD, monthly)
- `IRLTLT01GBD156N` — same, daily frequency
- Good for validation but not sufficient for full curve

### 3. DMO (REFERENCE ONLY)

- Historical average gilt yields at 5Y/10Y/30Y/50Y benchmarks since April 1998
- URL: `https://www.dmo.gov.uk/data/ExportReport?reportCode=D4H`
- Useful for cross-checking, not primary source

---

## Data Model (PostgreSQL)

```sql
-- Core table: one row per curve point per date
CREATE TABLE yield_curve_data (
    id SERIAL PRIMARY KEY,
    curve_date DATE NOT NULL,
    curve_type VARCHAR(20) NOT NULL,  -- 'nominal', 'real', 'inflation', 'ois'
    maturity_months INTEGER NOT NULL,  -- maturity in months (e.g. 6, 12, 60, 120, 360, 480)
    spot_rate DECIMAL(8,4),           -- spot rate in percent
    forward_rate DECIMAL(8,4),        -- instantaneous forward rate in percent
    fetched_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(curve_date, curve_type, maturity_months)
);

-- Index for common queries
CREATE INDEX idx_curve_date_type ON yield_curve_data(curve_date, curve_type);
CREATE INDEX idx_curve_type_maturity ON yield_curve_data(curve_type, maturity_months);

-- Metadata table for tracking fetch status
CREATE TABLE fetch_log (
    id SERIAL PRIMARY KEY,
    fetch_date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,  -- 'success', 'failed', 'partial'
    records_inserted INTEGER,
    error_message TEXT,
    fetched_at TIMESTAMP DEFAULT NOW()
);
```

---

## Data Pipeline (Python)

### Daily fetch job (runs ~12:30 London time on business days)

```
Schedule: Weekdays at 12:30 Europe/London
```

**Steps:**
1. Check if today is a UK business day (skip weekends, bank holidays)
2. Fetch BoE CSV data for the previous business day
3. Parse CSV — extract spot rates and forward rates at all available maturities
4. For each curve type (nominal, real, inflation, OIS):
   - Insert/upsert rows into `yield_curve_data`
5. Log result to `fetch_log`
6. On first run / backfill: fetch historical data in date-range chunks

### Key Python dependencies:
```
fastapi
uvicorn
psycopg2-binary (or asyncpg)
pandas
requests
apscheduler
python-dateutil
holidays  # for UK bank holidays
```

### Backfill strategy:
- BoE URL supports date ranges, so fetch in monthly chunks going back to ~2000
- Rate-limit requests (1 per second) to be respectful
- Store all historical data on first deployment, then daily incremental

---

## API Endpoints (FastAPI)

```
GET /api/curves/latest
  → Returns the most recent available curves (all types)
  → Response: { date, curves: { nominal: [...], real: [...], inflation: [...], ois: [...] } }

GET /api/curves/{date}
  → Returns curves for a specific date (YYYY-MM-DD)
  → Falls back to nearest previous business day if exact date unavailable

GET /api/curves/range?start=YYYY-MM-DD&end=YYYY-MM-DD&type=nominal&maturity=120
  → Time series of a specific maturity point across a date range
  → For "how has the 10Y yield moved over the last year" type queries

GET /api/curves/compare?dates=YYYY-MM-DD,YYYY-MM-DD,YYYY-MM-DD&type=nominal
  → Multiple curves for overlay comparison
  → Max ~10 dates per request
  → For relative date presets, the API resolves to nearest available business day

GET /api/presets
  → Returns the list of preset event dates (both relative and fixed)
  → Frontend renders preset buttons dynamically from this list
  → Adding a new event = one config change on the backend, no frontend redeploy needed

GET /api/curves/dates
  → Returns list of available dates (for date picker)

GET /api/health
  → Health check + last successful fetch date
```

---

## Frontend (React on Vercel)

### Views

#### 1. Today's Curve (default view)
- Full yield curve chart: x-axis = maturity (0–40Y), y-axis = yield (%)
- Toggle between curve types (nominal / real / inflation / OIS)
- Show all four overlaid with different colours, or toggle individually
- Display key benchmark points prominently (2Y, 5Y, 10Y, 30Y)
- Show daily change vs previous day (bp change annotations)

#### 2. Historical Overlay (KEY FEATURE)

This is the core analytical feature. The primary use case is: "What does the curve look like now vs before [event]?" Seeing the curve shift in response to a specific event reveals where the market is pricing stress — short end (rate expectations), long end (term premium/fiscal risk), or parallel shift (general risk-off).

**Controls:**
- "Today's curve" always shown as the primary line
- Date picker to select one or more comparison dates
- Preset event buttons for one-click comparison (see below)
- Up to ~5 curves overlaid, colour-coded with clear legend
- Hover tooltip showing exact yield + bp difference from today at each maturity

**Preset event dates (stored as easily extensible config):**

```python
PRESET_EVENTS = [
    # Relative presets (dynamically calculated)
    {"label": "1 week ago",       "type": "relative", "days": -7},
    {"label": "1 month ago",      "type": "relative", "days": -30},
    {"label": "3 months ago",     "type": "relative", "days": -90},
    {"label": "1 year ago",       "type": "relative", "days": -365},
    
    # Fixed historical events
    {"label": "Pre-COVID",              "type": "fixed", "date": "2020-02-19"},
    {"label": "COVID trough",           "type": "fixed", "date": "2020-03-19"},
    {"label": "Pre-Ukraine invasion",   "type": "fixed", "date": "2022-02-23"},
    {"label": "Pre-mini-budget",        "type": "fixed", "date": "2022-09-22"},
    {"label": "Mini-budget peak",       "type": "fixed", "date": "2022-09-27"},
    {"label": "Post-Brexit vote",       "type": "fixed", "date": "2016-06-24"},
    {"label": "Pre-Trump tariffs",      "type": "fixed", "date": "2025-04-01"},
    # Add new events as they unfold — this config should be trivial to extend
]
```

> **Design principle:** New geopolitical or market events should be addable to the preset list with a single config entry. The frontend should render presets dynamically from this list. Think of it as a living timeline of gilt market shocks — each preset tells a story when overlaid against today's curve.

#### 3. Time Series View
- Select a specific maturity (e.g. 10Y nominal)
- Line chart of that yield over time
- Selectable date range (1M, 3M, 6M, 1Y, 5Y, ALL)
- Option to overlay multiple maturities (2Y + 10Y + 30Y)
- Option to show the 2s10s spread as a derived series

#### 4. Spread / Slope View
- 2Y–10Y spread over time (classic curve steepness indicator)
- 10Y nominal vs 10Y real = breakeven inflation over time
- Custom spread builder: pick any two points

### Design notes
- Dark theme, clean — financial terminal aesthetic without going full Bloomberg
- Responsive but optimised for desktop (this is a desk tool)
- **Plotly recommended** for charting — its multi-trace line charts with shared hover tooltips are ideal for curve overlays. Hover should show exact yield at each maturity plus bp change vs the primary (today's) curve. Zoom and pan are built in.
- Recharts or D3 are alternatives but Plotly gives the best out-of-the-box interactivity for this use case

### Analytical value / potential audience
- Useful as a personal desk tool for monitoring gilt market moves
- Potentially shareable with LGIM colleagues — a quick "what did the gilt curve do around event X" tool that doesn't require a Bloomberg terminal
- Good demo project for the AI Club as an example of building something genuinely useful from free public data with Claude Code

---

## Deployment

### Railway
- Single Python service: FastAPI app + APScheduler for the daily cron
- Railway PostgreSQL add-on for the database
- Environment variables:
  - `DATABASE_URL` (Railway provides this)
  - `BOE_FETCH_ENABLED=true`
  - `TZ=Europe/London`

### Vercel
- React app (Vite or Next.js — Vite is simpler for a pure SPA)
- Environment variable: `VITE_API_URL` pointing to Railway service URL
- Custom domain if desired

---

## Build Phases

### Phase 1: Data pipeline + basic API
- BoE data fetcher (nominal curve only to start)
- PostgreSQL schema + backfill script
- FastAPI with `/api/curves/latest` and `/api/curves/{date}`
- Deploy to Railway, verify data flowing

### Phase 2: Full curve types + historical
- Add real, inflation, OIS curve parsing
- Add `/api/curves/compare` and `/api/curves/range` endpoints
- Historical backfill (all curve types)

### Phase 3: Frontend — Today's Curve
- React app on Vercel
- Interactive curve chart with type toggles
- Daily change annotations

### Phase 4: Frontend — Historical + Time Series
- Date picker overlay view
- Preset comparison buttons (key gilt market events)
- Time series view for individual maturities
- Spread/slope derived views

---

## Open Questions / Risks

1. **BoE URL stability** — the CSV download URL is not an official API. It could change. Build in error handling and alerting if fetches start failing.

2. **Series codes** — the exact BoE series codes for each curve type need to be confirmed by inspecting the actual spreadsheet downloads. This is a Phase 1 research task.

3. **OIS curve availability** — may have less historical depth than the nominal gilt curve. Need to check how far back BoE OIS data goes.

4. **Rate limiting** — no documented rate limits on the BoE database download, but be respectful during backfill.

5. **CORS** — Railway API will need CORS configured to accept requests from Vercel domain.

6. **Cost** — Railway Hobby plan should be sufficient. PostgreSQL storage for ~25 years of daily curve data across 4 curve types × ~80 maturity points = manageable (roughly 2-3M rows).
