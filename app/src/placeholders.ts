/**
 * ─────────────────────────────────────────────────────────────
 *  JESSICA INTEGRATION POINTS — every fake thing lives here.
 *  Replace the bodies, keep the signatures, nothing else moves.
 * ─────────────────────────────────────────────────────────────
 */
import { MOCK_CATALOG, SUBURBAN } from "../../optimizer/src/index";
import type { GardenGrid, Species } from "../../optimizer/src/index";

/** TODO(Jessica): photo → CV segmentation → grid. For now every photo becomes the demo yard. */
export function scanPhotoToGarden(_photoUrl: string | null): GardenGrid {
  return structuredClone(SUBURBAN);
}

/** TODO(Jessica): fetch curated catalog from Mongo/plants.json, fall back to bundled mock. */
export function getCatalog(): Species[] {
  return MOCK_CATALOG;
}

/** TODO(Jessica/UI): Open-Meteo forecast → rule engine. Hardcoded storm for the demo. */
export const FAKE_WEATHER_ALERT = {
  severity: "warning" as const,
  title: "⛈ Thunderstorm Friday ~6 PM",
  advice: "Petunia Protection Protocol: cover seedlings and move potted succulents inside.",
};

/** TODO(Jessica): per-species daysToHarvest in the real catalog. Rough per-category stand-ins. */
export const DAYS_TO_HARVEST: Record<string, number> = {
  veggies: 70,
  herbs: 40,
  fruit: 90,
  flowers: 60,
  pollinator: 75,
};
