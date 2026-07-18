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
3. Tap both edges of the reference, then bed corners
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
