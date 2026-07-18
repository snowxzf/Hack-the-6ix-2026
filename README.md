# PlotTwist 🌱 — Hack the 6ix 2026

**Helping plants and people grow.** Scan your backyard, tell us what you dream of
growing, and PlotTwist computes the optimal planting layout — space, sunlight,
watering logistics, and carbon footprint included. When your dreams don't fit
your yard, we negotiate. That's the plot twist.

## Repo layout

| Package | What | Owner |
|---|---|---|
| `optimizer/` | Layout + carbon optimization engine (pure TS, tested, on-device) | Sara |
| `app/` | Mobile app (scan → preferences → layout → dashboard) | Selina |
| `database/` | Curated plant JSON + MongoDB seed script | Jessica |
| `backend/` | FastAPI: PlantNet → Mongo lookup, weather, gardens | Jessica |

## Quickstart

**Optimizer**

```bash
cd optimizer && npm install && npm test && npm run demo
```

**Catalog + API** (secrets in `.env` — copy from `.env.example`)

```bash
cd database && pip install -r requirements.txt && python seed.py
cd ../backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Data contracts: `optimizer/src/types.ts`
- Curated source of truth: `database/plants_curated.json` (seed into Mongo; app reads via backend)

**Carbon honesty:** food plants only — `yieldKgPerSeason × co2eSavedPerKg` (Poore & Nemecek / OWID). Ornamentals get no invented CO₂e; their impact case is pollinator/biodiversity.
