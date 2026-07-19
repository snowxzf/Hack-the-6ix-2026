# PlotTwist API

Thin Python/FastAPI service between the app and MongoDB / PlantNet / Open-Meteo /
search providers. Secrets stay on the server — never ship them in the client.

## Setup

```bash
# from repo root
cp .env.example .env
# fill MONGODB_URI, Auth0, optional PlantNet / Google keys

cd database
pip install -r requirements.txt
python seed.py

cd ..
pip install -r backend/requirements.txt

# preferred (package import):
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Docs: http://localhost:8000/docs

## MongoDB collections

| Collection | Purpose |
|---|---|
| `plants` | Curated catalog (from `database/seed.py`) |
| `catalog_meta` | Seed metadata |
| `gardens` | Saved layouts (`POST /gardens`) |
| `clients` | Auth0 users — username, xp, streak, friends |

Without `MONGODB_URI`, catalog falls back to bundled JSON and users stay in memory.

## Auth0

Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_AUDIENCE` (= client id).
`auth.py` verifies **ID tokens** (JWKS/RS256). No Auth0 API audience required.

## Day-passage simulator

`simulation.py` steps a planted garden forward day-by-day (carbon ramp + watering
cadence), mirroring `app/src/CarbonChart.tsx` / Dashboard watering logic.

```bash
python simulation.py
pip install -r requirements-dev.txt
pytest test_simulation.py -q
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Mongo ping + plant count + `plantnetConfigured` |
| GET | `/plants` | Full curated catalog |
| GET | `/plants?optimizer=true` | `Species[]` for the optimizer |
| GET | `/plants/{id}` | One plant by id |
| GET | `/plants/search/by-name?q=` | Alias / name / scientific search |
| GET | `/search/videos?q=` | YouTube (gardening-biased); demo fallback if no key |
| GET | `/search/web?q=` | Google Custom Search guides |
| GET | `/search/wikipedia?q=` | Wikipedia summaries |
| GET | `/search?q=` | Combined plants + YouTube + web |
| POST | `/identify` | multipart `image` → PlantNet → catalog match |
| GET | `/plants/suggest?...` | Multi-factor rank (season, weather, carbon, skill) |
| GET | `/geocode?q=` | Open-Meteo geocoding |
| GET | `/weather?lat=&lon=&plantIds=` | Sky + plant temp checks |
| GET | `/weather?location=&confirm=true&plantIds=` | Same via city name |
| GET | `/stats/toronto-food-waste` | Toronto food-waste baselines |
| GET | `/impact/food-waste?foodKg=&kgCo2e=` | Compare yield to Toronto stats |
| POST | `/gardens` | Save a layout JSON |
| GET | `/gardens/{id}` | Load a saved layout |
| GET | `/users/me` | Auth — get/create `clients` profile |
| PUT | `/users/me/username` | Auth — claim username |
| PUT | `/users/me/stats` | Auth — sync xp / streak |
| POST | `/friends/add` | Auth — add friend by username |
| GET | `/friends` | Auth — list friends |
| GET | `/leaderboard` | Auth — you + friends by XP |

## Demo identify

```bash
curl -X POST "http://localhost:8000/identify" \
  -F "image=@tomato.jpg" \
  -F "organ=auto"
```
