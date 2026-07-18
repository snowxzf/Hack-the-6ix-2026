import type { GardenGrid, OptimizerResponse, Species } from "./types";

/**
 * Debug/demo renderer: draws the garden as ASCII.
 *   A–Z  planted beds (legend below)
 *   x    existing plants detected by the scan
 *   .    selected but unplanted
 *   o    movable obstacle (unused)
 *   #    blocked (path, shed…)
 *   (space) outside the garden
 */
export function renderAscii(
  garden: GardenGrid,
  res: OptimizerResponse,
  catalog: Species[],
): string {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const grid: string[][] = Array.from({ length: garden.rows }, () =>
    Array(garden.cols).fill(" "),
  );

  for (const cell of garden.cells) {
    grid[cell.r][cell.c] =
      cell.state === "selected"
        ? "."
        : cell.state === "obstacle_movable"
          ? "o"
          : cell.state === "blocked"
            ? "#"
            : "x";
  }

  const letters: Record<string, string> = {};
  let next = 0;
  for (const bed of res.beds) {
    const letter = String.fromCharCode(65 + (next++ % 26));
    letters[bed.speciesId] = letter;
    for (const [r, c] of bed.cells) grid[r][c] = letter;
  }

  const rows = grid.map((row) => row.join(" "));
  const legend = res.beds.map(
    (bed) =>
      `  ${letters[bed.speciesId]} = ${byId.get(bed.speciesId)?.name ?? bed.speciesId} ×${bed.count}`,
  );
  const existing = res.existingBeds.map(
    (bed) => `  x = ${byId.get(bed.speciesId)?.name ?? bed.speciesId} ×${bed.count} (already growing)`,
  );

  return [...rows, "", ...legend, ...existing].join("\n");
}
