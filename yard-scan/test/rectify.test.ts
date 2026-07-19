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
  /** Rotation of the bed on the ground (0 = square to the frame). */
  yawDeg?: number;
  /** True camera focal in px (defaults to a 26mm-equiv phone lens). */
  focalPx?: number;
  /** Pass the true focal on to the measurement (the EXIF path). */
  tellFocal?: boolean;
}) {
  const widthPx = 2160;
  const heightPx = 2880;
  // 26 mm-equivalent phone main camera: f ≈ 26/36 × long side
  const f = opts.focalPx ?? (26 / 36) * heightPx;
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  const pitch = (opts.pitchDeg * Math.PI) / 180;
  const camHeight = opts.camHeightCm ?? 120;
  const yaw = ((opts.yawDeg ?? 0) * Math.PI) / 180;
  const cyaw = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const rot = (p: Point2): Point2 => ({
    x: p.x * cyaw - p.y * syaw,
    y: 20 + p.x * syaw + p.y * cyaw,
  });
  const proj = (g: Point2) =>
    projectGroundToImage(rot(g), { pitch, f, cx, cy, camHeight });

  const hw = opts.widthCm / 2;
  const bedGround: Point2[] = [
    { x: -hw, y: 0 },
    { x: hw, y: 0 },
    { x: hw, y: opts.heightCm },
    { x: -hw, y: opts.heightCm },
  ];
  const coinR = opts.coinDiameterCm / 2;
  const edgeA = { x: -coinR, y: 20 };
  const edgeB = { x: coinR, y: 20 };

  return measureRectBedWithReference(
    bedGround.map(proj),
    proj(edgeA),
    proj(edgeB),
    opts.coinDiameterCm,
    widthPx,
    heightPx,
    opts.tellFocal ? f : undefined,
  );
}

function expectDims(
  m: ReturnType<typeof measureSynthetic>,
  short: number,
  long: number,
  tolFrac: number,
) {
  expect(m).not.toBeNull();
  const dims = [m!.widthCm, m!.heightCm].sort((a, b) => a - b);
  expect(dims[0]).toBeGreaterThan(short * (1 - tolFrac));
  expect(dims[0]).toBeLessThan(short * (1 + tolFrac));
  expect(dims[1]).toBeGreaterThan(long * (1 - tolFrac));
  expect(dims[1]).toBeLessThan(long * (1 + tolFrac));
}

describe("measureRectBedWithReference", () => {
  it("recovers a rotated 60×150 cm bed via vanishing points (no focal hint)", () => {
    const m = measureSynthetic({
      widthCm: 150,
      heightCm: 60,
      coinDiameterCm: COIN_DIAMETER_CM.cad_quarter,
      pitchDeg: 40,
      yawDeg: 25,
    });
    expectDims(m, 60, 150, 0.03);
  });

  it("recovers a rotated 90×200 cm bed with a USD quarter at a different tilt", () => {
    const m = measureSynthetic({
      widthCm: 90,
      heightCm: 200,
      coinDiameterCm: COIN_DIAMETER_CM.usd_quarter,
      pitchDeg: 28,
      yawDeg: 35,
      camHeightCm: 160,
    });
    expectDims(m, 90, 200, 0.03);
  });

  it("bed square to the frame + known focal (EXIF path) is near-exact", () => {
    const m = measureSynthetic({
      widthCm: 120,
      heightCm: 120,
      coinDiameterCm: COIN_DIAMETER_CM.cad_nickel,
      pitchDeg: 35,
      yawDeg: 0,
      tellFocal: true,
    });
    expectDims(m, 120, 120, 0.02);
  });

  it("bed square to the frame, no EXIF: phone-lens fallback stays within ~10%", () => {
    // Degenerate vanishing points (both side pairs parallel in the image) —
    // the focal falls back to the typical-phone heuristic.
    const m = measureSynthetic({
      widthCm: 60,
      heightCm: 150,
      coinDiameterCm: COIN_DIAMETER_CM.cad_quarter,
      pitchDeg: 30,
      yawDeg: 0,
    });
    expectDims(m, 60, 150, 0.1);
  });

  it("known focal overrides a noisy/implausible vanishing-point estimate", () => {
    // An unusual lens (tele, f well above the plausibility band) — with the
    // true focal passed in, the result stays accurate anyway.
    const m = measureSynthetic({
      widthCm: 80,
      heightCm: 160,
      coinDiameterCm: COIN_DIAMETER_CM.usd_quarter,
      pitchDeg: 30,
      yawDeg: 15,
      focalPx: 4600, // ~57mm equiv — outside the no-hint plausibility band
      camHeightCm: 300,
      tellFocal: true,
    });
    expectDims(m, 80, 160, 0.03);
  });

  it("rejects degenerate input", () => {
    expect(
      measureRectBedWithReference(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        2.4,
        1000,
        1000,
      ),
    ).toBeNull();
  });
});
