"""
PlotTwist API — thin backend between the app and MongoDB / PlantNet / Open-Meteo.

Keeps secrets (Mongo URI, PlantNet key) off the mobile client.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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

# WMO weather interpretation codes (Open-Meteo). Sky only — not plant advice.
WMO_WEATHER_CODES: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}

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

    by_sci: dict[str, list[dict]] = {}
    by_alias: dict[str, list[dict]] = {}
    for p in catalog:
        by_sci.setdefault(norm(p.get("scientificName", "")), []).append(p)
        for a in p.get("aliases") or []:
            by_alias.setdefault(norm(a), []).append(p)
        by_alias.setdefault(norm(p.get("name", "")), []).append(p)

    if scientific and scientific in by_sci:
        return by_sci[scientific][0]

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

    for cn in common_names:
        if not cn:
            continue
        if cn in by_alias:
            return by_alias[cn][0]
        for alias, plants in by_alias.items():
            if cn in alias or alias in cn:
                return plants[0]

    return None


def describe_weather_code(code: int | None) -> str | None:
    if code is None:
        return None
    return WMO_WEATHER_CODES.get(int(code), f"Unknown code {code}")


def is_storm_code(code: int | None) -> bool:
    if code is None:
        return False
    c = int(code)
    return c >= 95 or c in (65, 67, 75, 82, 86)


def format_place_label(hit: dict[str, Any]) -> str:
    parts = [hit.get("name"), hit.get("admin1"), hit.get("country")]
    return ", ".join(p for p in parts if p)


async def geocode_search(name: str, count: int = 5) -> list[dict[str, Any]]:
    """Open-Meteo geocoding — free, keyless. Returns place candidates with lat/lon."""
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {
        "name": name,
        "count": max(1, min(count, 10)),
        "language": "en",
        "format": "json",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Open-Meteo geocoding failed")

    results = (resp.json() or {}).get("results") or []
    places: list[dict[str, Any]] = []
    for hit in results:
        places.append(
            {
                "name": hit.get("name"),
                "latitude": hit.get("latitude"),
                "longitude": hit.get("longitude"),
                "country": hit.get("country"),
                "countryCode": hit.get("country_code"),
                "admin1": hit.get("admin1"),
                "label": format_place_label(hit),
                "timezone": hit.get("timezone"),
                "population": hit.get("population"),
            }
        )
    return places


async def forecast_for(
    lat: float,
    lon: float,
    plant_ids: str | None = None,
    resolved_location: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Sky forecast from Open-Meteo + optional Mongo plant tolerance checks."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,precipitation,weather_code",
        "daily": (
            "temperature_2m_min,temperature_2m_max,"
            "precipitation_sum,precipitation_probability_max,weathercode"
        ),
        "timezone": "auto",
        "forecast_days": 7,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, params=params)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Open-Meteo request failed")

    raw = resp.json()
    current = raw.get("current") or {}
    daily = raw.get("daily") or {}

    times = daily.get("time") or []
    mins = daily.get("temperature_2m_min") or []
    maxs = daily.get("temperature_2m_max") or []
    precip = daily.get("precipitation_sum") or []
    precip_prob = daily.get("precipitation_probability_max") or []
    codes = daily.get("weathercode") or []

    week: list[dict[str, Any]] = []
    for i, day in enumerate(times):
        code = codes[i] if i < len(codes) else None
        week.append(
            {
                "date": day,
                "tempMinC": mins[i] if i < len(mins) else None,
                "tempMaxC": maxs[i] if i < len(maxs) else None,
                "precipMm": precip[i] if i < len(precip) else None,
                "precipProbabilityPct": precip_prob[i] if i < len(precip_prob) else None,
                "weatherCode": code,
                "weather": describe_weather_code(code),
                "storm": is_storm_code(code),
            }
        )

    today = week[0] if week else None
    tonight_low = today["tempMinC"] if today else None
    today_high = today["tempMaxC"] if today else None

    notifications: list[dict[str, Any]] = []
    if tonight_low is not None and tonight_low <= 2:
        notifications.append(
            {
                "type": "frost_warning",
                "message": f"Tonight's low is ~{tonight_low}°C — frost risk for the garden.",
                "tonightMinC": tonight_low,
            }
        )
    if today and today.get("precipMm") is not None and today["precipMm"] >= 2:
        notifications.append(
            {
                "type": "skip_watering",
                "message": f"~{today['precipMm']} mm rain expected today — skip watering.",
                "precipMm": today["precipMm"],
            }
        )
    if today and today.get("storm"):
        notifications.append(
            {
                "type": "storm_warning",
                "message": f"Stormy conditions expected today ({today.get('weather')}).",
                "weatherCode": today.get("weatherCode"),
            }
        )

    plant_checks: list[dict[str, Any]] = []
    if plant_ids and today:
        ids = [x.strip() for x in plant_ids.split(",") if x.strip()]
        for pid in ids:
            plant = plants_coll().find_one({"id": pid}, {"_id": 0})
            if not plant:
                plant_checks.append(
                    {
                        "plantId": pid,
                        "ok": False,
                        "type": "unknown_plant",
                        "message": f"No catalog plant with id '{pid}'.",
                    }
                )
                continue

            tmin = plant.get("tempMinC")
            tmax = plant.get("tempMaxC")
            issues: list[dict[str, Any]] = []

            if tmin is not None and tonight_low is not None and tonight_low < tmin:
                issues.append(
                    {
                        "type": "too_cold_tonight",
                        "message": (
                            f"Is it too cold outside for {plant.get('name')} tonight? "
                            f"Yes — forecast low {tonight_low}°C is below its "
                            f"tolerance floor of {tmin}°C."
                        ),
                        "forecastMinC": tonight_low,
                        "plantTempMinC": tmin,
                    }
                )

            if tmax is not None and today_high is not None and today_high > tmax:
                issues.append(
                    {
                        "type": "too_hot_today",
                        "message": (
                            f"Today's high {today_high}°C is above "
                            f"{plant.get('name')}'s tolerance ceiling of {tmax}°C."
                        ),
                        "forecastMaxC": today_high,
                        "plantTempMaxC": tmax,
                    }
                )

            if issues:
                plant_checks.append(
                    {
                        "plantId": pid,
                        "name": plant.get("name"),
                        "ok": False,
                        "tempMinC": tmin,
                        "tempMaxC": tmax,
                        "issues": issues,
                    }
                )
            else:
                plant_checks.append(
                    {
                        "plantId": pid,
                        "name": plant.get("name"),
                        "ok": True,
                        "tempMinC": tmin,
                        "tempMaxC": tmax,
                        "message": (
                            f"{plant.get('name')} is within tolerance tonight/today "
                            f"(sky low {tonight_low}°C / high {today_high}°C vs "
                            f"plant {tmin}–{tmax}°C)."
                        ),
                    }
                )

    current_code = current.get("weather_code")
    return {
        "role": (
            "Open-Meteo provides sky-only forecast for this lat/lon. "
            "Plant advice comes from cross-checking those numbers against "
            "each species' tempMinC/tempMaxC in our Mongo catalog."
        ),
        "location": {
            "lat": lat,
            "lon": lon,
            "timezone": raw.get("timezone"),
            "resolved": resolved_location,
        },
        "sky": {
            "now": {
                "tempC": current.get("temperature_2m"),
                "precipMm": current.get("precipitation"),
                "weatherCode": current_code,
                "weather": describe_weather_code(current_code),
                "time": current.get("time"),
            },
            "today": today,
            "week": week,
        },
        "notifications": notifications,
        "plantChecks": plant_checks,
        "raw": raw,
    }


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


@app.get("/geocode")
async def geocode(q: str, count: int = 5) -> dict[str, Any]:
    """
    Type a city/address → Open-Meteo geocoding candidates (keyless).

    Return several hits with country/admin1 so the UI can confirm
    ("Toronto, Ontario, Canada — is this right?") before forecasting.
    City names collide (Toronto, OH vs Toronto, ON).
    """
    q = (q or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="q is required")

    places = await geocode_search(q, count=count)
    if not places:
        raise HTTPException(status_code=404, detail=f"No location found for '{q}'")

    return {
        "query": q,
        "count": len(places),
        "needsConfirmation": len(places) > 1,
        "confirmPrompt": (
            f"{places[0]['label']} — is this right?"
            if places
            else None
        ),
        "results": places,
    }


@app.get("/weather")
async def weather(
    lat: float | None = None,
    lon: float | None = None,
    location: str | None = None,
    resultIndex: int = 0,
    confirm: bool = False,
    plantIds: str | None = None,
) -> dict[str, Any]:
    """
    Open-Meteo sky forecast + Mongo plant tolerance checks.

    Pass either:
      - lat & lon (device GPS), or
      - location=Toronto (typed city/address via geocoding)

    For typed locations with multiple hits, default is to return candidates
    for confirmation. Pass confirm=true (and optional resultIndex) to proceed
    with a chosen place — avoids wrong-hemisphere bugs on stage.
    """
    resolved: dict[str, Any] | None = None

    if location and (lat is None or lon is None):
        places = await geocode_search(location.strip(), count=5)
        if not places:
            raise HTTPException(
                status_code=404,
                detail=f"No location found for '{location}'",
            )

        # Ambiguous city names: ask UI to confirm unless confirm=true
        if len(places) > 1 and not confirm:
            return {
                "needsConfirmation": True,
                "query": location,
                "confirmPrompt": f"{places[0]['label']} — is this right?",
                "results": places,
                "hint": (
                    "Re-call /weather with confirm=true&resultIndex=N "
                    "(or pass lat/lon from the chosen result)."
                ),
            }

        idx = resultIndex if 0 <= resultIndex < len(places) else 0
        resolved = places[idx]
        lat = float(resolved["latitude"])
        lon = float(resolved["longitude"])
    elif lat is None or lon is None:
        raise HTTPException(
            status_code=400,
            detail="Provide lat & lon, or location= (city/address text)",
        )

    return await forecast_for(lat, lon, plant_ids=plantIds, resolved_location=resolved)


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
