import { scanYard, SCAN_UX } from "../src/index";
import type { ScanFrame } from "../src/types";

/**
 * Simulated backyard scan:
 *  - User puts a Canadian quarter in frame
 *  - Holds phone nearly overhead (CoreMotion pitch ≈ 15°)
 *  - Bed too wide → two overlapping shots, stitched
 */
const left: ScanFrame = {
  id: "left",
  widthPx: 1920,
  heightPx: 1080,
  attitude: { pitchFromNadirRad: (15 * Math.PI) / 180 },
  // ~2.4 m × 1.5 m patch in this frame (custom 5 cm marker @ 20 px → 0.25 cm/px)
  bedPolygonPx: [
    { x: 100, y: 100 },
    { x: 1060, y: 100 },
    { x: 1060, y: 700 },
    { x: 100, y: 700 },
  ],
  coin: {
    mode: "custom_object",
    kind: "custom",
    customDiameterCm: 5,
    centerPx: { x: 120, y: 680 },
    diameterPx: 20,
    confidence: 0.95,
  },
};

const right: ScanFrame = {
  id: "right",
  widthPx: 1920,
  heightPx: 1080,
  attitude: { pitchFromNadirRad: (18 * Math.PI) / 180 },
  bedPolygonPx: [
    { x: 100, y: 100 },
    { x: 1060, y: 100 },
    { x: 1060, y: 700 },
    { x: 100, y: 700 },
  ],
  stitch: {
    linksTo: "left",
    direction: "right",
    overlapFraction: 0.2,
  },
};

console.log(SCAN_UX.placeCoin);
console.log(SCAN_UX.multiFrame);

const result = scanYard([left, right], { cellSizeCm: 30 });

console.log("\n— Yard scan result —");
console.log(
  `Size: ${result.diagnostics.widthCm} × ${result.diagnostics.heightCm} cm`,
  `(${result.diagnostics.areaM2} m²)`,
);
console.log(
  `Grid: ${result.garden.cols}×${result.garden.rows} cells @ ${result.garden.cellSizeCm} cm`,
  `(${result.garden.cells.length} usable)`,
);
console.log(`Frames: ${result.diagnostics.frameCount}, stitched=${result.diagnostics.stitched}`);
console.log(
  `Scale: ${result.diagnostics.scale.reference} → ${result.diagnostics.scale.cmPerPx.toFixed(4)} cm/px`,
);
console.log(
  SCAN_UX.confirmDims(result.diagnostics.widthCm, result.diagnostics.heightCm),
);
if (result.diagnostics.warnings.length) {
  console.log("Warnings:", result.diagnostics.warnings);
}

// ASCII preview of the grid
const { cols, rows, cells } = result.garden;
const set = new Set(cells.map((c) => `${c.r},${c.c}`));
console.log("\nGrid preview (■ = bed):");
for (let r = 0; r < Math.min(rows, 16); r++) {
  let line = "";
  for (let c = 0; c < Math.min(cols, 40); c++) {
    line += set.has(`${r},${c}`) ? "■" : "·";
  }
  console.log(line);
}
