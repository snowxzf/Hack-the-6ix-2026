"""
PlotTwist API — thin backend between the app and MongoDB / PlantNet / Open-Meteo.

Keeps secrets (Mongo URI, PlantNet key) off the mobile client.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any

from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB = os.getenv("MONGODB_DB", "plantapp")
PLANTNET_API_KEY = os.getenv("PLANTNET_API_KEY", "")
PLANTNET_PROJECT = os.getenv("PLANTNET_PROJECT", "all")
PLANTNET_URL = f"https://my-api.plantnet.org/v2/identify/{PLANTNET_PROJECT}"

# Species fields the optimizer expects (see optimizer/src/types.ts)
SPECIES_FIELDS = (
    "id",
    "name",
    "tier",
    "category",
    "cellsPerPlant",
    "sun",
    "waterEveryDays",
    "heightCm",
    "yieldKgPerSeason",
    "co2eSavedPerKg",
    "companions",
)

app = FastAPI(
    title="PlotTwist API",
    description="Plant catalog + PlantNet identify + Open-Meteo weather for PlotTwist.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_client: MongoClient | None = None


def get_db() -> Database:
    global _client
    if not MONGODB_URI:
        raise HTTPException(
            status_code=503,
            detail="MONGODB_URI is not configured on the server",
        )
    if _client is None:
        _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=10000)
    return _client[MONGODB_DB]


def plants_coll() -> Collection:
    return get_db()["plants"]


def gardens_coll() -> Collection:
    return get_db()["gardens"]


def strip_mongo_id(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if doc is None:
        return None
    out = dict(doc)
    out.pop("_id", None)
    return out


def to_species(doc: dict[str, Any]) -> dict[str, Any]:
    return {k: doc[k] for k in SPECIES_FIELDS if k in doc}


def norm(s: str) -> str:
    s = s.lower().strip()
    s = s.replace("×", "x")
    s = re.sub(r"[^a-z0-9\s\-]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def match_catalog(plantnet_result: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Best-effort match of a PlantNet hit to our curated catalog."""
    species = plantnet_result.get("species") or {}
    scientific = norm(species.get("scientificNameWithoutAuthor") or "")
    common_names = [norm(n) for n in (species.get("commonNames") or [])]

    # Build lookup once
    by_sci: dict[str, list[dict]] = {}
    by_alias: dict[str, list[dict]] = {}
    for p in catalog:
        by_sci.setdefault(norm(p.get("scientificName", "")), []).append(p)
        for a in p.get("aliases") or []:
            by_alias.setdefault(norm(a), []).append(p)
        by_alias.setdefault(norm(p.get("name", "")), []).append(p)

    # 1) scientific name exact
    if scientific and scientific in by_sci:
        return by_sci[scientific][0]

    # 2) first two binomial tokens (handles cultivars / authorship noise)
    sci_tokens = scientific.split()
    if len(sci_tokens) >= 2:
        binomial = f"{sci_tokens[0]} {sci_tokens[1]}"
        for key, plants in by_sci.items():
            key_tokens = key.split()
            key_bin = (
                f"{key_tokens[0]} {key_tokens[1]}"
                if len(key_tokens) >= 2
                else key
            )
            if binomial == key_bin or binomial.startswith(key_bin) or key_bin.startswith(binomial):
                return plants[0]

    # 3) common name / alias
    for cn in common_names:
        if not cn:
            continue
        if cn in by_alias:
            return by_alias[cn][0]
        for alias, plants in by_alias.items():
            if cn in alias or alias in cn:
                return plants[0]

    return None


@app.get("/health")
def health() -> dict[str, Any]:
    mongo_ok = False
    plant_count = None
    try:
        db = get_db()
        db.command("ping")
        mongo_ok = True
        plant_count = plants_coll().count_documents({})
    except Exception as exc:  # noqa: BLE001 — surface for hackathon debugging
        return {
            "ok": False,
            "mongo": False,
            "error": str(exc),
            "plantnetConfigured": bool(PLANTNET_API_KEY),
        }
    return {
        "ok": True,
        "mongo": mongo_ok,
        "plantCount": plant_count,
        "plantnetConfigured": bool(PLANTNET_API_KEY),
    }


@app.get("/plants")
def list_plants(optimizer: bool = False) -> dict[str, Any]:
    """Full catalog. Pass optimizer=true for Species[] shape only."""
    docs = list(plants_coll().find({}, {"_id": 0}))
    if optimizer:
        return {"plants": [to_species(d) for d in docs]}
    return {"count": len(docs), "plants": docs}


@app.get("/plants/search/by-name")
def search_plants(q: str, limit: int = 10) -> dict[str, Any]:
    qn = norm(q)
    if not qn:
        raise HTTPException(status_code=400, detail="q is required")
    docs = list(plants_coll().find({}, {"_id": 0}))
    hits: list[dict[str, Any]] = []
    for p in docs:
        hay = " ".join(
            [
                p.get("id", ""),
                p.get("name", ""),
                p.get("scientificName", ""),
                " ".join(p.get("aliases") or []),
            ]
        )
        if qn in norm(hay):
            hits.append(p)
        if len(hits) >= limit:
            break
    return {"query": q, "count": len(hits), "plants": hits}


@app.get("/plants/{plant_id}")
def get_plant(plant_id: str) -> dict[str, Any]:
    doc = plants_coll().find_one({"id": plant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Plant '{plant_id}' not found")
    return doc


@app.post("/identify")
async def identify(
    image: UploadFile = File(...),
    organ: str = Form("auto"),
) -> dict[str, Any]:
    """
    Live PlantNet call → match top results against Mongo plants collection.
    Returns merged curated record when we have one; otherwise raw PlantNet hits.
    """
    if not PLANTNET_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="PLANTNET_API_KEY is not configured (sign up at https://my.plantnet.org)",
        )

    content = await image.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty image")

    filename = image.filename or "upload.jpg"
    mime = image.content_type or "image/jpeg"

    params = {"api-key": PLANTNET_API_KEY, "include-related-images": "false"}
    files = {"images": (filename, content, mime)}
    data = {"organs": organ}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(PLANTNET_URL, params=params, files=files, data=data)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail={"plantnetStatus": resp.status_code, "body": resp.text[:500]},
        )

    payload = resp.json()
    results = payload.get("results") or []
    catalog = list(plants_coll().find({}, {"_id": 0}))

    matches: list[dict[str, Any]] = []
    for hit in results[:5]:
        plant = match_catalog(hit, catalog)
        matches.append(
            {
                "score": hit.get("score"),
                "plantnet": {
                    "scientificName": (hit.get("species") or {}).get("scientificName"),
                    "scientificNameWithoutAuthor": (hit.get("species") or {}).get(
                        "scientificNameWithoutAuthor"
                    ),
                    "commonNames": (hit.get("species") or {}).get("commonNames") or [],
                },
                "catalogMatch": plant,
                "species": to_species(plant) if plant else None,
            }
        )

    best = next((m for m in matches if m["catalogMatch"]), None)

    return {
        "bestMatch": best,
        "candidates": matches,
        "plantnetBestMatch": payload.get("bestMatch"),
        "remainingIdentificationRequests": payload.get("remainingIdentificationRequests"),
    }


@app.get("/weather")
async def weather(lat: float, lon: float, plantIds: str | None = None) -> dict[str, Any]:
    """
    Open-Meteo forecast + optional frost / skip-watering hints for planted species.
    plantIds: comma-separated catalog ids.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "temperature_2m_min,temperature_2m_max,precipitation_sum,weathercode",
        "timezone": "auto",
        "forecast_days": 3,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, params=params)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Open-Meteo request failed")

    forecast = resp.json()
    daily = forecast.get("daily") or {}
    mins = daily.get("temperature_2m_min") or []
    precip = daily.get("precipitation_sum") or []

    notifications: list[dict[str, Any]] = []
    if mins and mins[0] is not None and mins[0] <= 2:
        notifications.append(
            {
                "type": "frost_warning",
                "message": f"Tonight's low is ~{mins[0]}°C — protect frost-sensitive plants.",
                "severityMinC": mins[0],
            }
        )
    if precip and precip[0] is not None and precip[0] >= 2:
        notifications.append(
            {
                "type": "skip_watering",
                "message": f"~{precip[0]} mm rain expected today — skip watering.",
                "precipMm": precip[0],
            }
        )

    plant_alerts: list[dict[str, Any]] = []
    if plantIds and mins:
        ids = [x.strip() for x in plantIds.split(",") if x.strip()]
        for pid in ids:
            plant = plants_coll().find_one({"id": pid}, {"_id": 0})
            if not plant:
                continue
            tmin = plant.get("tempMinC")
            if tmin is not None and mins[0] is not None and mins[0] < tmin:
                plant_alerts.append(
                    {
                        "plantId": pid,
                        "name": plant.get("name"),
                        "type": "below_temp_tolerance",
                        "tempMinC": tmin,
                        "forecastMinC": mins[0],
                        "message": (
                            f"{plant.get('name')} prefers ≥ {tmin}°C; "
                            f"forecast low is {mins[0]}°C."
                        ),
                    }
                )

    return {
        "location": {"lat": lat, "lon": lon},
        "forecast": forecast,
        "notifications": notifications,
        "plantAlerts": plant_alerts,
    }


@app.post("/gardens")
def save_garden(body: dict[str, Any]) -> dict[str, Any]:
    """Persist a scanned/optimized garden layout for the demo."""
    doc = {
        **body,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    if "createdAt" not in doc:
        doc["createdAt"] = doc["updatedAt"]
    result = gardens_coll().insert_one(doc)
    return {"id": str(result.inserted_id), "ok": True}


@app.get("/gardens/{garden_id}")
def get_garden(garden_id: str) -> dict[str, Any]:
    from bson import ObjectId
    from bson.errors import InvalidId

    try:
        oid = ObjectId(garden_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid garden id") from exc

    doc = gardens_coll().find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Garden not found")
    doc["id"] = str(doc.pop("_id"))
    return doc


@app.on_event("shutdown")
def shutdown() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
