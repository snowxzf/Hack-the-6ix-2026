"""
Verify plants_curated.json care fields against OpenPlantDB (CC0, no key, no rate limit).

Dataset: https://github.com/cwfrazier1/openplantdb  (data/plants.json, 6k+ records)

Run from database/:
    python verify_openplantdb.py            # report only
    python verify_openplantdb.py --apply    # write safe updates + verified.openplantdb=true

What it updates when --apply:
  - sun (full/partial/shade)
  - waterEveryDays (mapped from low/medium/high)
  - heightCm (from height_in max, when off by >= 20 cm)
  - daysToHarvestMin/Max + daysToHarvest midpoint (veggies, when off by >= 10 days)
  - verified.openplantdb = true when a species match was found

Does NOT touch: yieldKgPerSeason, co2eSavedPerKg (OWID), cellsPerPlant, companions.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import httpx

HERE = Path(__file__).resolve().parent
JSON_PATH = HERE / "plants_curated.json"
CACHE_PATH = HERE / "perenual_cache" / "openplantdb_plants.json"
REPORT_PATH = HERE / "openplantdb_report.json"

DATA_URL = "https://raw.githubusercontent.com/cwfrazier1/openplantdb/main/data/plants.json"

# low/medium/high -> watering interval in days (matches our curated scale)
WATER_DAYS = {"low": 7, "medium": 4, "high": 2}


def norm(s: str) -> str:
    s = s.lower().replace("×", "x")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def load_dataset() -> list[dict[str, Any]]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    print("Downloading OpenPlantDB dataset (one-time, ~14 MB)…")
    resp = httpx.get(DATA_URL, timeout=120, follow_redirects=True)
    resp.raise_for_status()
    data = resp.json()
    records = data if isinstance(data, list) else data.get("plants", [])
    CACHE_PATH.parent.mkdir(exist_ok=True)
    CACHE_PATH.write_text(json.dumps(records), encoding="utf-8")
    return records


def genus_species(sci: str) -> str:
    """First two words of a scientific name (drops cultivar/variety suffixes)."""
    parts = norm(sci).split()
    return " ".join(parts[:2])


def match_record(
    plant: dict[str, Any], records: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, str]:
    sci = genus_species(plant.get("scientificName") or "")
    name = norm(plant.get("name") or "")
    aliases = {norm(a) for a in (plant.get("aliases") or [])}
    aliases.add(name)

    exact: list[dict[str, Any]] = []
    genus_only: list[dict[str, Any]] = []
    for r in records:
        rsci = genus_species(r.get("scientific_name") or "")
        if not rsci:
            continue
        if rsci == sci:
            exact.append(r)
        elif sci and rsci.split()[0] == sci.split()[0]:
            genus_only.append(r)

    def by_common(cands: list[dict[str, Any]]) -> dict[str, Any] | None:
        best, best_score = None, 0
        for r in cands:
            common = norm(r.get("common_name") or "")
            score = 0
            for a in aliases:
                if a and (a == common or a in common or common in a):
                    score = max(score, 3 if a == common else 2)
            if score > best_score:
                best, best_score = r, score
        return best

    if exact:
        hit = by_common(exact) or exact[0]
        return hit, "scientific+common" if by_common(exact) else "scientific"
    hit = by_common(genus_only)
    if hit:
        return hit, "genus+common"
    return None, "none"


def map_height_cm(rec: dict[str, Any]) -> int | None:
    h = rec.get("height_in") or {}
    val = h.get("max") or h.get("min")
    if val is None:
        return None
    return max(1, int(round(float(val) * 2.54)))


def compare(plant: dict[str, Any], rec: dict[str, Any], how: str) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "id": plant["id"],
        "matched": True,
        "matchMethod": how,
        "openplantdb": {
            "slug": rec.get("slug"),
            "common_name": rec.get("common_name"),
            "scientific_name": rec.get("scientific_name"),
            "sun": rec.get("sun"),
            "water": rec.get("water"),
            "height_in": rec.get("height_in"),
            "days_to_maturity": rec.get("days_to_maturity"),
            "frost_tolerance": rec.get("frost_tolerance"),
            "season": rec.get("season"),
        },
        "changes": {},
        "notes": [],
    }

    sun = rec.get("sun")
    if sun in ("full", "partial", "shade") and sun != plant.get("sun"):
        entry["changes"]["sun"] = {"from": plant.get("sun"), "to": sun}

    water = WATER_DAYS.get((rec.get("water") or "").lower())
    if water and water != plant.get("waterEveryDays"):
        entry["changes"]["waterEveryDays"] = {
            "from": plant.get("waterEveryDays"),
            "to": water,
        }

    height = map_height_cm(rec)
    if height and abs(height - int(plant.get("heightCm") or 0)) >= 20:
        entry["changes"]["heightCm"] = {"from": plant.get("heightCm"), "to": height}

    dtm = rec.get("days_to_maturity") or {}
    lo, hi = dtm.get("min"), dtm.get("max")
    if plant.get("category") == "veggies" and lo and hi:
        cur = plant.get("daysToHarvest")
        mid = int(round((lo + hi) / 2))
        if cur is None or abs(mid - cur) >= 10:
            entry["changes"]["daysToHarvest"] = {"from": cur, "to": mid}
            entry["changes"]["daysToHarvestMin"] = {
                "from": plant.get("daysToHarvestMin"),
                "to": lo,
            }
            entry["changes"]["daysToHarvestMax"] = {
                "from": plant.get("daysToHarvestMax"),
                "to": hi,
            }

    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify plants vs OpenPlantDB")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write mapped care fields back into plants_curated.json",
    )
    args = parser.parse_args()

    records = load_dataset()
    print(f"OpenPlantDB records: {len(records)}")

    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    plants: list[dict[str, Any]] = payload["plants"]

    report: list[dict[str, Any]] = []
    for i, plant in enumerate(plants, 1):
        rec, how = match_record(plant, records)
        print(f"[{i}/{len(plants)}] {plant['id']}: match={how}")
        if rec is None:
            report.append(
                {
                    "id": plant["id"],
                    "matched": False,
                    "matchMethod": "none",
                    "changes": {},
                    "notes": ["No OpenPlantDB match"],
                }
            )
            continue
        report.append(compare(plant, rec, how))

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    matched = sum(1 for r in report if r.get("matched"))
    with_changes = sum(1 for r in report if r.get("changes"))
    print(f"\nMatched {matched}/{len(report)}. Plants with suggested updates: {with_changes}.")
    print(f"Report -> {REPORT_PATH}")

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
            plant["verified"]["openplantdb"] = True
            applied += 1
        payload["meta"]["version"] = "0.4.0-openplantdb-pass"
        payload["meta"]["openplantdbNote"] = (
            "Care fields cross-checked against OpenPlantDB (CC0), "
            "https://github.com/cwfrazier1/openplantdb"
        )
        JSON_PATH.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(
            f"Applied OpenPlantDB flags/updates to {applied} plants "
            "(re-run seed.py to push Mongo)."
        )
        print("Carbon fields were NOT changed - verify those via OWID separately.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
