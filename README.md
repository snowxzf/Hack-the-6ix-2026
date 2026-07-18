# PlotTwist 🌱 — Hack the 6ix 2026

**Helping plants and people grow.** Scan your backyard, tell us what you dream of
growing, and PlotTwist computes the optimal planting layout — space, sunlight,
watering logistics, and carbon footprint included. When your dreams don't fit
your yard, we negotiate. That's the plot twist.

## Repo layout

| Package | What | Owner |
|---|---|---|
| `optimizer/` | Layout + carbon optimization engine (pure TS, tested, on-device) | Sara |
| `yard-scan/` | Camera yard measure: coin (recommended) or custom object + tilt + stitch → grid | Jessica / Selina |
| `app/` | Web test UI (scan → preferences → layout → dashboard) | Selina |
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
| [Our World in Data / Poore & Nemecek 2018](https://ourworldindata.org/food-choice-vs-eating-local) | CO₂e factors for store-bought food equivalents | CC BY |
| [City of Toronto food waste audits](https://www.toronto.ca/services-payments/recycling-organics-garbage/waste-management/waste-reduction/food-waste/) | Pitch impact baselines | Public data |

Our catalog (`database/plants_curated.json`) is hand-curated, then cross-checked
against these sources — each plant carries `verified` flags per source.

## Toronto food waste context (pitch data)

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

## Pitch — what to say

Use this as a script outline (≈2–3 min). Swap in live numbers from your demo layout.

### 1. Hook (problem — local + relatable)

> “Toronto single-family homes throw away **over 200 kg of food every year** — more than **100 kg is avoidable**, and **fruits and vegetables are the #1 wasted food** at about **45 kg per household**. Almost **80%** of that still goes in the Green Bin. Canadians waste **$1,300+** of edible food at home annually. People want to grow their own food, but most don’t know *what* fits *their* yard, sun, or skill level — so good intentions turn into wasted space and wasted groceries.”

### 2. Solution (what PlotTwist does)

> “**PlotTwist** scans your yard, learns what you want to grow, and computes an **optimized planting layout** — space, sunlight, watering, companions, and **carbon impact**. When your dream garden doesn’t fit, we **negotiate** — that’s the plot twist: we trade plants, shrink beds, and show greener swaps instead of saying no.”

### 3. Demo beat (show, don’t tell)

Walk through: **Scan → Preferences → Select → Results → Dashboard**

Call out one concrete win from the results screen, e.g.:

> “This **demo backyard** grows **~X kg of food per season**, offsets **Y%** of the average Toronto household’s **fruit & veg waste**, and saves **~Z kg CO₂e** — food plants only, no greenwashing on flowers.”

(Pull X/Y/Z from the app’s **kg food grown**, `/impact/food-waste?foodKg=X`, and **kg CO₂e saved** stats.)

### 4. Why it’s credible

- **Yard scan:** coin or reference object + phone camera → real grid (`yard-scan/`)
- **Optimizer:** on-device TypeScript engine, tested (`optimizer/`)
- **Plants & weather:** curated catalog verified vs OpenPlantDB + Perenual, live Open-Meteo, PlantNet ID (`backend/`, `database/`)
- **Honest carbon:** only food yield × published lifecycle factors; ornamentals = pollinator story, not fake CO₂e
- **Toronto math:** comparisons backed by City audit data, not vibes (`/impact/food-waste`)

### 5. Close (impact + vision)

> “We’re not just a garden planner — we’re helping **Toronto households grow food that would otherwise be wasted**, with numbers tied to **City waste audits**. PlotTwist turns a backyard photo into a **measurable** step toward less Green Bin waste, lower grocery bills, and lower food-mile emissions. **Helping plants and people grow.**”

### Sound bites (one-liners if judges ask)

- **Problem:** “The average Toronto home wastes **45 kg of produce a year** — we help you grow that instead.”
- **Differentiator:** “When your garden doesn’t fit, we **negotiate**, not reject.”
- **Impact:** “Every kg you grow is a kg that never hit the **Green Bin**.”
- **Honesty:** “We only claim CO₂e on **food you actually yield** — no invented numbers for petunias.”

### What not to claim

- Don’t say PlotTwist eliminates all household food waste — compare to **baselines** (45 / 100 / 200 kg).
- Don’t conflate **CO₂e from growing vs buying** with **methane from landfill** unless you add a separate model.
- The **$1,300** figure is **Canadian national** context on Toronto’s page, not a Toronto-only audit — say “estimated” or “roughly.”
