import { describe, expect, it } from "vitest";
import { detectBedQuad, type RgbaImage } from "../src/detect";
import type { Point2 } from "../src/types";

/** Synthetic photo: warm "wood" quad on a gray "carpet" background. */
function quadImage(opts: {
  w: number;
  h: number;
  corners: Point2[]; // boundary order
  withShadow?: boolean;
}): RgbaImage {
  const { w, h, corners } = opts;
  const data = new Uint8ClampedArray(w * h * 4);
  const inside = (x: number, y: number): boolean => {
    let cnt = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      if (a.y <= y !== b.y <= y) {
        const t = (y - a.y) / (b.y - a.y);
        if (x < a.x + t * (b.x - a.x)) cnt++;
      }
    }
    return cnt % 2 === 1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const noise = ((x * 13 + y * 7) % 9) - 4;
      if (inside(x, y)) {
        // warm wood; optional dark shadow band across the middle
        const shade =
          opts.withShadow && y > h * 0.4 && y < h * 0.55 ? -70 : 0;
        data[i] = 205 + noise + shade;
        data[i + 1] = 165 + noise + shade;
        data[i + 2] = 125 + noise + shade;
      } else {
        data[i] = 150 + noise;
        data[i + 1] = 150 + noise;
        data[i + 2] = 148 + noise;
      }
      data[i + 3] = 255;
    }
  }
  return { widthPx: w, heightPx: h, data };
}

function maxCornerError(found: Point2[], truth: Point2[]): number {
  // order-insensitive: match each truth corner to its nearest found corner
  return Math.max(
    ...truth.map((t) =>
      Math.min(...found.map((f) => Math.hypot(f.x - t.x, f.y - t.y))),
    ),
  );
}

describe("detectBedQuad", () => {
  const corners: Point2[] = [
    { x: 60, y: 40 },
    { x: 250, y: 70 },
    { x: 280, y: 300 },
    { x: 40, y: 260 },
  ];

  it("finds a perspective wood quad on carpet within a few px", () => {
    const img = quadImage({ w: 320, h: 360, corners });
    const res = detectBedQuad(img, { x: 150, y: 160 });
    expect(res).not.toBeNull();
    expect(maxCornerError(res!.corners, corners)).toBeLessThan(6);
  });

  it("survives a shadow band across the surface", () => {
    const img = quadImage({ w: 320, h: 360, corners, withShadow: true });
    const res = detectBedQuad(img, { x: 150, y: 120 });
    expect(res).not.toBeNull();
    expect(maxCornerError(res!.corners, corners)).toBeLessThan(8);
  });

  it("defaults the seed to the image center", () => {
    const img = quadImage({ w: 320, h: 360, corners });
    const res = detectBedQuad(img);
    expect(res).not.toBeNull();
    expect(maxCornerError(res!.corners, corners)).toBeLessThan(6);
  });

  it("returns corners in boundary order starting top-left", () => {
    const img = quadImage({ w: 320, h: 360, corners });
    const res = detectBedQuad(img, { x: 150, y: 160 })!;
    const c = res.corners;
    // top-left-most first
    const sums = c.map((p) => p.x + p.y);
    expect(sums[0]).toBe(Math.min(...sums));
    // consecutive corners are adjacent (no diagonal jumps): every edge is
    // shorter than either diagonal
    const d = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);
    const diag = Math.max(d(c[0]!, c[2]!), d(c[1]!, c[3]!));
    for (let i = 0; i < 4; i++) {
      expect(d(c[i]!, c[(i + 1) % 4]!)).toBeLessThan(diag);
    }
  });

  it("refuses a uniform image (region = everything)", () => {
    const w = 200;
    const h = 200;
    const data = new Uint8ClampedArray(w * h * 4).fill(180);
    expect(detectBedQuad({ widthPx: w, heightPx: h, data })).toBeNull();
  });

  it("refuses when the seed lands on a tiny speck", () => {
    const img = quadImage({ w: 320, h: 360, corners });
    // paint a small blue dot far from the quad and seed it
    for (let y = 330; y < 338; y++) {
      for (let x = 8; x < 16; x++) {
        const i = (y * 320 + x) * 4;
        img.data[i] = 30;
        img.data[i + 1] = 60;
        img.data[i + 2] = 200;
      }
    }
    expect(detectBedQuad(img, { x: 12, y: 334 })).toBeNull();
  });
});
