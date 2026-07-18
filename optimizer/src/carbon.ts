import { areaOf, carbonPerUnit } from "./allocate";
import type { CarbonReport, Species, SwapSuggestion } from "./types";

/**
 * Stage C: carbon accounting + swap suggestions.
 *
 * savings = Σ count × yieldKgPerSeason × co2eSavedPerKg
 * (kg CO2e displaced by growing instead of buying: factors from Jessica's
 * catalog, methodology per Poore & Nemecek 2018 / Our World in Data.)
 *
 * PLACEHOLDER: research team must verify before the pitch:
 * average passenger-car emissions used for the driving equivalence.
 */
const KG_CO2E_PER_KM_DRIVEN = 0.2;

export function carbonReport(
  counts: Map<string, number>,
  catalog: Species[],
): CarbonReport {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  let kg = 0;
  let food = 0;
  for (const [id, n] of counts) {
    const s = byId.get(id);
    if (!s) continue;
    kg += n * carbonPerUnit(s);
    food += n * s.yieldKgPerSeason;
  }
  return {
    kgCo2eSeason: round1(kg),
    foodKgPerSeason: round1(food),
    kmDrivingEquiv: round1(kg / KG_CO2E_PER_KM_DRIVEN),
  };
}

/**
 * Swaps: for each planted species the user did NOT hard-target, find a
 * same-category alternative with better carbon savings per cell. Advisory
 * only: estimates assume the swapped bed keeps the same area.
 */
export function suggestSwaps(
  counts: Map<string, number>,
  candidates: Species[],
  targetIds: Set<string>,
): SwapSuggestion[] {
  const perCell = (s: Species) => carbonPerUnit(s) / areaOf(s);
  const suggestions: SwapSuggestion[] = [];

  for (const [id, n] of counts) {
    if (n === 0 || targetIds.has(id)) continue;
    const current = candidates.find((s) => s.id === id);
    if (!current) continue;

    let best: Species | null = null;
    for (const alt of candidates) {
      if (alt.id === current.id || alt.category !== current.category) continue;
      if (perCell(alt) <= perCell(current) + 1e-9) continue;
      if (!best || perCell(alt) > perCell(best)) best = alt;
    }
    if (!best) continue;

    const cellsUsed = n * areaOf(current);
    const delta = (perCell(best) - perCell(current)) * cellsUsed;
    suggestions.push({
      out: current.id,
      in: best.id,
      deltaKgCo2e: round1(delta),
      reason: `${best.name} saves ~${perCell(best).toFixed(1)} kg CO₂e per cell each season vs ${current.name}'s ~${perCell(current).toFixed(1)}.`,
    });
  }

  return suggestions.sort((a, b) => b.deltaKgCo2e - a.deltaKgCo2e).slice(0, 3);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
