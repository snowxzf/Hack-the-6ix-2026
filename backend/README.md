# PlotTwist API

Thin Python/FastAPI service between the app and MongoDB / PlantNet / Open-Meteo.
Secrets stay on the server — never ship them in the mobile client.

## Setup

```bash
# from repo root
cp .env.example .env
# fill MONGODB_URI + PLANTNET_API_KEY

cd database
pip install -r requirements.txt
python seed.py

cd ../backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

## Day-passage simulator

`simulation.py` steps a planted garden forward day-by-day to check the carbon-savings
ramp and watering cadence math (mirrors `app/src/CarbonChart.tsx` and the DashboardScreen
watering-trip grouping) without waiting for a real season to pass.

```bash
python simulation.py              # prints a 14-day demo run

pip install -r requirements-dev.txt
pytest test_simulation.py -q      # unit tests for the ramp + cadence math
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Mongo ping + plant count |
| GET | `/plants` | Full curated catalog |
| GET | `/plants?optimizer=true` | `Species[]` shape for Sara's optimizer |
| GET | `/plants/{id}` | One plant by id |
| GET | `/plants/search/by-name?q=` | Alias / name / scientific search |
| POST | `/identify` | multipart `image` (+ optional `organ`) → PlantNet → catalog match |
| GET | `/plants/suggest?location=Toronto&confirm=true&carbonWeight=0.5` | Multi-factor rank: season + live weather + carbon + native region + skill |
| GET | `/geocode?q=` | Open-Meteo geocoding — city/address → lat/lon candidates (confirm country/admin1) |
| GET | `/weather?lat=&lon=&plantIds=` | Sky forecast + plant temp checks (GPS path) |
| GET | `/weather?location=Toronto&confirm=true&plantIds=` | Same, via typed city (geocode first) |
| GET | `/stats/toronto-food-waste` | Toronto single-family food-waste baselines (2017–2018 audit) |
| GET | `/impact/food-waste?foodKg=&kgCo2e=` | Compare garden yield to Toronto waste stats (% offsets, Green Bin diversion) |
| POST | `/gardens` | Save a layout JSON |
| GET | `/gardens/{id}` | Load a saved layout |

## Demo identify (curl)

```bash
curl -X POST "http://localhost:8000/identify" \
  -F "image=@tomato.jpg" \
  -F "organ=auto"
```
