"""
Day-passage simulator for PlotTwist gardens.

The app currently has no real day-by-day history: the frontend's carbon
chart (app/src/CarbonChart.tsx) and watering-trip grouping (App.tsx
DashboardScreen) are both derived on the fly from a single season-end total
plus `plantedAt`. This module implements the same math in Python so it can
be stepped forward day-by-day and checked against expected behavior —
without waiting weeks for a real garden to grow.

Keep the two models in sync:
  - carbon ramp:        SEASON_DAYS days, linear 0 -> season total (CarbonChart.tsx SEASON_MS)
  - watering cadence:    every `waterEveryDays` days per species (DashboardScreen "Watering trips")
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

# Keep in sync with SEASON_MS = 90 * 24 * 60 * 60 * 1000 in app/src/CarbonChart.tsx
SEASON_DAYS = 90


@dataclass(frozen=True)
class PlantedSpecies:
    """One species' contribution to a planted garden, in Species-catalog units
    (see optimizer/src/types.ts Species / OptimizerResponse.counts)."""

    id: str
    name: str
    count: int
    water_every_days: int
    yield_kg_per_season: float
    co2e_saved_per_kg: float

    def carbon_per_unit(self) -> float:
        """kg CO2e per planting unit/season — mirrors optimizer/src/allocate.ts carbonPerUnit."""
        return self.yield_kg_per_season * self.co2e_saved_per_kg

    def total_carbon_kg(self) -> float:
        return self.count * self.carbon_per_unit()


@dataclass(frozen=True)
class DaySnapshot:
    day: int
    date: date
    carbon_kg_so_far: float
    season_fraction: float
    watering_due: list[str]  # species ids due for water on this day


@dataclass
class GardenSimulation:
    """Simulates a planted garden day-by-day starting at plantedAt (day 0)."""

    planted: list[PlantedSpecies]
    planted_at: date

    def total_carbon_kg(self) -> float:
        return round(sum(p.total_carbon_kg() for p in self.planted), 1)

    def carbon_kg_on_day(self, day: int) -> float:
        """Linear ramp: 0 at day 0 -> season total at SEASON_DAYS, flat after.
        Mirrors carbonAt() in app/src/CarbonChart.tsx."""
        if day < 0:
            raise ValueError("day must be >= 0")
        frac = min(1.0, day / SEASON_DAYS)
        return round(self.total_carbon_kg() * frac, 2)

    def watering_due_on_day(self, day: int) -> list[str]:
        """Species ids due for water on this day. Day 0 is planting day
        (just watered by definition), so nothing is due yet."""
        if day < 0:
            raise ValueError("day must be >= 0")
        if day == 0:
            return []
        return [
            p.id
            for p in self.planted
            if p.water_every_days > 0 and day % p.water_every_days == 0
        ]

    def run(self, num_days: int) -> list[DaySnapshot]:
        """Step forward day-by-day from plantedAt through plantedAt + num_days (inclusive)."""
        if num_days < 0:
            raise ValueError("num_days must be >= 0")
        return [
            DaySnapshot(
                day=day,
                date=self.planted_at + timedelta(days=day),
                carbon_kg_so_far=self.carbon_kg_on_day(day),
                season_fraction=round(min(1.0, day / SEASON_DAYS), 4),
                watering_due=self.watering_due_on_day(day),
            )
            for day in range(num_days + 1)
        ]

    def watering_trips(self, num_days: int) -> dict[int, list[tuple[int, list[str]]]]:
        """Cadence (waterEveryDays) -> [(day, [species ids due that day]), ...].
        Mirrors DashboardScreen's "beds that drink together sit together" grouping,
        but resolved per simulated day instead of just once at plant time."""
        by_id = {p.id: p for p in self.planted}
        cadences = sorted({p.water_every_days for p in self.planted if p.water_every_days > 0})
        result: dict[int, list[tuple[int, list[str]]]] = {c: [] for c in cadences}
        for day in range(1, num_days + 1):
            due = self.watering_due_on_day(day)
            if not due:
                continue
            grouped: dict[int, list[str]] = {}
            for pid in due:
                cadence = by_id[pid].water_every_days
                grouped.setdefault(cadence, []).append(pid)
            for cadence, ids in grouped.items():
                result[cadence].append((day, ids))
        return result


def planted_species_from_counts(
    counts: dict[str, int],
    catalog: list[dict[str, Any]],
) -> list[PlantedSpecies]:
    """Build a PlantedSpecies list from an OptimizerResponse.counts-shaped dict
    (species id -> count) plus a catalog of dicts with 'id'/'name'/'waterEveryDays'/
    'yieldKgPerSeason'/'co2eSavedPerKg' keys (Species[] or plants_curated.json shape)."""
    by_id = {p["id"]: p for p in catalog}
    out: list[PlantedSpecies] = []
    for species_id, count in counts.items():
        if count <= 0:
            continue
        p = by_id.get(species_id)
        if not p:
            raise KeyError(f"Unknown species id in counts: {species_id!r}")
        out.append(
            PlantedSpecies(
                id=species_id,
                name=p.get("name", species_id),
                count=count,
                water_every_days=int(p.get("waterEveryDays", 3)),
                yield_kg_per_season=float(p.get("yieldKgPerSeason", 0)),
                co2e_saved_per_kg=float(p.get("co2eSavedPerKg", 0)),
            )
        )
    return out


if __name__ == "__main__":
    # Quick manual sanity check — same spirit as optimizer/demo/demo.ts.
    demo_planted = [
        PlantedSpecies("tomato_cherry", "Cherry tomato", count=4, water_every_days=2,
                        yield_kg_per_season=3.0, co2e_saved_per_kg=1.4),
        PlantedSpecies("basil", "Basil", count=6, water_every_days=3,
                        yield_kg_per_season=0.5, co2e_saved_per_kg=1.1),
        PlantedSpecies("marigold", "Marigold", count=8, water_every_days=4,
                        yield_kg_per_season=0.0, co2e_saved_per_kg=0.0),
    ]
    sim = GardenSimulation(planted=demo_planted, planted_at=date.today())
    print(f"season total: {sim.total_carbon_kg()} kg CO2e")
    for snap in sim.run(14):
        watering = f" [water: {', '.join(snap.watering_due)}]" if snap.watering_due else ""
        print(
            f"  day {snap.day:>3} ({snap.date}) - "
            f"{snap.carbon_kg_so_far:>5} kg CO2e "
            f"({snap.season_fraction * 100:5.1f}% of season){watering}"
        )
