import { boundsOf, pointInPolygon, translatePolygon } from "./geometry";
import type { Cell, GardenGrid, Point2, WorldPolygon } from "./types";

/**
 * Rasterize a ground-plane bed polygon into the optimizer's GardenGrid.
 *
 * Cells *tile the full bed*: instead of exact cellSizeCm cells plus a dead
 * remainder strip (no bed is a multiple of 30 cm), the cell size stretches so
 * columns and rows cover the bounding box edge to edge — like a real
 * square-foot-garden layout. Cells only ever get bigger than nominal (up to
 * ~5% smaller in the worst rounding case), so plant spacing stays safe.
 *
 * A cell is "selected" when roughly half or more of its area lies inside the
 * polygon (3×3 subsampling) — relevant for non-rectangular outlines.
 */
export interface GridDivisions {
  /** Explicit number of columns (overrides the cell-size-based default). */
  cols?: number;
  /** Explicit number of rows (overrides the cell-size-based default). */
  rows?: number;
}

export function worldPolygonToGardenGrid(
  bed: WorldPolygon,
  cellSizeCm = 30,
  divisions?: GridDivisions,
): GardenGrid {
  if (bed.pointsCm.length < 3) {
    return { cellSizeCm, cols: 0, rows: 0, cells: [] };
  }

  // Normalize so top-left of bbox is (0,0)
  const b = boundsOf(bed.pointsCm);
  const normalized = translatePolygon(bed.pointsCm, -b.minX, -b.minY);
  const widthCm = b.widthCm;
  const heightCm = b.heightCm;

  // floor(+0.15): only round *up* to an extra column when cells would end up
  // within ~5% of nominal — otherwise the remainder stretches into the row.
  // The user can override the division outright (e.g. "3 across, 6 down").
  const clampDiv = (n: number) => Math.min(Math.max(Math.round(n), 1), 200);
  const cols = divisions?.cols
    ? clampDiv(divisions.cols)
    : Math.max(1, Math.floor(widthCm / cellSizeCm + 0.15));
  const rows = divisions?.rows
    ? clampDiv(divisions.rows)
    : Math.max(1, Math.floor(heightCm / cellSizeCm + 0.15));
  const cellW = widthCm / cols;
  const cellH = heightCm / rows;

  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let insideCount = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const p: Point2 = {
            x: (c + (sx + 0.5) / 3) * cellW,
            y: (r + (sy + 0.5) / 3) * cellH,
          };
          if (pointInPolygon(p, normalized)) insideCount++;
        }
      }
      if (insideCount >= 5) {
        cells.push({ r, c, state: "selected" });
      }
    }
  }

  return { cellSizeCm, cols, rows, cells, cellWidthCm: round1(cellW), cellHeightCm: round1(cellH) };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
