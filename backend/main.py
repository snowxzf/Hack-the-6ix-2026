"""
PlotTwist API — thin backend between the app and MongoDB / PlantNet / Open-Meteo.

Keeps secrets (Mongo URI, PlantNet key) off the mobile client.
"""

from __future__ import annotations

import json
import os
import re
import uuid
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

try:
    from .food_waste_stats import (
        TORONTO_FOOD_WASTE_BASELINE,
        compare_garden_to_toronto_baseline,
    )
except ImportError:  # `uvicorn main:app` from backend/
    from food_waste_stats import (
        TORONTO_FOOD_WASTE_BASELINE,
        compare_garden_to_toronto_baseline,
    )

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
    "daysToHarvest",
    "daysToHarvestMin",
    "daysToHarvestMax",
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
        _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=2500)
    return _client[MONGODB_DB]


def plants_coll() -> Collection:
    return get_db()["plants"]


def gardens_coll() -> Collection:
    return get_db()["gardens"]


# ── Demo-safe fallbacks ──────────────────────────────────────────────
# The same curated records seed.py loads into Mongo, read straight from
# disk — so the whole stack boots for any teammate (and on stage) even
# with no MONGODB_URI / dead wifi. Mongo remains the source of truth
# whenever it answers.

_json_catalog_cache: list[dict[str, Any]] | None = None


def _bundled_catalog() -> list[dict[str, Any]]:
    global _json_catalog_cache
    if _json_catalog_cache is None:
        with open(ROOT / "database" / "plants_curated.json") as f:
            data = json.load(f)
        _json_catalog_cache = data if isinstance(data, list) else data.get("plants", [])
    return _json_catalog_cache


def all_plants() -> list[dict[str, Any]]:
    """Catalog from Mongo when reachable; bundled JSON otherwise."""
    if MONGODB_URI:
        try:
            docs = list(plants_coll().find({}, {"_id": 0}))
            if docs:
                return docs
        except Exception:  # noqa: BLE001 — fall back, never 500 the demo
            pass
    return _bundled_catalog()


def find_plant(plant_id: str) -> dict[str, Any] | None:
    return next((p for p in all_plants() if p.get("id") == plant_id), None)


# In-memory garden store when Mongo is unavailable — plenty for a demo.
_mem_gardens: dict[str, dict[str, Any]] = {}


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
            plant = find_plant(pid)
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
                        "harvestEstimate": estimate_harvest_days(
                            plant,
                            sky={
                                "tonightMinC": tonight_low,
                                "todayMaxC": today_high,
                            },
                            month=datetime.now(timezone.utc).month,
                            lat=lat,
                        ),
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
                        "harvestEstimate": estimate_harvest_days(
                            plant,
                            sky={
                                "tonightMinC": tonight_low,
                                "todayMaxC": today_high,
                            },
                            month=datetime.now(timezone.utc).month,
                            lat=lat,
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
            "ok": True,
            "mongo": False,
            "catalogSource": "bundled_json",
            "plantCount": len(_bundled_catalog()),
            "mongoError": str(exc),
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
    docs = all_plants()
    if optimizer:
        return {"plants": [to_species(d) for d in docs]}
    return {"count": len(docs), "plants": docs}


# Country code → continent for native-region suggestion scoring
COUNTRY_CONTINENT: dict[str, str] = {
    "CA": "North America",
    "US": "North America",
    "MX": "North America",
    "GT": "North America",
    "CR": "North America",
    "BR": "South America",
    "AR": "South America",
    "PE": "South America",
    "CL": "South America",
    "CO": "South America",
    "EC": "South America",
    "BO": "South America",
    "GB": "Europe",
    "FR": "Europe",
    "DE": "Europe",
    "IT": "Europe",
    "ES": "Europe",
    "PT": "Europe",
    "GR": "Europe",
    "NL": "Europe",
    "PL": "Europe",
    "SE": "Europe",
    "NO": "Europe",
    "FI": "Europe",
    "IE": "Europe",
    "CH": "Europe",
    "AT": "Europe",
    "BE": "Europe",
    "DK": "Europe",
    "CN": "Asia",
    "JP": "Asia",
    "KR": "Asia",
    "IN": "Asia",
    "TH": "Asia",
    "VN": "Asia",
    "ID": "Asia",
    "PH": "Asia",
    "TR": "Asia",
    "IL": "Asia",
    "AU": "Australia",
    "NZ": "Australia",
    "ZA": "Africa",
    "EG": "Africa",
    "MA": "Africa",
    "NG": "Africa",
    "KE": "Africa",
    "ET": "Africa",
}

MEDITERRANEAN_COUNTRIES = {"ES", "PT", "IT", "GR", "FR", "HR", "AL", "TR", "MA", "TN", "DZ", "CY", "IL", "LB"}


def climates_for_place(lat: float, country_code: str | None) -> list[str]:
    """Rough climate tags from latitude + country (for nativeRegion.suitedClimates overlap)."""
    abs_lat = abs(lat)
    climates: list[str] = []
    if abs_lat >= 55:
        climates.extend(["cold", "cool", "temperate"])
    elif abs_lat >= 40:
        climates.extend(["temperate", "cool", "continental"])
    elif abs_lat >= 30:
        climates.extend(["temperate", "subtropical", "mediterranean"])
    elif abs_lat >= 23.5:
        climates.extend(["subtropical", "temperate", "mediterranean"])
    else:
        climates.extend(["tropical", "subtropical"])
    if (country_code or "").upper() in MEDITERRANEAN_COUNTRIES:
        climates.append("mediterranean")
    seen: set[str] = set()
    out: list[str] = []
    for c in climates:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def plant_season_class(plant: dict[str, Any]) -> str:
    """Prefer catalog harvest.seasonClass; else infer from temp tolerance."""
    harvest = plant.get("harvest") or {}
    tagged = harvest.get("seasonClass")
    if tagged in ("cool", "warm", "flexible"):
        return tagged
    tmin = plant.get("tempMinC")
    tmax = plant.get("tempMaxC")
    if tmin is None or tmax is None:
        return "flexible"
    if tmax <= 26 and tmin <= 8:
        return "cool"
    if tmin >= 12:
        return "warm"
    return "flexible"


def estimate_harvest_days(
    plant: dict[str, Any],
    *,
    season_ctx: dict[str, Any] | None = None,
    sky: dict[str, Any] | None = None,
    month: int | None = None,
    lat: float | None = None,
) -> dict[str, Any] | None:
    """
    Adjust baseline daysToHarvest using optional season + weather fields.

    Returns None for plants without daysToHarvest (ornamentals).
    """
    base = plant.get("daysToHarvest")
    if base is None:
        return None

    harvest = plant.get("harvest") or {}
    lo = int(plant.get("daysToHarvestMin") or base)
    hi = int(plant.get("daysToHarvestMax") or base)
    adjusted = float(base)
    reasons: list[str] = []

    season_class = plant_season_class(plant)
    if season_ctx:
        prefer = set(season_ctx.get("prefer") or [])
        discourage = set(season_ctx.get("discourage") or [])
        if season_class in prefer:
            adjusted *= 0.95
            reasons.append(f"in-season ({season_ctx.get('name')}) — slightly faster")
        elif season_class in discourage:
            adjusted *= 1.15
            reasons.append(f"off-season ({season_ctx.get('name')}) — expect delay")

    # Planting-month window (northern hemisphere months in catalog)
    months = harvest.get("plantMonthsNorth") or []
    if months and month is not None:
        m = month
        if lat is not None and lat < 0:
            m = ((month + 5) % 12) + 1
        if m not in months:
            adjusted *= 1.1
            reasons.append(
                f"month {m} outside typical plant window {months}"
            )
        else:
            reasons.append(f"month {m} is in typical plant window")

    sky = sky or {}
    tonight = sky.get("tonightMinC")
    today_high = sky.get("todayMaxC")
    slows = harvest.get("slowsBelowC")
    stress = harvest.get("stressAboveC")
    bolts = harvest.get("boltsAboveC")

    if slows is not None and tonight is not None and tonight < slows:
        adjusted *= 1.12
        reasons.append(
            f"nights {tonight}°C below slowsBelowC {slows}°C — growth slows"
        )
    if stress is not None and today_high is not None and today_high > stress:
        adjusted *= 1.08
        reasons.append(
            f"days {today_high}°C above stressAboveC {stress}°C — plant stress"
        )
    if bolts is not None and today_high is not None and today_high >= bolts:
        # Heat crops that bolt: harvest window moves earlier (pick sooner)
        adjusted *= 0.9
        reasons.append(
            f"heat >= {bolts}C — bolt risk; harvest sooner if leaves/heads ready"
        )

    if harvest.get("frostSensitive") and tonight is not None and tonight <= 2:
        reasons.append("frost-sensitive and near-freezing nights — protect or delay planting")

    adjusted_i = int(round(max(lo * 0.85, min(hi * 1.2, adjusted))))
    return {
        "baselineDays": int(base),
        "estimatedDays": adjusted_i,
        "rangeDays": {"min": lo, "max": hi},
        "plantSeasons": harvest.get("plantSeasons"),
        "plantMonthsNorth": months,
        "seasonClass": season_class,
        "frostSensitive": harvest.get("frostSensitive"),
        "weatherNotes": harvest.get("weatherNotes"),
        "reasons": reasons,
    }


def local_season_context(lat: float, month: int) -> dict[str, Any]:
    """What kind of planting season it is right now at this latitude."""
    # Flip seasons in the southern hemisphere
    m = month if lat >= 0 else ((month + 5) % 12) + 1
    if m in (12, 1, 2):
        return {
            "name": "winter",
            "prefer": ["cool"],
            "discourage": ["warm"],
            "note": "Cold / dormant stretch — favor hardy cool crops or wait.",
        }
    if m in (3, 4, 5):
        return {
            "name": "spring",
            "prefer": ["cool", "flexible"],
            "discourage": [],
            "note": "Shoulder season — cool crops excel; warm crops after frost risk drops.",
        }
    if m in (6, 7, 8):
        return {
            "name": "summer",
            "prefer": ["warm", "flexible"],
            "discourage": ["cool"],
            "note": "Peak heat — warm-season crops thrive; cool greens may bolt.",
        }
    return {
        "name": "fall",
        "prefer": ["cool", "flexible"],
        "discourage": ["warm"],
        "note": "Cooling down — great for fall greens; heat lovers fade.",
    }


def carbon_kg_per_unit(plant: dict[str, Any]) -> float:
    """Food plants only — ornamentals stay 0 (honesty rule)."""
    if plant.get("impactCase") == "pollinator_biodiversity":
        return 0.0
    return float(plant.get("yieldKgPerSeason") or 0) * float(plant.get("co2eSavedPerKg") or 0)


async def fetch_sky_snapshot(lat: float, lon: float) -> dict[str, Any]:
    """Lightweight Open-Meteo pull for suggestion scoring (not full /weather)."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,precipitation,weather_code",
        "daily": "temperature_2m_min,temperature_2m_max,precipitation_sum,weathercode",
        "timezone": "auto",
        "forecast_days": 3,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, params=params)
    if resp.status_code != 200:
        return {}
    raw = resp.json()
    daily = raw.get("daily") or {}
    current = raw.get("current") or {}
    return {
        "nowC": current.get("temperature_2m"),
        "tonightMinC": (daily.get("temperature_2m_min") or [None])[0],
        "todayMaxC": (daily.get("temperature_2m_max") or [None])[0],
        "precipMm": (daily.get("precipitation_sum") or [None])[0],
        "weatherCode": (daily.get("weathercode") or [None])[0],
        "timezone": raw.get("timezone"),
    }


def score_plant_multi(
    plant: dict[str, Any],
    *,
    garden_continent: str | None,
    garden_climates: list[str],
    season_ctx: dict[str, Any],
    sky: dict[str, Any],
    carbon_weight: float,
    max_carbon: float,
) -> dict[str, Any]:
    """
    Multi-factor suitability score for suggestions.

    Factors: season, live weather vs temp tolerance, carbon savings,
    native-region fit, beginner friendliness.
    """
    factors: dict[str, float] = {}
    reasons: list[str] = []

    # --- Season ---
    season_class = plant_season_class(plant)
    prefer = set(season_ctx.get("prefer") or [])
    discourage = set(season_ctx.get("discourage") or [])
    if season_class in prefer:
        factors["season"] = 3.0
        reasons.append(f"good for {season_ctx['name']} ({season_class}-season crop)")
    elif season_class in discourage:
        factors["season"] = 0.0
        reasons.append(f"poor {season_ctx['name']} fit ({season_class}-season crop)")
    else:
        factors["season"] = 1.5
        reasons.append(f"flexible across seasons ({season_class})")

    # --- Weather (live Open-Meteo vs plant tempMin/tempMax) ---
    tmin = plant.get("tempMinC")
    tmax = plant.get("tempMaxC")
    tonight = sky.get("tonightMinC")
    today_high = sky.get("todayMaxC")
    precip = sky.get("precipMm")
    weather_score = 2.0
    if tmin is not None and tonight is not None:
        if tonight < tmin:
            weather_score -= 2.0
            reasons.append(
                f"too cold tonight ({tonight}°C < plant floor {tmin}°C)"
            )
        elif tonight < tmin + 3:
            weather_score -= 0.5
            reasons.append("nights near plant's cold limit")
        else:
            weather_score += 0.5
    if tmax is not None and today_high is not None:
        if today_high > tmax:
            weather_score -= 1.5
            reasons.append(
                f"too hot today ({today_high}°C > plant ceiling {tmax}°C)"
            )
        elif today_high > tmax - 2:
            weather_score -= 0.5
            reasons.append("days near plant's heat limit")
        else:
            weather_score += 0.5
    # Rain vs watering cadence: thirsty plants benefit from rain; skip-water day is fine
    water_days = plant.get("waterEveryDays") or 3
    if precip is not None and precip >= 2:
        if water_days <= 3:
            weather_score += 0.5
            reasons.append("rain covers watering needs")
        else:
            weather_score += 0.2
    factors["weather"] = max(0.0, min(4.0, weather_score))

    # --- Carbon (food plants); ornamentals get small biodiversity credit ---
    carbon = carbon_kg_per_unit(plant)
    if plant.get("impactCase") == "pollinator_biodiversity":
        factors["carbon"] = 1.0 * carbon_weight  # not fake CO2e — pollinator bonus
        if carbon_weight > 0:
            reasons.append("pollinator / biodiversity support (no CO₂e claimed)")
    elif max_carbon > 0:
        factors["carbon"] = (carbon / max_carbon) * 3.0 * carbon_weight
        if carbon > 0 and carbon_weight > 0:
            reasons.append(f"~{carbon:.1f} kg CO₂e saved / planting unit / season")
    else:
        factors["carbon"] = 0.0

    # --- Native region ---
    nr = plant.get("nativeRegion") or {}
    continents = nr.get("continents") or []
    suited = nr.get("suitedClimates") or []
    native_score = 0.0
    if garden_continent and garden_continent in continents:
        native_score += 2.0
        reasons.append(f"native to {garden_continent}")
    overlap = [c for c in suited if c in garden_climates]
    if overlap:
        native_score += 1.0
        reasons.append(f"climate fit ({', '.join(overlap[:2])})")
    if native_score == 0:
        reasons.append("weaker local-native match (still widely grown)")
    factors["native"] = native_score

    # --- Beginner friendliness ---
    tier = plant.get("tier")
    if tier == "beginner":
        factors["beginner"] = 1.0
    elif tier == "intermediate":
        factors["beginner"] = 0.4
    else:
        factors["beginner"] = 0.0

    total = sum(factors.values())
    return {
        "score": round(total, 2),
        "factors": {k: round(v, 2) for k, v in factors.items()},
        "seasonClass": season_class,
        "carbonKgCo2ePerUnit": round(carbon, 2),
        "reasons": reasons,
    }


@app.get("/plants/suggest")
async def suggest_plants(
    location: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    confirm: bool = False,
    resultIndex: int = 0,
    tier: str | None = None,
    category: str | None = None,
    carbonWeight: float = 0.5,
    limit: int = 12,
) -> dict[str, Any]:
    """
    Multi-factor planting suggestions for a garden location.

    Ranks by: current season fit, live Open-Meteo weather vs temp tolerance,
    carbon savings (food plants only), native-region overlap, and skill tier.
    """
    resolved: dict[str, Any] | None = None
    if location and (lat is None or lon is None):
        places = await geocode_search(location.strip(), count=5)
        if not places:
            raise HTTPException(status_code=404, detail=f"No location found for '{location}'")
        if len(places) > 1 and not confirm:
            return {
                "needsConfirmation": True,
                "query": location,
                "confirmPrompt": f"{places[0]['label']} — is this right?",
                "results": places,
                "hint": "Re-call /plants/suggest with confirm=true&resultIndex=N",
            }
        idx = resultIndex if 0 <= resultIndex < len(places) else 0
        resolved = places[idx]
        lat = float(resolved["latitude"])
        lon = float(resolved["longitude"])
    elif lat is None or lon is None:
        raise HTTPException(
            status_code=400,
            detail="Provide location= or lat & lon",
        )

    country_code = (resolved or {}).get("countryCode")
    continent = COUNTRY_CONTINENT.get((country_code or "").upper()) if country_code else None
    if continent is None and lat is not None:
        if 15 <= lat <= 72 and -170 <= (lon or 0) <= -50:
            continent = "North America"
        elif -55 <= lat <= 15 and -90 <= (lon or 0) <= -30:
            continent = "South America"

    climates = climates_for_place(float(lat), country_code)
    month = datetime.now(timezone.utc).month
    season_ctx = local_season_context(float(lat), month)
    sky = await fetch_sky_snapshot(float(lat), float(lon))
    cw = max(0.0, min(1.0, carbonWeight))

    plants = all_plants()
    if tier:
        plants = [p for p in plants if p.get("tier") == tier]
    if category:
        plants = [p for p in plants if p.get("category") == category]

    max_carbon = max((carbon_kg_per_unit(p) for p in plants), default=0.0) or 1.0

    ranked: list[dict[str, Any]] = []
    for p in plants:
        scored = score_plant_multi(
            p,
            garden_continent=continent,
            garden_climates=climates,
            season_ctx=season_ctx,
            sky=sky,
            carbon_weight=cw,
            max_carbon=max_carbon,
        )
        harvest_est = estimate_harvest_days(
            p,
            season_ctx=season_ctx,
            sky=sky,
            month=month,
            lat=float(lat),
        )
        ranked.append(
            {
                **scored,
                "harvestEstimate": harvest_est,
                "plant": p,
                "species": to_species(p),
            }
        )
    ranked.sort(key=lambda x: (-x["score"], x["plant"].get("name", "")))
    top = ranked[: max(1, min(limit, 40))]

    return {
        "location": {
            "lat": lat,
            "lon": lon,
            "resolved": resolved,
            "continent": continent,
            "climates": climates,
        },
        "context": {
            "season": season_ctx,
            "sky": sky,
            "carbonWeight": cw,
            "monthUtc": month,
        },
        "weights": {
            "season": "up to 3",
            "weather": "up to 4 (live Open-Meteo vs tempMinC/tempMaxC)",
            "carbon": f"up to 3 × carbonWeight={cw} (food yield×factor only)",
            "native": "up to 3",
            "beginner": "up to 1",
        },
        "count": len(top),
        "suggestions": top,
        "note": (
            "Multi-factor rank: season + live weather + carbon + native region + skill. "
            "Ornamentals never get invented CO₂e — biodiversity credit only."
        ),
    }


@app.get("/plants/search/by-name")
def search_plants(q: str, limit: int = 10) -> dict[str, Any]:
    qn = norm(q)
    if not qn:
        raise HTTPException(status_code=400, detail="q is required")
    docs = all_plants()
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
async def get_plant(
    plant_id: str,
    lat: float | None = None,
    lon: float | None = None,
) -> dict[str, Any]:
    doc = find_plant(plant_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Plant '{plant_id}' not found")
    out = dict(doc)
    if lat is not None and lon is not None:
        month = datetime.now(timezone.utc).month
        season_ctx = local_season_context(lat, month)
        sky = await fetch_sky_snapshot(lat, lon)
        out["harvestEstimate"] = estimate_harvest_days(
            doc,
            season_ctx=season_ctx,
            sky=sky,
            month=month,
            lat=lat,
        )
    return out


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
    catalog = all_plants()

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


@app.get("/stats/toronto-food-waste")
def toronto_food_waste_baseline() -> dict[str, Any]:
    """Published Toronto single-family food-waste audit stats (2017–2018)."""
    return TORONTO_FOOD_WASTE_BASELINE


@app.get("/impact/food-waste")
def food_waste_impact(
    foodKg: float,
    kgCo2e: float | None = None,
) -> dict[str, Any]:
    """
    Compare optimizer ``foodKgPerSeason`` (and optional CO₂e) to Toronto baselines.

    Example: ``/impact/food-waste?foodKg=22.5`` → 50% of typical fruit/veg waste.
    """
    if foodKg < 0:
        raise HTTPException(status_code=400, detail="foodKg must be >= 0")
    return compare_garden_to_toronto_baseline(
        food_kg_per_season=foodKg,
        kg_co2e_per_season=kgCo2e,
    )


@app.post("/gardens")
def save_garden(body: dict[str, Any]) -> dict[str, Any]:
    """Persist a scanned/optimized garden layout for the demo."""
    doc = {
        **body,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    if "createdAt" not in doc:
        doc["createdAt"] = doc["updatedAt"]
    if MONGODB_URI:
        try:
            result = gardens_coll().insert_one(doc)
            return {"id": str(result.inserted_id), "ok": True, "storage": "mongo"}
        except Exception:  # noqa: BLE001
            pass
    gid = f"mem-{uuid.uuid4().hex[:10]}"
    _mem_gardens[gid] = doc
    return {"id": gid, "ok": True, "storage": "memory"}


@app.get("/gardens/{garden_id}")
def get_garden(garden_id: str) -> dict[str, Any]:
    from bson import ObjectId
    from bson.errors import InvalidId

    if garden_id.startswith("mem-"):
        doc = _mem_gardens.get(garden_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Garden not found")
        return {"id": garden_id, **doc}

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
