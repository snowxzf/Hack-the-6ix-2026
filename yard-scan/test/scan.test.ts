import { describe, expect, it } from "vitest";
import { groundScaleFromAttitude } from "../src/attitude";
import { scaleFromCoin } from "../src/coin";
import { scanYard } from "../src/pipeline";
import type { ScanFrame } from "../src/types";

describe("coin scale", () => {
  it("converts CAD quarter pixels to cm/px", () => {
    // 2.388 cm coin appearing as 80 px wide → 0.02985 cm/px
    const { cmPerPx, referenceDiameterCm } = scaleFromCoin(80, "cad_quarter");
    expect(referenceDiameterCm).toBeCloseTo(2.388, 3);
    expect(cmPerPx).toBeCloseTo(2.388 / 80, 5);
  });
});

describe("attitude foreshortening", () => {
  it("leaves scale unchanged when looking straight down", () => {
    const g = groundScaleFromAttitude(0.03, { pitchFromNadirRad: 0 });
    expect(g.x).toBeCloseTo(0.03);
    expect(g.y).toBeCloseTo(0.03);
  });

  it("stretches depth axis when tilted", () => {
    const g = groundScaleFromAttitude(0.03, {
      pitchFromNadirRad: Math.PI / 4,
    });
    expect(g.y).toBeGreaterThan(g.x);
  });
});

describe("scanYard single frame", () => {
  it("measures a rectangular bed and builds a GardenGrid", () => {
    // Coin: CAD quarter, 80px, at origin area
    // Bed: 400×300 px rectangle → at 2.388/80 cm/px ≈ 11.9 × 8.96 cm? Wait that's tiny
    // Use larger bed: if 1 px = 0.5 cm (coin 2.388cm = ~4.78 px) — better use realistic numbers
    // diameterPx such that cmPerPx = 0.5 → diameterPx = 2.388/0.5 = 4.776 — too small for detection
    // Use cmPerPx = 0.25 → diameterPx = 2.388/0.25 ≈ 9.55
    // Better: diameterPx=80, cmPerPx=0.02985; bed 1000×600 px = 29.85 × 17.9 cm — still small garden
    // For a ~3m × 1.8m bed: widthPx = 300/0.02985 ≈ 10050 — huge image
    // Demo with scale that yields ~3m: want widthCm=300, widthPx=600 → cmPerPx=0.5
    // diameterPx = 2.388/0.5 ≈ 4.8 — unrealistic
    // Use custom 10cm reference disk for unit test clarity
    const frame: ScanFrame = {
      id: "f0",
      widthPx: 800,
      heightPx: 600,
      attitude: { pitchFromNadirRad: 0 },
      bedPolygonPx: [
        { x: 100, y: 100 },
        { x: 700, y: 100 },
        { x: 700, y: 500 },
        { x: 100, y: 500 },
      ],
      coin: {
        mode: "custom_object",
        kind: "custom",
        customDiameterCm: 10,
        centerPx: { x: 100, y: 100 },
        diameterPx: 20, // → 0.5 cm/px
        confidence: 0.99,
      },
    };
    // 600×400 px × 0.5 = 300×200 cm = 3×2 m
    const res = scanYard([frame], { cellSizeCm: 30 });
    expect(res.diagnostics.widthCm).toBeCloseTo(300, 0);
    expect(res.diagnostics.heightCm).toBeCloseTo(200, 0);
    expect(res.diagnostics.areaM2).toBeCloseTo(6, 1);
    expect(res.garden.cols).toBe(10);
    expect(res.garden.rows).toBe(7); // ceil(200/30)=7
    expect(res.garden.cells.length).toBeGreaterThan(40);
    expect(res.diagnostics.stitched).toBe(false);
  });
});

describe("scanYard multi-frame stitch", () => {
  it("stitches two overlapping pans into a wider bed", () => {
    const left: ScanFrame = {
      id: "left",
      widthPx: 400,
      heightPx: 400,
      attitude: { pitchFromNadirRad: 0 },
      bedPolygonPx: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 200 },
        { x: 0, y: 200 },
      ],
      coin: {
        mode: "custom_object",
        kind: "custom",
        customDiameterCm: 10,
        centerPx: { x: 0, y: 0 },
        diameterPx: 20, // 0.5 cm/px
        confidence: 0.95,
      },
    };
    const right: ScanFrame = {
      id: "right",
      widthPx: 400,
      heightPx: 400,
      attitude: { pitchFromNadirRad: 0 },
      bedPolygonPx: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 200 },
        { x: 0, y: 200 },
      ],
      stitch: {
        linksTo: "left",
        direction: "right",
        overlapFraction: 0.2,
      },
    };

    const single = scanYard([left], { cellSizeCm: 30 });
    const both = scanYard([left, right], { cellSizeCm: 30 });
    expect(both.diagnostics.stitched).toBe(true);
    expect(both.diagnostics.widthCm).toBeGreaterThan(single.diagnostics.widthCm);
  });
});
