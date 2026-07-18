import type { Cell, GardenGrid } from "./types";

/** Mock gardens standing in for Jessica's photo → grid pipeline. */

function fill(
  rows: number,
  cols: number,
  override: (r: number, c: number) => Cell["state"] | null = () => "selected",
): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const state = override(r, c);
      if (state !== null) cells.push({ r, c, state });
    }
  }
  return cells;
}

/**
 * 14×10 suburban backyard: a stone path (blocked) splits it in two,
 * a bike (movable obstacle) leans in the corner, and the CV pipeline
 * found three existing lilies along the right edge.
 */
export const SUBURBAN: GardenGrid = {
  cellSizeCm: 30,
  cols: 14,
  rows: 10,
  cells: fill(10, 14, (r, c) => {
    if (c === 6) return "blocked"; // stone path
    if (r === 0 && (c === 0 || c === 1)) return "obstacle_movable"; // bike
    if (c === 13 && r <= 2) return "existing_plant"; // lilies
    return "selected";
  }),
  existing: [
    { cell: [0, 13], speciesId: "lily", confidence: 0.91, userConfirmed: true },
    { cell: [1, 13], speciesId: "lily", confidence: 0.84, userConfirmed: true },
    { cell: [2, 13], speciesId: "lily", confidence: 0.77, userConfirmed: true },
  ],
};

/** 4×3 balcony planter — 12 cells total. Great for infeasibility demos. */
export const BALCONY: GardenGrid = {
  cellSizeCm: 30,
  cols: 4,
  rows: 3,
  cells: fill(3, 4),
};

/**
 * L-shaped side yard: 12 wide for the first 4 rows, then only 5 wide.
 * Area-feasible but geometry-hostile — big footprints won't fit.
 */
export const L_SHAPE: GardenGrid = {
  cellSizeCm: 30,
  cols: 12,
  rows: 8,
  cells: fill(8, 12, (r, c) => (r < 4 || c < 5 ? "selected" : null)),
};

/** 2 cols × 4 rows strip — forces rotation for the 4×2 pumpkin. */
export const NARROW_STRIP: GardenGrid = {
  cellSizeCm: 30,
  cols: 2,
  rows: 4,
  cells: fill(4, 2),
};
