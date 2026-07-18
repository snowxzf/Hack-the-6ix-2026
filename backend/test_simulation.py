from datetime import date

import pytest

from simulation import (
    SEASON_DAYS,
    GardenSimulation,
    PlantedSpecies,
    planted_species_from_counts,
)


def tomato(**overrides) -> PlantedSpecies:
    defaults = dict(
        id="tomato_cherry",
        name="Cherry tomato",
        count=4,
        water_every_days=2,
        yield_kg_per_season=3.0,
        co2e_saved_per_kg=1.4,
    )
    defaults.update(overrides)
    return PlantedSpecies(**defaults)


def basil(**overrides) -> PlantedSpecies:
    defaults = dict(
        id="basil",
        name="Basil",
        count=6,
        water_every_days=3,
        yield_kg_per_season=0.5,
        co2e_saved_per_kg=1.1,
    )
    defaults.update(overrides)
    return PlantedSpecies(**defaults)


def marigold(**overrides) -> PlantedSpecies:
    """Ornamental: yield=0 so it contributes zero carbon (food-plants-only rule)."""
    defaults = dict(
        id="marigold",
        name="Marigold",
        count=8,
        water_every_days=4,
        yield_kg_per_season=0.0,
        co2e_saved_per_kg=0.0,
    )
    defaults.update(overrides)
    return PlantedSpecies(**defaults)


class TestCarbonRamp:
    def test_total_is_sum_of_count_times_yield_times_factor(self):
        sim = GardenSimulation(planted=[tomato(), basil()], planted_at=date(2026, 1, 1))
        # 4 * 3.0 * 1.4 + 6 * 0.5 * 1.1 = 16.8 + 3.3
        assert sim.total_carbon_kg() == pytest.approx(20.1)

    def test_ornamental_contributes_zero_carbon(self):
        sim = GardenSimulation(planted=[marigold()], planted_at=date(2026, 1, 1))
        assert sim.total_carbon_kg() == 0.0
        assert sim.carbon_kg_on_day(SEASON_DAYS) == 0.0

    def test_zero_at_plant_day(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        assert sim.carbon_kg_on_day(0) == 0.0

    def test_linear_midpoint(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        half = sim.total_carbon_kg() / 2
        assert sim.carbon_kg_on_day(SEASON_DAYS // 2) == pytest.approx(half, abs=0.05)

    def test_reaches_full_total_at_season_end(self):
        sim = GardenSimulation(planted=[tomato(), basil()], planted_at=date(2026, 1, 1))
        assert sim.carbon_kg_on_day(SEASON_DAYS) == sim.total_carbon_kg()

    def test_flat_after_season_end(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        assert sim.carbon_kg_on_day(SEASON_DAYS + 30) == sim.total_carbon_kg()

    def test_monotonically_non_decreasing(self):
        sim = GardenSimulation(planted=[tomato(), basil(), marigold()], planted_at=date(2026, 1, 1))
        values = [sim.carbon_kg_on_day(d) for d in range(SEASON_DAYS + 10)]
        assert all(b >= a for a, b in zip(values, values[1:]))

    def test_negative_day_rejected(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        with pytest.raises(ValueError):
            sim.carbon_kg_on_day(-1)


class TestWateringCadence:
    def test_nothing_due_on_plant_day(self):
        sim = GardenSimulation(planted=[tomato(), basil()], planted_at=date(2026, 1, 1))
        assert sim.watering_due_on_day(0) == []

    def test_due_exactly_on_multiples_of_cadence(self):
        sim = GardenSimulation(planted=[tomato(water_every_days=2)], planted_at=date(2026, 1, 1))
        assert sim.watering_due_on_day(1) == []
        assert sim.watering_due_on_day(2) == ["tomato_cherry"]
        assert sim.watering_due_on_day(3) == []
        assert sim.watering_due_on_day(4) == ["tomato_cherry"]

    def test_species_with_different_cadences_dont_collide(self):
        sim = GardenSimulation(planted=[tomato(water_every_days=2), basil(water_every_days=3)],
                                planted_at=date(2026, 1, 1))
        assert sim.watering_due_on_day(2) == ["tomato_cherry"]
        assert sim.watering_due_on_day(3) == ["basil"]
        assert set(sim.watering_due_on_day(6)) == {"tomato_cherry", "basil"}

    def test_zero_cadence_never_due(self):
        odd = tomato(id="succulent", water_every_days=0)
        sim = GardenSimulation(planted=[odd], planted_at=date(2026, 1, 1))
        for day in range(1, 30):
            assert sim.watering_due_on_day(day) == []

    def test_negative_day_rejected(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        with pytest.raises(ValueError):
            sim.watering_due_on_day(-1)


class TestWateringTrips:
    def test_groups_by_cadence_across_the_run(self):
        sim = GardenSimulation(
            planted=[tomato(water_every_days=2), basil(water_every_days=2, id="basil2")],
            planted_at=date(2026, 1, 1),
        )
        trips = sim.watering_trips(4)
        # Both species share a 2-day cadence, so they should always trip together.
        assert trips[2] == [
            (2, ["tomato_cherry", "basil2"]),
            (4, ["tomato_cherry", "basil2"]),
        ]

    def test_includes_every_cadence_present_even_if_no_days_requested(self):
        sim = GardenSimulation(planted=[tomato(water_every_days=5)], planted_at=date(2026, 1, 1))
        trips = sim.watering_trips(0)
        assert trips == {5: []}


class TestRun:
    def test_snapshot_count_is_inclusive(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        snaps = sim.run(10)
        assert len(snaps) == 11
        assert [s.day for s in snaps] == list(range(11))

    def test_dates_advance_one_per_day(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        snaps = sim.run(3)
        assert [s.date for s in snaps] == [date(2026, 1, d) for d in (1, 2, 3, 4)]

    def test_negative_num_days_rejected(self):
        sim = GardenSimulation(planted=[tomato()], planted_at=date(2026, 1, 1))
        with pytest.raises(ValueError):
            sim.run(-1)


class TestPlantedSpeciesFromCounts:
    CATALOG = [
        {"id": "tomato_cherry", "name": "Cherry tomato", "waterEveryDays": 2,
         "yieldKgPerSeason": 3.0, "co2eSavedPerKg": 1.4},
        {"id": "basil", "name": "Basil", "waterEveryDays": 3,
         "yieldKgPerSeason": 0.5, "co2eSavedPerKg": 1.1},
    ]

    def test_builds_from_optimizer_counts_shape(self):
        counts = {"tomato_cherry": 4, "basil": 6}
        planted = planted_species_from_counts(counts, self.CATALOG)
        assert {p.id: p.count for p in planted} == {"tomato_cherry": 4, "basil": 6}
        by_id = {p.id: p for p in planted}
        assert by_id["tomato_cherry"].water_every_days == 2
        assert by_id["basil"].co2e_saved_per_kg == 1.1

    def test_zero_counts_are_dropped(self):
        counts = {"tomato_cherry": 4, "basil": 0}
        planted = planted_species_from_counts(counts, self.CATALOG)
        assert [p.id for p in planted] == ["tomato_cherry"]

    def test_unknown_species_id_raises(self):
        with pytest.raises(KeyError):
            planted_species_from_counts({"not_in_catalog": 1}, self.CATALOG)

    def test_end_to_end_matches_frontend_carbon_report_math(self):
        """Cross-check against optimizer/src/carbon.ts carbonReport():
        kg = sum(count * yieldKgPerSeason * co2eSavedPerKg)."""
        counts = {"tomato_cherry": 4, "basil": 6}
        planted = planted_species_from_counts(counts, self.CATALOG)
        sim = GardenSimulation(planted=planted, planted_at=date(2026, 1, 1))
        assert sim.total_carbon_kg() == pytest.approx(4 * 3.0 * 1.4 + 6 * 0.5 * 1.1)
