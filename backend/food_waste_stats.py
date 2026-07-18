"""
Toronto single-family household food-waste baselines and garden impact math.

Source: City of Toronto: Food Waste (2017-2018 waste audits)
https://www.toronto.ca/services-payments/recycling-organics-garbage/waste-management/waste-reduction/food-waste/
"""

from __future__ import annotations

from typing import Any

TORONTO_FOOD_WASTE_BASELINE: dict[str, Any] = {
    "jurisdiction": "Toronto",
    "householdType": "single-family",
    "auditPeriod": "2017-2018",
    "sourceUrl": (
        "https://www.toronto.ca/services-payments/recycling-organics-garbage/"
        "waste-management/waste-reduction/food-waste/"
    ),
    # City-wide (tonnes per year, avoidable + unavoidable)
    "cityAnnualFoodWasteTonnes": 99_000,
    # Per household (kg per year)
    "householdTotalFoodWasteKgPerYear": 200,
    "householdAvoidableFoodWasteKgPerYear": 100,
    "householdFruitVegWasteKgPerYear": 45,
    "greenBinFraction": 0.80,
    "avoidableShareOfTotalMin": 0.50,
    # Canadian context on the same page (national, not Toronto-specific)
    "canadianHouseholdEdibleWasteDollarsPerYear": 1300,
}


def _pct(part: float, whole: float) -> float:
    if whole <= 0:
        return 0.0
    return round(100.0 * part / whole, 1)


def compare_garden_to_toronto_baseline(
    *,
    food_kg_per_season: float,
    kg_co2e_per_season: float | None = None,
) -> dict[str, Any]:
    """
    Compare modeled home-grown food (kg/season) to Toronto household waste baselines.

    Assumes one growing season ≈ one calendar year for the comparison (same units
    as optimizer ``foodKgPerSeason``).
    """
    b = TORONTO_FOOD_WASTE_BASELINE
    food = max(0.0, float(food_kg_per_season))

    fruit_veg = b["householdFruitVegWasteKgPerYear"]
    avoidable = b["householdAvoidableFoodWasteKgPerYear"]
    total = b["householdTotalFoodWasteKgPerYear"]
    green_bin = b["greenBinFraction"]

    estimated_green_bin_kg = round(food * green_bin, 1)
    estimated_dollar_value = round(
        (food / avoidable) * b["canadianHouseholdEdibleWasteDollarsPerYear"],
        0,
    )

    out: dict[str, Any] = {
        "input": {
            "foodKgPerSeason": round(food, 2),
            "kgCo2ePerSeason": round(kg_co2e_per_season, 2)
            if kg_co2e_per_season is not None
            else None,
        },
        "baseline": TORONTO_FOOD_WASTE_BASELINE,
        "comparisons": {
            "vsFruitVegWaste": {
                "baselineKgPerYear": fruit_veg,
                "gardenKg": round(food, 2),
                "fraction": round(food / fruit_veg, 3) if fruit_veg else 0,
                "percent": _pct(food, fruit_veg),
                "remainingKgToMatchBaseline": round(max(0.0, fruit_veg - food), 1),
            },
            "vsAvoidableFoodWaste": {
                "baselineKgPerYear": avoidable,
                "gardenKg": round(food, 2),
                "fraction": round(food / avoidable, 3) if avoidable else 0,
                "percent": _pct(food, avoidable),
                "remainingKgToMatchBaseline": round(max(0.0, avoidable - food), 1),
            },
            "vsTotalFoodWaste": {
                "baselineKgPerYear": total,
                "gardenKg": round(food, 2),
                "fraction": round(food / total, 3) if total else 0,
                "percent": _pct(food, total),
                "remainingKgToMatchBaseline": round(max(0.0, total - food), 1),
            },
        },
        "derived": {
            "estimatedGreenBinDiversionKg": estimated_green_bin_kg,
            "greenBinFractionApplied": green_bin,
            "estimatedEdibleWasteDollarsAvoidedCad": estimated_dollar_value,
            "dollarEstimateNote": (
                "Linear extrapolation: (garden kg ÷ 100 kg avoidable) × $1,300 "
                "Canadian household edible waste (City of Toronto page; national stat)."
            ),
        },
        "interpretation": _interpret(food, fruit_veg, avoidable, total),
    }
    return out


def _interpret(
    food: float, fruit_veg: float, avoidable: float, total: float
) -> str:
    pct_fv = _pct(food, fruit_veg)
    if food <= 0:
        return (
            "No home-grown food modeled yet. Toronto households waste ~45 kg of "
            "fruits and vegetables per year on average."
        )
    if food >= fruit_veg:
        return (
            f"At {food:.1f} kg/season, your garden offsets at least the typical "
            f"Toronto household's annual fruit & vegetable waste ({fruit_veg} kg) "
            f":  about {_pct(food, avoidable)}% of avoidable food waste "
            f"({avoidable} kg/yr)."
        )
    return (
        f"At {food:.1f} kg/season, you offset {pct_fv}% of the typical Toronto "
        f"household's annual fruit & vegetable waste ({fruit_veg} kg) and "
        f"{_pct(food, avoidable)}% of avoidable food waste ({avoidable} kg/yr)."
    )
