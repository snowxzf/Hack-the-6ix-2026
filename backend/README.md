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

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Mongo ping + plant count |
| GET | `/plants` | Full curated catalog |
| GET | `/plants?optimizer=true` | `Species[]` shape for Sara's optimizer |
| GET | `/plants/{id}` | One plant by id |
| GET | `/plants/search/by-name?q=` | Alias / name / scientific search |
| POST | `/identify` | multipart `image` (+ optional `organ`) → PlantNet → catalog match |
| GET | `/weather?lat=&lon=&plantIds=` | Open-Meteo + frost / skip-watering hints |
| POST | `/gardens` | Save a layout JSON |
| GET | `/gardens/{id}` | Load a saved layout |

## Demo identify (curl)

```bash
curl -X POST "http://localhost:8000/identify" \
  -F "image=@tomato.jpg" \
  -F "organ=auto"
```
