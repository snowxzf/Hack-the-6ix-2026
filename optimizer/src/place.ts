import { areaOf } from "./allocate";
import type {
  GardenGrid,
  ObstacleTask,
  PlacementInstance,
  Species,
  SpeciesBed,
} from "./types";

/**
 * Stage B: placement: decide WHERE each planting unit goes.
 *
 * Grid variant of First-Fit Decreasing (Johnson et al. 1974): sort species into
 * a priority order, then scanline each unit into the best-scoring free slot
 * (north-west preference: a flipped Bottom-Left heuristic, Baker-Coffman-
 * Rivest 1980). Rotation is tried when the footprint isn't square.
 *
 * The sort order IS the horticulture:
 *   1. taller species first  → they land on the north edge, so they don't
 *      shade shorter neighbours (scanline runs north → south);
 *   2. bigger footprints first → classic FFD, big blocks before fragmentation;
 *   3. similar watering needs adjacent → beds that drink together sit
 *      together, which is what lets the app batch watering into one trip.
 *
 * Position scoring adds a strong bonus for touching your own species (beds
 * stay contiguous: "a square of lilies beside a square of petunias") and a
 * mild bonus for touching companion species (basil next to tomatoes).
 */

export interface PlaceOutcome {
  placements: PlacementInstance[];
  beds: SpeciesBed[];
  existingBeds: SpeciesBed[];
  unplaced: Map<string, number>;
  tasks: ObstacleTask[];
  usedCells: number;
}

const SAME_SPECIES_BONUS = 60;
const COMPANION_BONUS = 12;
const NORTH_WEIGHT = 4;
const WEST_WEIGHT = 0.5;
const OBSTACLE_PENALTY = 2;
/**
 * Bonus per perimeter cell touching a wall, grid edge, or another bed.
 * This is the edge-fitting idea from the 2D packing literature: blocks that
 * hug boundaries leave no unusable 1-wide gutters behind. Must outweigh
 * OBSTACLE_PENALTY so tight packing beats obstacle-dodging.
 */
const CONTACT_WEIGHT = 3;

export function place(
  garden: GardenGrid,
  plan: Map<string, number>,
  catalog: Species[],
  targetIds: Set<string> = new Set(),
): PlaceOutcome {
  const byId = new Map(catalog.map((s) => [s.id, s]));

  // Build lookup grids. null = outside garden / blocked.
  const usable: boolean[][] = Array.from({ length: garden.rows }, () =>
    Array(garden.cols).fill(false),
  );
  const isObstacle: boolean[][] = Array.from({ length: garden.rows }, () =>
    Array(garden.cols).fill(false),
  );
  const occupant: (string | null)[][] = Array.from({ length: garden.rows }, () =>
    Array(garden.cols).fill(null),
  );

  for (const cell of garden.cells) {
    if (cell.state === "selected") usable[cell.r][cell.c] = true;
    if (cell.state === "obstacle_movable") {
      usable[cell.r][cell.c] = true;
      isObstacle[cell.r][cell.c] = true;
    }
  }

  const existingBedMap = new Map<string, SpeciesBed>();
  for (const ex of garden.existing ?? []) {
    const [r, c] = ex.cell;
    if (r < 0 || r >= garden.rows || c < 0 || c >= garden.cols) continue;
    occupant[r][c] = ex.speciesId;
    usable[r][c] = false;
    const bed = existingBedMap.get(ex.speciesId) ?? {
      speciesId: ex.speciesId,
      count: 0,
      cells: [],
    };
    bed.count += 1;
    bed.cells.push([r, c]);
    existingBedMap.set(ex.speciesId, bed);
  }

  // Deterministic placement order. Two phases: the user's hard targets claim
  // geometry first (their space is a promise, not a preference), then greedy
  // filler. Within each phase: height desc (tall lands north), area desc
  // (FFD), water asc (beds that drink together sit together), id asc.
  const order = [...plan.entries()]
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ s: byId.get(id)!, n }))
    .filter((e) => e.s !== undefined)
    .sort(
      (a, b) =>
        Number(targetIds.has(b.s.id)) - Number(targetIds.has(a.s.id)) ||
        b.s.heightCm - a.s.heightCm ||
        areaOf(b.s) - areaOf(a.s) ||
        a.s.waterEveryDays - b.s.waterEveryDays ||
        a.s.id.localeCompare(b.s.id),
    );

  const placements: PlacementInstance[] = [];
  const unplaced = new Map<string, number>();
  const taskCells = new Map<string, ObstacleTask>();

  const free = (r: number, c: number) =>
    r >= 0 && r < garden.rows && c >= 0 && c < garden.cols && usable[r][c] && !occupant[r][c];

  const scanPerimeter = (
    r0: number,
    c0: number,
    w: number,
    h: number,
  ): { species: string[]; solidContacts: number } => {
    const species: string[] = [];
    let solidContacts = 0;
    const check = (r: number, c: number) => {
      if (r < 0 || r >= garden.rows || c < 0 || c >= garden.cols) {
        solidContacts++; // grid edge counts as a wall
        return;
      }
      const occ = occupant[r][c];
      if (occ) {
        species.push(occ);
        solidContacts++;
      } else if (!usable[r][c]) {
        solidContacts++; // blocked / outside-garden cell
      }
    };
    for (let c = c0; c < c0 + w; c++) {
      check(r0 - 1, c);
      check(r0 + h, c);
    }
    for (let r = r0; r < r0 + h; r++) {
      check(r, c0 - 1);
      check(r, c0 + w);
    }
    return { species, solidContacts };
  };

  for (const { s, n } of order) {
    const orientations: [number, number][] =
      s.cellsPerPlant[0] === s.cellsPerPlant[1]
        ? [s.cellsPerPlant]
        : [s.cellsPerPlant, [s.cellsPerPlant[1], s.cellsPerPlant[0]]];

    for (let unit = 0; unit < n; unit++) {
      let bestScore = -Infinity;
      let best: { r: number; c: number; w: number; h: number } | null = null;

      for (const [w, h] of orientations) {
        for (let r0 = 0; r0 + h <= garden.rows; r0++) {
          for (let c0 = 0; c0 + w <= garden.cols; c0++) {
            let fits = true;
            let obstacles = 0;
            for (let r = r0; r < r0 + h && fits; r++) {
              for (let c = c0; c < c0 + w && fits; c++) {
                if (!free(r, c)) fits = false;
                else if (isObstacle[r][c]) obstacles++;
              }
            }
            if (!fits) continue;

            const peri = scanPerimeter(r0, c0, w, h);
            let score =
              -(r0 * NORTH_WEIGHT) -
              c0 * WEST_WEIGHT -
              obstacles * OBSTACLE_PENALTY +
              peri.solidContacts * CONTACT_WEIGHT;
            for (const nb of peri.species) {
              if (nb === s.id) score += SAME_SPECIES_BONUS;
              else if (
                s.companions.includes(nb) ||
                (byId.get(nb)?.companions.includes(s.id) ?? false)
              )
                score += COMPANION_BONUS;
            }
            if (score > bestScore) {
              bestScore = score;
              best = { r: r0, c: c0, w, h };
            }
          }
        }
      }

      if (!best) {
        unplaced.set(s.id, (unplaced.get(s.id) ?? 0) + (n - unit));
        break;
      }

      const cells: [number, number][] = [];
      for (let r = best.r; r < best.r + best.h; r++) {
        for (let c = best.c; c < best.c + best.w; c++) {
          occupant[r][c] = s.id;
          cells.push([r, c]);
          if (isObstacle[r][c]) {
            taskCells.set(`${r},${c}`, {
              cell: [r, c],
              message: `Move the obstacle at row ${r + 1}, column ${c + 1}: a ${s.name} bed goes there.`,
            });
          }
        }
      }
      placements.push({ speciesId: s.id, origin: [best.r, best.c], w: best.w, h: best.h, cells });
    }
  }

  const bedMap = new Map<string, SpeciesBed>();
  for (const p of placements) {
    const bed = bedMap.get(p.speciesId) ?? { speciesId: p.speciesId, count: 0, cells: [] };
    bed.count += 1;
    bed.cells.push(...p.cells);
    bedMap.set(p.speciesId, bed);
  }

  return {
    placements,
    beds: [...bedMap.values()],
    existingBeds: [...existingBedMap.values()],
    unplaced,
    tasks: [...taskCells.values()],
    usedCells: placements.reduce((sum, p) => sum + p.cells.length, 0),
  };
}
