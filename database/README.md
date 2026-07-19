# PlotTwist plant catalog

`plants_curated.json` is the version-controlled source of truth (40+ plants).
MongoDB is what the live API reads after seeding.

## Seed Atlas

1. Confirm a DB user exists in Atlas → Database Access.
2. Network Access → allow `0.0.0.0/0` (hackathon).
3. Put secrets in repo-root `.env` (see `.env.example`).
4. Run:

```bash
pip install -r requirements.txt
python seed.py
```

Collections written by seed: `plantapp.plants`, `plantapp.catalog_meta`.

Created at runtime by the API:

| Collection | Who writes it |
|---|---|
| `gardens` | `POST /gardens` |
| `clients` | Auth0 login / `/users/*` (username, xp, streak, friends) |

Gardens and clients are **not** created by `seed.py`.


Vegetable records include `daysToHarvest` (+ min/max) and optional `harvest`
season/weather fields (`plantSeasons`, `frostSensitive`, `slowsBelowC`, etc.).
Live estimates: `GET /plants/{id}?lat=&lon=` or `/plants/suggest` → `harvestEstimate`.

## Verify care fields vs Perenual

1. Add to `.env`: `PERENUAL_API_KEY=...` (from https://perenual.com/docs/api)
2. Dry-run (writes a diff report, does not change JSON):

```bash
python verify_perenual.py
```

3. Apply mapped updates (`sun`, `waterEveryDays`, `heightCm`) + `verified.perenual=true`:

```bash
python verify_perenual.py --apply
python seed.py
```

Does **not** change carbon (`yieldKgPerSeason` / `co2eSavedPerKg`) — those come from OWID.
Caches API responses in `perenual_cache/` (gitignored).

Note: Perenual free tier is 100 requests/day tracked per account **and** per IP,
so the full pass takes a couple of days. Use OpenPlantDB below for a same-day pass.

## Verify care fields vs OpenPlantDB (no key, no rate limit)

[OpenPlantDB](https://github.com/cwfrazier1/openplantdb) is a CC0 dataset of 6k+
garden plants (sun, water, height, days to maturity). One download, no API key.

```bash
python verify_openplantdb.py           # dry-run, writes openplantdb_report.json
python verify_openplantdb.py --apply   # apply updates + verified.openplantdb=true
python seed.py                         # push to Mongo
```

Updates `sun`, `waterEveryDays`, `heightCm`, and veggie `daysToHarvest` min/max
when they disagree materially. Carbon fields are never touched.

## Verify carbon factors vs OWID (Poore & Nemecek 2018)

`co2eSavedPerKg` = the supply-chain footprint of the store-bought equivalent
(kg CO₂e per kg food), from [OWID's ghg-per-kg dataset](https://ourworldindata.org/grapher/ghg-per-kg-poore).
Each plant maps to an explicit OWID category in `verify_carbon_owid.py`
(no fuzzy matching for carbon claims). Ornamentals stay 0 by rule.

```bash
python verify_carbon_owid.py           # dry-run, writes owid_carbon_report.json
python verify_carbon_owid.py --apply   # apply values + verified.carbon=true
python seed.py
```

`yieldKgPerSeason` is agronomic (not in OWID) and stays curated.
