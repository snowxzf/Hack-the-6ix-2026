"""
Verify co2eSavedPerKg against Our World in Data (Poore & Nemecek 2018).

Dataset: https://ourworldindata.org/grapher/ghg-per-kg-poore
(kg CO2e per kg of food, full supply chain: farm + land use + transport +
processing + retail + packaging). Assumption: home-grown ~= 0 emissions, so
the avoided store-bought footprint is the OWID category value.

Run from database/:
    python verify_carbon_owid.py            # report only
    python verify_carbon_owid.py --apply    # write co2eSavedPerKg + verified.carbon=true

Ornamentals (yieldKgPerSeason == 0) keep co2eSavedPerKg = 0 by rule and are
marked verified.carbon = true with method "zero_by_rule" in the report.
yieldKgPerSeason itself is agronomic (not in OWID) and is never touched.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path
from typing import Any

import httpx

HERE = Path(__file__).resolve().parent
JSON_PATH = HERE / "plants_curated.json"
CACHE_PATH = HERE / "perenual_cache" / "owid_ghg_per_kg.csv"
REPORT_PATH = HERE / "owid_carbon_report.json"

DATA_URL = "https://ourworldindata.org/grapher/ghg-per-kg-poore.csv"

# Our plant id -> OWID entity. Every food plant must be listed here so the
# mapping is explicit and reviewable (no fuzzy guessing for carbon claims).
OWID_CATEGORY: dict[str, str] = {
    "tomato_cherry": "Tomatoes",
    "tomato_beefsteak": "Tomatoes",
    "eggplant": "Other Vegetables",
    "bell_pepper": "Other Vegetables",
    "zucchini": "Other Vegetables",
    "cucumber": "Other Vegetables",
    "sweet_corn": "Other Vegetables",  # sweet corn eaten as a vegetable (grain maize would overstate)
    "lettuce": "Other Vegetables",
    "spinach": "Other Vegetables",
    "swiss_chard": "Other Vegetables",
    "kale": "Brassicas",
    "broccoli": "Brassicas",
    "cabbage": "Brassicas",
    "carrot": "Root Vegetables",
    "beet": "Root Vegetables",
    "radish": "Root Vegetables",
    "potato": "Potatoes",
    "onion": "Onions & Leeks",
    "garlic": "Onions & Leeks",
    "chives": "Onions & Leeks",
    "pea": "Peas",
    "bean_bush": "Other Vegetables",  # green/snap beans are eaten fresh, not dried pulses
    "strawberry": "Berries & Grapes",
    "blueberry": "Berries & Grapes",
    "raspberry": "Berries & Grapes",
    "watermelon": "Other Fruit",
    "pumpkin": "Other Vegetables",
    # Culinary herbs: OWID has no herb category; "Other Vegetables" is the
    # closest fresh-produce proxy (conservative vs greenhouse-grown herbs).
    "basil": "Other Vegetables",
    "mint": "Other Vegetables",
    "parsley": "Other Vegetables",
    "cilantro": "Other Vegetables",
    "rosemary": "Other Vegetables",
    "thyme": "Other Vegetables",
    "oregano": "Other Vegetables",
}


def load_owid() -> dict[str, float]:
    if CACHE_PATH.exists():
        text = CACHE_PATH.read_text(encoding="utf-8")
    else:
        print("Downloading OWID ghg-per-kg dataset…")
        resp = httpx.get(DATA_URL, timeout=60, follow_redirects=True)
        resp.raise_for_status()
        text = resp.text
        CACHE_PATH.parent.mkdir(exist_ok=True)
        CACHE_PATH.write_text(text, encoding="utf-8")
    values: dict[str, float] = {}
    for row in csv.DictReader(io.StringIO(text)):
        entity = row["Entity"].strip()
        val = row.get("Greenhouse gas emissions per kilogram")
        if val:
            values[entity] = float(val)
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify carbon factors vs OWID")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write co2eSavedPerKg + verified.carbon=true into plants_curated.json",
    )
    args = parser.parse_args()

    owid = load_owid()
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    plants: list[dict[str, Any]] = payload["plants"]

    report: list[dict[str, Any]] = []
    unmapped: list[str] = []
    for plant in plants:
        pid = plant["id"]
        is_food = float(plant.get("yieldKgPerSeason") or 0) > 0
        if not is_food:
            report.append(
                {
                    "id": pid,
                    "method": "zero_by_rule",
                    "current": plant.get("co2eSavedPerKg"),
                    "owid": 0.0,
                    "change": plant.get("co2eSavedPerKg") != 0.0,
                }
            )
            continue
        category = OWID_CATEGORY.get(pid)
        if category is None or category not in owid:
            unmapped.append(pid)
            report.append({"id": pid, "method": "unmapped", "current": plant.get("co2eSavedPerKg")})
            continue
        value = round(owid[category], 2)
        report.append(
            {
                "id": pid,
                "method": "owid_category",
                "category": category,
                "current": plant.get("co2eSavedPerKg"),
                "owid": value,
                "change": abs(float(plant.get("co2eSavedPerKg") or 0) - value) >= 0.01,
            }
        )

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    changes = [r for r in report if r.get("change")]
    print(f"Plants: {len(report)}  ·  mapped food: "
          f"{sum(1 for r in report if r['method'] == 'owid_category')}  ·  "
          f"ornamental zero-by-rule: {sum(1 for r in report if r['method'] == 'zero_by_rule')}")
    print(f"Values that would change: {len(changes)}")
    for r in changes:
        print(f"  {r['id']:18s} {r['current']} -> {r['owid']}  ({r.get('category', 'ornamental')})")
    if unmapped:
        print(f"UNMAPPED (fix OWID_CATEGORY!): {unmapped}")
    print(f"Report -> {REPORT_PATH}")

    if args.apply:
        if unmapped:
            print("Refusing to apply while plants are unmapped.")
            return 1
        by_id = {r["id"]: r for r in report}
        for plant in plants:
            r = by_id[plant["id"]]
            plant["co2eSavedPerKg"] = float(r["owid"])
            plant.setdefault("verified", {})
            plant["verified"]["carbon"] = True
        payload["meta"]["version"] = "0.5.0-owid-carbon-pass"
        payload["meta"]["carbonSource"] = (
            "co2eSavedPerKg = OWID/Poore & Nemecek 2018 category value "
            "(https://ourworldindata.org/grapher/ghg-per-kg-poore), "
            "assuming home-grown ~0 kgCO2e/kg. See owid_carbon_report.json for mapping."
        )
        JSON_PATH.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Applied OWID carbon factors to all {len(plants)} plants (re-run seed.py).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
