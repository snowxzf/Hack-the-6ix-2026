/**
 * PlotTwist data contracts — the single source of truth for shapes passed
 * between the UI, the optimizer, and Jessica's catalog/API layer.
 *
 * Units convention (agreed 2026-07-17):
 *  - One grid cell = garden.cellSizeCm × garden.cellSizeCm (default 30 cm).
 *  - Species.cellsPerPlant is [w, h] IN CELLS: w = columns wide, h = rows tall.
 *    Jessica converts real-world spacing (seed packets, cm) into cells; the
 *    optimizer never sees real-world units.
 *  - A "plant" here is one PLANTING UNIT at recommended density (e.g. one 1×1
 *    carrot unit ≈ 16 actual carrots, square-foot-gardening style), not one
 *    botanical individual.
 */

export type CellState = "selected" | "blocked" | "obstacle_movable" | "existing_plant";

export interface Cell {
  r: number;
  c: number;
  state: CellState;
}

export interface ExistingPlant {
  cell: [number, number]; // [r, c]
  speciesId: string;
  confidence?: number; // 0..1 from the CV pipeline
  userConfirmed?: boolean;
}

export interface GardenGrid {
  /** Nominal cell size the catalog spacing is calibrated for. */
  cellSizeCm: number;
  cols: number;
  rows: number;
  /** Actual cell size after stretching to tile the bed exactly (≈ cellSizeCm). */
  cellWidthCm?: number;
  cellHeightCm?: number;
  /** Cells NOT listed are outside the garden and unusable. */
  cells: Cell[];
  existing?: ExistingPlant[];
}

export type SkillTier = "beginner" | "intermediate" | "advanced";

export interface Species {
  id: string;
  name: string;
  tier: SkillTier;
  category: string; // "veggies" | "herbs" | "fruit" | "flowers" | "pollinator" ...
  cellsPerPlant: [number, number]; // [w cols, h rows] — already in grid cells
  sun: "full" | "partial" | "shade";
  waterEveryDays: number;
  heightCm: number;
  yieldKgPerSeason: number; // 0 for ornamentals
  co2eSavedPerKg: number; // kg CO2e displaced per kg grown vs store-bought
  companions: string[]; // species ids that benefit from adjacency
  /** Typical days to first harvest (vegetables). Optional for ornamentals. */
  daysToHarvest?: number;
  daysToHarvestMin?: number;
  daysToHarvestMax?: number;
}

export interface Target {
  speciesId: string;
  min: number; // hard minimum count the user asked for
}

export interface Preferences {
  tier: SkillTier;
  /** Empty array = no category filter (everything at the user's tier). */
  categories: string[];
}

export interface OptimizerRequest {
  garden: GardenGrid;
  preferences: Preferences;
  targets?: Target[];
  /** 0 = ignore carbon, 1 = maximize carbon savings. Default 0.5. */
  carbonWeight?: number;
  /** Jessica's real catalog goes here; defaults to the bundled mock. */
  catalog?: Species[];
}

export interface PlacementInstance {
  speciesId: string;
  origin: [number, number]; // top-left [r, c]
  w: number; // cols spanned (after any rotation)
  h: number; // rows spanned
  cells: [number, number][];
}

export interface SpeciesBed {
  speciesId: string;
  count: number;
  cells: [number, number][];
}

export interface Conflict {
  speciesId?: string;
  message: string;
}

export interface CompromiseInfo {
  strategy: "scaled_targets";
  original: Record<string, number>;
  applied: Record<string, number>;
}

export interface SwapSuggestion {
  out: string;
  in: string;
  deltaKgCo2e: number;
  reason: string;
}

export interface ObstacleTask {
  cell: [number, number];
  message: string;
}

export interface CarbonReport {
  kgCo2eSeason: number;
  foodKgPerSeason: number;
  kmDrivingEquiv: number;
}

export interface OptimizerResponse {
  feasible: boolean;
  conflicts: Conflict[];
  compromise?: CompromiseInfo;
  /** Final planted counts per species (post-placement truth). */
  counts: Record<string, number>;
  placements: PlacementInstance[];
  beds: SpeciesBed[];
  existingBeds: SpeciesBed[];
  carbon: CarbonReport;
  swaps: SwapSuggestion[];
  tasks: ObstacleTask[];
  stats: {
    usableCells: number;
    usedCells: number;
    utilization: number; // 0..1
    solveMs: number;
  };
}
