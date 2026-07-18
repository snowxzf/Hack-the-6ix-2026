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

Collections written: `plantapp.plants`, `plantapp.catalog_meta`.
Gardens are created at runtime by `POST /gardens` on the backend.

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
