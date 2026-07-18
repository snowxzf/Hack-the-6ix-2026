# PlotTwist 🌱 — Hack the 6ix 2026

**Helping plants and people grow.** Scan your backyard, tell us what you dream of
growing, and PlotTwist computes the optimal planting layout — space, sunlight,
watering logistics, and carbon footprint included. PlotTwist helps plants and people grow.

### 🚀 Key Features

* **📸 Smart Camera Yard Scanning** — Easily measure awkwardly shaped backyard garden beds just by taking a photo with your phone next to a common object (like a coin).
* **🧠 Smart Garden Layouts** — An intelligent, built-in planner that instantly figures out the best spot for each plant by balancing sunlight, watering needs, spacing, and which plants grow well together.
* **🌍 Track Your Environmental Impact** — See exactly how much carbon you are saving by growing your own food, backed by real environmental data.

## Repo layout

| Package | What | Owner |
|---|---|---|
| `optimizer/` | Layout + carbon optimization engine (pure TS, tested, on-device) | Sara |
| `yard-scan/` | Camera yard measure: coin (recommended) or custom object + tilt + stitch → grid | Jessica / Selina |
| `app/` | Web test UI (scan → preferences → layout → dashboard) | Selina / Richa |
| `database/` | Curated plant JSON + MongoDB seed script | Jessica |
| `backend/` | FastAPI: PlantNet → Mongo lookup, weather, gardens, suggestions | Jessica |

## Packages installed

### Node (frontend / engines)

| Folder | Install | Notable packages |
|---|---|---|
| `optimizer/` | `npm install` | `typescript`, `vitest`, `tsx` |
| `yard-scan/` | `npm install` | `typescript`, `vitest`, `tsx` |
| `app/` | `npm install` | `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript` |

### Python (API / database)

| Folder | Install | Notable packages |
|---|---|---|
| `database/` | `pip install -r requirements.txt` | `pymongo`, `dnspython`, `python-dotenv` |
| `backend/` | `pip install -r requirements.txt` | `fastapi`, `uvicorn`, `pymongo`, `httpx`, `python-multipart`, `python-dotenv` |

Secrets stay in repo-root `.env` (gitignored). Template: `.env.example`.

## Quickstart

**Test website** (scan UI + optimizer)

```bash
cd app && npm install && npm run dev
```

Open the Vite URL (usually http://localhost:5173). On **Scan**:
1. Choose **Coin (recommended)** or **Custom object**
2. Upload a yard photo
3. Tap both edges of the reference; a bed outline is pre-placed — drag its corners to fit (tap to add corners for odd shapes)
4. **Measure yard →** (or skip to the demo yard)

**Optimizer**

```bash
cd optimizer && npm install && npm test && npm run demo
```

**Yard scan** (library only)

```bash
cd yard-scan && npm install && npm test && npm run demo
```

**Catalog + API**

```bash
cd database && pip install -r requirements.txt && python seed.py
cd ../backend && pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Data contracts: `optimizer/src/types.ts`
- Curated source of truth: `database/plants_curated.json` (seed into Mongo; app reads via backend)

**Carbon honesty:** food plants only — `yieldKgPerSeason × co2eSavedPerKg` (Poore & Nemecek / OWID). Ornamentals get no invented CO₂e; their impact case is pollinator/biodiversity.

## Data sources & credits

| Source | Used for | License / tier |
|---|---|---|
| [PlantNet](https://my.plantnet.org/) | Photo → species identification | Free API key |
| [Open-Meteo](https://open-meteo.com/) | Live weather + geocoding for plant checks and harvest estimates | Free, keyless |
| [OpenPlantDB](https://github.com/cwfrazier1/openplantdb) | Care-field verification: sun, water, height, days to maturity (**42/42 plants verified**) | CC0 (public domain) |
| [Perenual](https://perenual.com/docs/api) | Second care-data check (10/42 so far; free tier is 100 req/day) | Free API key, non-commercial |
| [Our World in Data / Poore & Nemecek 2018](https://ourworldindata.org/grapher/ghg-per-kg-poore) | CO₂e factors for store-bought food equivalents (**42/42 verified**, explicit category mapping) | CC BY |
| [City of Toronto food waste audits](https://www.toronto.ca/services-payments/recycling-organics-garbage/waste-management/waste-reduction/food-waste/) | Pitch impact baselines | Public data |

Our catalog (`database/plants_curated.json`) is hand-curated, then cross-checked
against these sources — each plant carries `verified` flags per source.

## Toronto Food Waste Context

Source: [City of Toronto — Food Waste](https://www.toronto.ca/services-payments/recycling-organics-garbage/waste-management/waste-reduction/food-waste/) (2017–2018 single-family household audits).

| Stat | Value |
|---|---|
| City-wide food waste generated annually | **99,000+ tonnes** (avoidable + unavoidable) |
| Average single-family household food waste | **200+ kg / year** |
| Avoidable food waste | **100+ kg / year** (>50% of total) |
| Most wasted edible category | **Fruits & vegetables — ~45 kg / household / year** |
| Put in the Green Bin | **~80%** of food waste |
| Canadian household edible waste (same page, national) | **$1,300+ / year** thrown away |

PlotTwist connects home-grown food to these numbers in the backend (`backend/food_waste_stats.py`):

```
% fruit/veg waste offset   = foodKgPerSeason ÷ 45 × 100
% avoidable waste offset   = foodKgPerSeason ÷ 100 × 100
% total food waste offset  = foodKgPerSeason ÷ 200 × 100
Green Bin diversion (est.) = foodKgPerSeason × 0.80
$ edible waste avoided (est.) = (foodKgPerSeason ÷ 100) × $1,300 CAD
```

`foodKgPerSeason` comes from the optimizer (`yieldKgPerSeason × plant count`). One season is treated as one year for the comparison.

**API**

```bash
curl http://localhost:8000/stats/toronto-food-waste
curl "http://localhost:8000/impact/food-waste?foodKg=22.5"
```

Example: a garden yielding **22.5 kg** food/season offsets **50%** of the typical Toronto household’s annual fruit & veg waste, **22.5%** of avoidable waste, and keeps an estimated **18 kg** out of the Green Bin.