# Shajar Ledger

A marketplace where Karachi factories pay farmers directly to grow trees. The factory pays the planting cost upfront when it accepts a farmer's offer; after that a satellite checks every plot every three months, and the factory pays only while the trees are seen alive.

## Run

Needs Node.js 22.5 or newer (it uses the SQLite built into Node). Nothing to install.

```
node server/server.js
```

Open http://localhost:8765. To let phones on the same Wi-Fi open it, start with `HOST=0.0.0.0 node server/server.js` (PowerShell: `$env:HOST="0.0.0.0"; node server/server.js`) and open `http://<this computer's IP>:8765` on the phone.

Data lives in `server/shajar.db` (created on first run, not committed). "Reset demo data" on the overview restores the starting data. Opening `index.html` without the server still shows the starting data, read-only.

Tests: `node --test` (rules, C07 scoring and the backend API).

## Pages

| Page | For | What it does |
|---|---|---|
| `index.html` | Judges, anyone | The whole story: emissions, trees needed, marketplace, satellite checks, money, and the C04, C07 and C12 challenge sections |
| `signin.html` | Everyone | Demo sign-in: pick factory or farmer and a name (no passwords). Each role then sees only its own dashboard. |
| `factory.html` | Factories | Emissions 2024 vs 2025 with a live Climate TRACE refresh, tree requirement, farmer offers to accept (paying planting upfront), contracts, payments, claim check, activity |
| `farmer.html` | Farmers | Earnings (planting money plus checks), land with satellite tiles, earnings history, offers, offer form, satellite check of claims, activity |

Every open page updates within a second when anyone changes something (server-sent events).

## Backend API (`server/server.js`)

| Method and path | Does |
|---|---|
| `GET /api/state` | Everything the pages show: factories (with any live Climate TRACE figures), plots, offers, shares, recent activity |
| `POST /api/offers` | A farmer offers land. Checked with the same rules as the page, so impossible offers are refused with the reason. |
| `POST /api/offers/:id/accept` | A factory accepts and pays the planting cost upfront (PKR 250 per tree); the land's other offers are withdrawn (one contract per plot) |
| `POST /api/shares` | A factory sets how much of its emissions to cover (0 to 100%) |
| `POST /api/claims/check` | C12: checks a declared figure and statement against independent sources |
| `POST /api/refresh/climate-trace` | Fetches the latest 2025 and 2024 figures from the Climate TRACE API; keeps the old figure for any factory it cannot read |
| `POST /api/reset` | Restores the demo data |
| `GET /api/stream` | Live update events |

Requests are limited to 32 KB, the server's own files and the database are never served, and only listed file types are.

## Challenges

- **C04, out-of-bounds guard:** `C04_CASES` in `logic.js` feed five impossible inputs through the app's rules; each is rejected or flagged (overview, "Bad data is caught").
- **C07, model vs simple rules:** `gee/c07_benchmark.js` (Earth Engine export) and `gee/c07_score.js` train a random forest on a year of Sentinel-2 photos and score it against one-photo and yearly-average greenness rules; `c07/score.js` writes `c07/results.js`, shown on the overview. `c07/label.html` is the blind hand-labelling page.
- **C12, claims cross-check:** `parseClaims`, `crossCheckFactory` and `crossCheckPlot` in `logic.js` compare declared figures and statements with Climate TRACE (2025 figure and 2024 to 2025 change), the Sentinel-5P air signal, Sentinel-2 greenness, ESA WorldCover tree cover and the per-acre limit.

## Files

- `logic.js`: every rule and threshold (`RULES` at the top), shared by the pages and the server.
- `data.js`: real figures exported from Climate TRACE and Earth Engine, plus the demo farmers, offers and example claims.
- `server/server.js`: backend; `server/server.test.js`: its tests.
- `store.js`: talks to the backend; `ui.js`: shared page parts; `app.js`, `factory.js`, `farmer.js`, `signin.js`: one per page; `style.css`.
- `gee/export_data.js`: Earth Engine export of the satellite numbers in `data.js`.

## Data sources

- **Factory emissions:** Climate TRACE API v6, CO2e 100-year, with its own confidence rating. Facility IDs are in `data.js`. The single-asset endpoint only returns its latest full year, so the server reads each year from `api.climatetrace.org/v6/assets?countries=PAK&year=Y`.
- **Satellite (through Google Earth Engine, project `shajar-514406`):** Sentinel-5P nitrogen dioxide, Sentinel-2 greenness (NDVI) with Cloud Score+, ESA WorldCover 2021, LSIB borders. Exported on 11 November 2026; rerun `gee/export_data.js` to refresh.
- **Tree uptake:** 6.03 t CO2 per acre per year from the IPCC 2019 Refinement, Vol 4 Ch 4 (Table 4.10 subtropical steppe Asia, 6 t dry matter per hectare per year; Table 4.4 root-to-shoot 0.44; carbon fraction 0.47), at 500 trees per acre.

## Made up for the demo

Farmers, plot sizes, distance to water, flood risk, contracts, offers, the C12 example statements and prices (PKR 250 per tree planting paid upfront, PKR 400 per tree per year for living trees). Plot locations are real, so their satellite readings are real.
