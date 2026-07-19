import { describe, expect, it } from "vitest";
import { COIN_DIAMETER_CM } from "../src/coin";
import { scanYard } from "../src/pipeline";
import type { Point2, ScanFrame } from "../src/types";

/**
 * Synthetic multi-photo accuracy: a bed too wide for one shot, photographed
 * as overlapping sections from *different* camera positions, sharing one
 * coin on the ground. The stitched result must recover the true size.
 */

function projectGroundToImage(
  g: Point2,
  o: {
    pitch: number;
    f: number;
    cx: number;
    cy: number;
    camHeight: number;
    camX: number;
    camY: number;
  },
): Point2 {
  const c = Math.cos(o.pitch);
  const s = Math.sin(o.pitch);
  const toCam = { x: g.x - o.camX, y: g.y - o.camY, z: -o.camHeight };
  const y1 = toCam.y * c + toCam.z * s;
  const z1 = -toCam.y * s + toCam.z * c;
  const cam = { x: toCam.x, y: -y1, z: -z1 };
  if (cam.z <= 1e-6) throw new Error("behind camera");
  return {
    x: o.cx + (o.f * cam.x) / cam.z,
    y: o.cy + (o.f * cam.y) / cam.z,
  };
}

const IMW = 2160;
const IMH = 2880;
const F = (26 / 36) * IMH; // 26mm-equiv phone lens
const COIN = COIN_DIAMETER_CM.cad_quarter;

/** Build one ScanFrame viewing a ground-plane section with the coin. */
function frameFor(opts: {
  id: string;
  sectionCm: Point2[]; // 4 corners, boundary order, shared world coords
  coinCenter: Point2;
  camX: number;
  camY: number;
  camHeight: number;
  pitchDeg: number;
  linksTo?: string;
  direction?: "right" | "left";
  overlapFraction?: number;
  includeCoin?: boolean;
}): ScanFrame {
  const proj = (g: Point2) =>
    projectGroundToImage(g, {
      pitch: (opts.pitchDeg * Math.PI) / 180,
      f: F,
      cx: IMW / 2,
      cy: IMH / 2,
      camHeight: opts.camHeight,
      camX: opts.camX,
      camY: opts.camY,
    });
  const a = proj({ x: opts.coinCenter.x - COIN / 2, y: opts.coinCenter.y });
  const b = proj({ x: opts.coinCenter.x + COIN / 2, y: opts.coinCenter.y });
  const frame: ScanFrame = {
    id: opts.id,
    widthPx: IMW,
    heightPx: IMH,
    focalPx: F,
    attitude: { pitchFromNadirRad: (opts.pitchDeg * Math.PI) / 180 },
    bedPolygonPx: opts.sectionCm.map(proj),
  };
  if (opts.includeCoin !== false) {
    frame.reference = {
      mode: "coin",
      kind: "cad_quarter",
      centerPx: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      diameterPx: Math.hypot(b.x - a.x, b.y - a.y),
      edgeAPx: a,
      edgeBPx: b,
      confidence: 0.95,
    };
  }
  if (opts.linksTo) {
    frame.stitch = {
      linksTo: opts.linksTo,
      direction: opts.direction ?? "right",
      overlapFraction: opts.overlapFraction ?? 0.3,
    };
  }
  return frame;
}

describe("stitched multi-photo accuracy", () => {
  // 300 × 100 cm bed spanning x ∈ [−150, 150], y ∈ [30, 130].
  // The coin sits inside the overlap zone so both photos can see it.
  const coin = { x: 0, y: 60 };
  const leftSection: Point2[] = [
    { x: -150, y: 30 },
    { x: 30, y: 30 },
    { x: 30, y: 130 },
    { x: -150, y: 130 },
  ];
  const rightSection: Point2[] = [
    { x: -30, y: 30 },
    { x: 150, y: 30 },
    { x: 150, y: 130 },
    { x: -30, y: 130 },
  ];

  it("recovers a 300×100 bed from two overlapping shots with a shared coin", () => {
    const left = frameFor({
      id: "left",
      sectionCm: leftSection,
      coinCenter: coin,
      camX: -60,
      camY: -80,
      camHeight: 150,
      pitchDeg: 35,
    });
    const right = frameFor({
      id: "right",
      sectionCm: rightSection,
      coinCenter: coin,
      camX: 60,
      camY: -90,
      camHeight: 155,
      pitchDeg: 32,
      linksTo: "left",
    });

    const res = scanYard([left, right], { cellSizeCm: 30 });
    expect(res.diagnostics.stitched).toBe(true);
    const dims = [res.diagnostics.widthCm, res.diagnostics.heightCm].sort(
      (a, b) => a - b,
    );
    expect(dims[0]).toBeGreaterThan(95);
    expect(dims[0]).toBeLessThan(105);
    expect(dims[1]).toBeGreaterThan(288);
    expect(dims[1]).toBeLessThan(312);
    expect(res.diagnostics.areaM2).toBeGreaterThan(2.8);
    expect(res.diagnostics.areaM2).toBeLessThan(3.2);
  });

  it("three-shot pan across a 450×120 bed stays within ~5%", () => {
    const coin3 = { x: 0, y: 70 };
    const mk = (x0: number, x1: number): Point2[] => [
      { x: x0, y: 40 },
      { x: x1, y: 40 },
      { x: x1, y: 160 },
      { x: x0, y: 160 },
    ];
    const frames = [
      frameFor({
        id: "a",
        sectionCm: mk(-225, -50),
        coinCenter: coin3,
        camX: -140,
        camY: -90,
        camHeight: 160,
        pitchDeg: 38,
      }),
      frameFor({
        id: "b",
        sectionCm: mk(-90, 90),
        coinCenter: coin3,
        camX: 0,
        camY: -100,
        camHeight: 165,
        pitchDeg: 36,
        linksTo: "a",
      }),
      frameFor({
        id: "c",
        sectionCm: mk(50, 225),
        coinCenter: coin3,
        camX: 140,
        camY: -85,
        camHeight: 158,
        pitchDeg: 37,
        linksTo: "b",
      }),
    ];
    const res = scanYard(frames, { cellSizeCm: 30 });
    const dims = [res.diagnostics.widthCm, res.diagnostics.heightCm].sort(
      (a, b) => a - b,
    );
    expect(Math.abs(dims[0]! - 120)).toBeLessThan(6);
    expect(Math.abs(dims[1]! - 450)).toBeLessThan(23);
  });

  it("falls back to pan hints when later frames lack the coin (approximate)", () => {
    const left = frameFor({
      id: "left",
      sectionCm: leftSection,
      coinCenter: coin,
      camX: -60,
      camY: -80,
      camHeight: 150,
      pitchDeg: 35,
    });
    const right = frameFor({
      id: "right",
      sectionCm: rightSection,
      coinCenter: coin,
      camX: 60,
      camY: -90,
      camHeight: 155,
      pitchDeg: 32,
      linksTo: "left",
      overlapFraction: 60 / 180, // true overlap of the two sections
      includeCoin: false,
    });

    const res = scanYard([left, right], { cellSizeCm: 30 });
    const dims = [res.diagnostics.widthCm, res.diagnostics.heightCm].sort(
      (a, b) => a - b,
    );
    // pan-hint stitching is approximate — accept ±15%
    expect(Math.abs(dims[0]! - 100)).toBeLessThan(15);
    expect(Math.abs(dims[1]! - 300)).toBeLessThan(45);
  });
});
