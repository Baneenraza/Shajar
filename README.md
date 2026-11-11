# Shajar Ledger

A factory's measured emissions become a tree contract on a farmer's land. Payment is released only when Sentinel-2 imagery shows the trees are alive.

## Run

Open `index.html` in a browser. Nothing to install.

Demo region: Korangi and Landhi industrial areas (Karachi), with farmer plots in Malir, Thatta and Jamshoro.

C04 (out-of-bounds guard): the "Reliability check" section on the page injects five impossible inputs (`C04_CASES` in `logic.js`) and shows each one rejected or flagged. Tests: `node --test`

## Real satellite data

`data.js` holds real values exported on 2026-11-11 (project `shajar-514406`). To refresh or add sites:

1. Open https://code.earthengine.google.com with your team's Earth Engine account.
2. Paste `gee/export_data.js` and click Run.
3. Copy the printed numbers into `data.js` and set `satSource: 'earth-engine'`.

## Files

- `logic.js`: every rule and threshold (`RULES` at the top). Change numbers there.
- `data.js`: sites, farmer plots, satellite passes.
- `app.js`, `index.html`, `style.css`: the page.
- `gee/export_data.js`: Earth Engine export.

## Labelled assumptions to replace before pitching

- Fuel emission factors (approx. IPCC 2006 defaults).
- Prices (PKR 400 per tree per year, PKR 250 planting cost) and the 60/40 farmer split are demo values.
- Farmers, plots and contracts are invented; plot NDVI is real for those coordinates.

## Sources

- Factory emissions: Climate TRACE API v6 (`api.climatetrace.org/v6/assets?countries=PAK&year=2025`), CO2e 100-yr, with Climate TRACE's own confidence rating. Asset IDs are in `data.js`.
- Tree uptake: 6.03 t CO2 per acre per year from IPCC 2019 Refinement Vol 4 Ch 4 (Table 4.10 subtropical steppe Asia, 6 t d.m./ha/yr; Table 4.4 root:shoot 0.44; carbon fraction 0.47), at 500 trees per acre.
- Satellite: Sentinel-5P NO2, Sentinel-2 NDVI with Cloud Score+, ESA WorldCover, LSIB borders, all via Earth Engine.
