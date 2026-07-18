import { describe, expect, it } from "vitest";
import { COIN_DIAMETER_CM } from "../src/coin";
import { measureRectBedWithReference } from "../src/rectify";
import type { Point2 } from "../src/types";

/** Project ground (X,Y) on z=0 through a pitched pinhole to image pixels. */
function projectGroundToImage(
  g: Point2,
  opts: {
    pitch: number;
    f: number;
    cx: number;
    cy: number;
    camHeight: number;
  },
): Point2 {
  const { pitch, f, cx, cy, camHeight } = opts;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const toCam = { x: g.x, y: g.y, z: -camHeight };
  const y1 = toCam.y * c + toCam.z * s;
  const z1 = -toCam.y * s + toCam.z * c;
  const cam = { x: toCam.x, y: -y1, z: -z1 };
  if (cam.z <= 1e-6) throw new Error("behind camera");
  return {
    x: cx + (f * cam.x) / cam.z,
    y: cy + (f * cam.y) / cam.z,
  };
}

function measureSynthetic(opts: {
  widthCm: number;
  heightCm: number;
  coinDiameterCm: number;
  pitchDeg: number;
  camHeightCm?: number;
}) {
  const widthPx = 2160;
  const heightPx = 2880;
  const f = 1600;
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  const pitch = (opts.pitchDeg * Math.PI) / 180;
  const camHeight = opts.camHeightCm ?? 120;
  const proj = (g: Point2) =>
    projectGroundToImage(g, { pitch, f, cx, cy, camHeight });

  const hw = opts.widthCm / 2;
  const bedGround: Point2[] = [
    { x: -hw, y: 20 },
    { x: hw, y: 20 },
    { x: hw, y: 20 + opts.heightCm },
    { x: -hw, y: 20 + opts.heightCm },
  ];
  const coinR = opts.coinDiameterCm / 2;
  const edgeA = { x: -coinR, y: 40 };
  const edgeB = { x: coinR, y: 40 };

  return measureRectBedWithReference(
    bedGround.map(proj),
    proj(edgeA),
    proj(edgeB),
    opts.coinDiameterCm,
    widthPx,
    heightPx,
  );
}

describe("measureRectBedWithReference", () => {
  it("recovers a 60×150 cm rectangle with a CAD quarter", () => {
    const m = measureSynthetic({
      widthCm: 60,
      heightCm: 150,
      coinDiameterCm: COIN_DIAMETER_CM.cad_quarter,
      pitchDeg: 40,
    });
    expect(m).not.toBeNull();
    const dims = [m!.widthCm, m!.heightCm].sort((a, b) => a - b);
    expect(dims[0]).toBeGreaterThan(55);
    expect(dims[0]).toBeLessThan(65);
    expect(dims[1]).toBeGreaterThan(140);
    expect(dims[1]).toBeLessThan(160);
  });

  it("recovers a 90×200 cm bed with a USD quarter at a different tilt", () => {
    const m = measureSynthetic({
      widthCm: 90,
      heightCm: 200,
      coinDiameterCm: COIN_DIAMETER_CM.usd_quarter,
      pitchDeg: 28,
      camHeightCm: 160,
    });
    expect(m).not.toBeNull();
    const dims = [m!.widthCm, m!.heightCm].sort((a, b) => a - b);
    expect(dims[0]).toBeGreaterThan(82);
    expect(dims[0]).toBeLessThan(98);
    expect(dims[1]).toBeGreaterThan(185);
    expect(dims[1]).toBeLessThan(215);
  });

  it("recovers a square 120×120 cm plot with a CAD nickel", () => {
    const m = measureSynthetic({
      widthCm: 120,
      heightCm: 120,
      coinDiameterCm: COIN_DIAMETER_CM.cad_nickel,
      pitchDeg: 35,
    });
    expect(m).not.toBeNull();
    expect(m!.widthCm).toBeGreaterThan(110);
    expect(m!.widthCm).toBeLessThan(130);
    expect(m!.heightCm).toBeGreaterThan(110);
    expect(m!.heightCm).toBeLessThan(130);
  });
});
