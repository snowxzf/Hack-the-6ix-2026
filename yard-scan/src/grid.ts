import { boundsOf, pointInPolygon, translatePolygon } from "./geometry";
import type { Cell, GardenGrid, Point2, WorldPolygon } from "./types";

/**
 * Rasterize a ground-plane bed polygon into the optimizer's GardenGrid.
 * Cells whose centers fall inside the polygon are "selected".
 */
export function worldPolygonToGardenGrid(
  bed: WorldPolygon,
  cellSizeCm = 30,
): GardenGrid {
  if (bed.pointsCm.length < 3) {
    return { cellSizeCm, cols: 0, rows: 0, cells: [] };
  }

  // Normalize so top-left of bbox is (0,0)
  const b = boundsOf(bed.pointsCm);
  const normalized = translatePolygon(bed.pointsCm, -b.minX, -b.minY);
  const widthCm = b.widthCm;
  const heightCm = b.heightCm;

  const cols = Math.max(1, Math.ceil(widthCm / cellSizeCm));
  const rows = Math.max(1, Math.ceil(heightCm / cellSizeCm));

  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const center: Point2 = {
        x: (c + 0.5) * cellSizeCm,
        y: (r + 0.5) * cellSizeCm,
      };
      if (pointInPolygon(center, normalized)) {
        cells.push({ r, c, state: "selected" });
      }
    }
  }

  return { cellSizeCm, cols, rows, cells };
}
