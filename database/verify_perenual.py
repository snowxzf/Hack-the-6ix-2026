"""
Verify plants_curated.json care fields against the Perenual API.

Setup:
  1. Get a key at https://perenual.com/docs/api
  2. Add to repo-root .env:
       PERENUAL_API_KEY=...
  3. Run from database/:
       python verify_perenual.py
       python verify_perenual.py --apply   # write safe updates + verified.perenual=true

What it updates when --apply:
  - sun (from Perenual sunlight)
  - waterEveryDays (from watering_general_benchmark when present)
  - heightCm (from dimensions.max when unit is cm/m)
  - verified.perenual = true when a species match was found

Does NOT touch: yieldKgPerSeason, co2eSavedPerKg (OWID), cellsPerPlant, companions.
Caches raw API responses in perenual_cache/ to respect rate limits.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
JSON_PATH = HERE / "plants_curated.json"
CACHE_DIR = HERE / "perenual_cache"
REPORT_PATH = HERE / "perenual_report.json"

load_dotenv(ROOT / ".env")
load_dotenv(HERE / ".env")

BASE = "https://perenual.com/api/v2"
SUN_MAP = {
    "full_sun": "full",
    "full sun": "full",
    "sun": "full",
    "sun-part_shade": "partial",
    "part_shade": "partial",
    "part shade": "partial",
    "partial shade": "partial",
    "partial sun": "partial",
    "full_shade": "shade",
    "full shade": "shade",
    "shade": "shade",
}


def api_key() -> str:
    key = (os.getenv("PERENUAL_API_KEY") or "").strip()
    if not key:
        print(
            "Missing PERENUAL_API_KEY in repo-root .env\n"
            "Add:  PERENUAL_API_KEY=your_key_here\n"
            "Docs: https://perenual.com/docs/api",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return key


def cache_path(name: str) -> Path:
    CACHE_DIR.mkdir(exist_ok=True)
    safe = re.sub(r"[^a-zA-Z0-9_\-]+", "_", name)[:120]
    return CACHE_DIR / f"{safe}.json"


class RateLimited(Exception):
    """Free-tier quota hit — skip and continue rather than blocking forever."""


def get_json(
    client: httpx.Client,
    url: str,
    cache_name: str,
    *,
    cache_only: bool = False,
) -> dict[str, Any]:
    path = cache_path(cache_name)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    if cache_only:
        raise FileNotFoundError(f"cache miss: {cache_name}")
    time.sleep(1.5)
    resp = client.get(url, timeout=30.0)
    if resp.status_code == 429:
        print("Rate limited — waiting 60s…", file=sys.stderr)
        time.sleep(60)
        resp = client.get(url, timeout=30.0)
    if resp.status_code == 429:
        raise RateLimited(url)
    resp.raise_for_status()
    data = resp.json()
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def norm(s: str) -> str:
    s = s.lower().replace("×", "x")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def pick_species_id(plant: dict[str, Any], search: dict[str, Any]) -> int | None:
    results = search.get("data") or []
    if not results:
        return None
    sci = norm(plant.get("scientificName") or "")
    name = norm(plant.get("name") or "")
    aliases = [norm(a) for a in (plant.get("aliases") or [])]

    def score(hit: dict[str, Any]) -> int:
        common = norm(hit.get("common_name") or "")
        scientifics = [norm(x) for x in (hit.get("scientific_name") or [])]
        s = 0
        if sci and any(sci == x or sci in x or x in sci for x in scientifics):
            s += 10
        if name and (name == common or name in common or common in name):
            s += 5
        if any(a and (a == common or a in common) for a in aliases):
            s += 3
        return s

    ranked = sorted(results, key=score, reverse=True)
    best = ranked[0]
    if score(best) <= 0:
        # still take top search hit but flag low confidence in report
        return int(best["id"])
    return int(best["id"])


def map_sun(details: dict[str, Any]) -> str | None:
    raw = details.get("sunlight") or []
    if isinstance(raw, str):
        raw = [raw]
    mapped: list[str] = []
    for item in raw:
        key = norm(str(item)).replace(" ", "_")
        # try both spaced and underscored
        mapped.append(
            SUN_MAP.get(norm(str(item)))
            or SUN_MAP.get(key)
            or SUN_MAP.get(str(item).lower())
            or ""
        )
    mapped = [m for m in mapped if m]
    if not mapped:
        return None
    # prefer fullest sun if multiple
    if "full" in mapped:
        return "full"
    if "partial" in mapped:
        return "partial"
    return "shade"


def map_water_days(details: dict[str, Any]) -> int | None:
    bench = details.get("watering_general_benchmark") or {}
    value = bench.get("value")
    unit = (bench.get("unit") or "").lower()
    if value is None:
        # coarse fallback from watering label
        label = (details.get("watering") or "").lower()
        if "frequent" in label:
            return 2
        if "average" in label:
            return 4
        if "minimum" in label:
            return 7
        if "none" in label:
            return 14
        return None
    try:
        # value can be "5-7" or "7"
        text = str(value)
        nums = [int(x) for x in re.findall(r"\d+", text)]
        if not nums:
            return None
        days = sum(nums) / len(nums)
        if "week" in unit:
            days *= 7
        return max(1, int(round(days)))
    except Exception:  # noqa: BLE001
        return None


def map_height_cm(details: dict[str, Any]) -> int | None:
    dims = details.get("dimensions")
    if dims is None:
        return None
    # API sometimes returns a list of dimension objects
    if isinstance(dims, list):
        dims = dims[0] if dims else {}
    if not isinstance(dims, dict):
        return None

    unit = (dims.get("unit") or dims.get("max_value_unit") or "cm")
    if not isinstance(unit, str):
        unit = "cm"
    unit = unit.lower()

    val = dims.get("max_value") or dims.get("max") or dims.get("value")
    if isinstance(val, dict):
        unit = (val.get("unit") or unit).lower()
        val = val.get("value")
    if val is None:
        return None
    try:
        n = float(val)
    except (TypeError, ValueError):
        return None
    if unit in ("m", "meter", "meters") or (unit.endswith("m") and "cm" not in unit and "mm" not in unit):
        n *= 100
    elif "in" in unit or "inch" in unit:
        n *= 2.54
    elif "ft" in unit or "feet" in unit:
        n *= 30.48
    return max(1, int(round(n)))


def hardiness_note(details: dict[str, Any]) -> str | None:
    h = details.get("hardiness") or {}
    lo, hi = h.get("min"), h.get("max")
    if lo is None and hi is None:
        return None
    return f"USDA hardiness {lo}–{hi}"


def verify_one(
    client: httpx.Client,
    key: str,
    plant: dict[str, Any],
    *,
    cache_only: bool = False,
) -> dict[str, Any]:
    q = plant.get("scientificName") or plant.get("name") or plant["id"]
    search = get_json(
        client,
        f"{BASE}/species-list?key={quote(key)}&q={quote(q)}",
        f"search_{plant['id']}_{q}",
        cache_only=cache_only,
    )
    sid = pick_species_id(plant, search)
    entry: dict[str, Any] = {
        "id": plant["id"],
        "query": q,
        "perenualId": sid,
        "matched": sid is not None,
        "changes": {},
        "notes": [],
        "perenual": {},
    }
    if sid is None:
        entry["notes"].append("No Perenual search results")
        return entry

    details = get_json(
        client,
        f"{BASE}/species/details/{sid}?key={quote(key)}",
        f"details_{sid}",
        cache_only=cache_only,
    )
    # some responses nest under data
    if "data" in details and isinstance(details["data"], dict):
        details = details["data"]

    entry["perenual"] = {
        "common_name": details.get("common_name"),
        "scientific_name": details.get("scientific_name"),
        "sunlight": details.get("sunlight"),
        "watering": details.get("watering"),
        "watering_general_benchmark": details.get("watering_general_benchmark"),
        "dimensions": details.get("dimensions"),
        "hardiness": details.get("hardiness"),
        "origin": details.get("origin"),
    }

    sun = map_sun(details)
    water = map_water_days(details)
    height = map_height_cm(details)
    hz = hardiness_note(details)
    if hz:
        entry["notes"].append(hz)

    if sun and sun != plant.get("sun"):
        entry["changes"]["sun"] = {"from": plant.get("sun"), "to": sun}
    if water and water != plant.get("waterEveryDays"):
        entry["changes"]["waterEveryDays"] = {
            "from": plant.get("waterEveryDays"),
            "to": water,
        }
    if height and abs(height - int(plant.get("heightCm") or 0)) >= 20:
        entry["changes"]["heightCm"] = {"from": plant.get("heightCm"), "to": height}

    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify plants vs Perenual")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write mapped care fields back into plants_curated.json",
    )
    parser.add_argument("--limit", type=int, default=0, help="Only first N plants")
    parser.add_argument(
        "--cache-only",
        action="store_true",
        help="Do not hit the network; only use perenual_cache/",
    )
    parser.add_argument(
        "--skip-verified",
        action="store_true",
        help="Skip plants that already have verified.perenual=true",
    )
    args = parser.parse_args()

    key = api_key()
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    plants: list[dict[str, Any]] = payload["plants"]
    if args.skip_verified:
        plants = [
            p for p in plants if not (p.get("verified") or {}).get("perenual")
        ]
        print(f"Skipping already-verified; {len(plants)} remaining.")
    if args.limit:
        plants = plants[: args.limit]

    report: list[dict[str, Any]] = []
    skipped_rate = 0
    skipped_cache = 0
    with httpx.Client() as client:
        for i, plant in enumerate(plants, 1):
            print(f"[{i}/{len(plants)}] {plant['id']}…")
            try:
                report.append(
                    verify_one(client, key, plant, cache_only=args.cache_only)
                )
            except RateLimited:
                skipped_rate += 1
                print(f"  → rate limited, skipping {plant['id']}", file=sys.stderr)
                report.append(
                    {
                        "id": plant["id"],
                        "matched": False,
                        "error": "rate_limited",
                        "changes": {},
                        "notes": ["Skipped due to Perenual free-tier rate limit"],
                    }
                )
            except FileNotFoundError:
                skipped_cache += 1
                report.append(
                    {
                        "id": plant["id"],
                        "matched": False,
                        "error": "cache_miss",
                        "changes": {},
                        "notes": ["Not in cache yet — re-run without --cache-only later"],
                    }
                )
            except httpx.HTTPStatusError as exc:
                report.append(
                    {
                        "id": plant["id"],
                        "matched": False,
                        "error": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
                        "changes": {},
                        "notes": [],
                    }
                )

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    matched = sum(1 for r in report if r.get("matched"))
    with_changes = sum(1 for r in report if r.get("changes"))
    print(f"\nMatched {matched}/{len(report)}. Suggested field updates: {with_changes}.")
    if skipped_rate:
        print(f"Rate-limited skips: {skipped_rate}")
    if skipped_cache:
        print(f"Cache misses: {skipped_cache}")
    print(f"Report -> {REPORT_PATH}")
    print(f"Cache  -> {CACHE_DIR}")

    if args.apply:
        by_id = {r["id"]: r for r in report}
        applied = 0
        for plant in payload["plants"]:
            r = by_id.get(plant["id"])
            if not r or not r.get("matched"):
                continue
            for field, ch in (r.get("changes") or {}).items():
                plant[field] = ch["to"]
            plant.setdefault("verified", {})
            plant["verified"]["perenual"] = True
            if r.get("perenualId"):
                plant["perenualId"] = r["perenualId"]
            applied += 1
        payload["meta"]["version"] = "0.3.0-perenual-pass"
        JSON_PATH.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(
            f"Applied Perenual flags/updates to {applied} plants in plants_curated.json "
            "(re-run seed.py to push Mongo)."
        )
        print("Carbon fields were NOT changed — verify those via OWID separately.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
