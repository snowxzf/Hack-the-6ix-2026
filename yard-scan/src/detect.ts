import type { Point2 } from "./types";

/**
 * Automatic bed/table corner detection from photo pixels.
 *
 * The user (or the UI) seeds a point on the bed; we flood-fill pixels of
 * similar color (chroma-based so shadows on the same surface stay included),
 * take the convex hull of the region, and fit the maximum-area quad to it.
 * Works for any roughly uniform surface: wood desk, soil bed, patio slab.
 *
 * Pass a downscaled image (~500 px wide) — full-res isn't needed and the
 * flood fill stays fast.
 */

export interface RgbaImage {
  widthPx: number;
  heightPx: number;
  /** RGBA bytes, row-major (canvas ImageData layout). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface DetectedQuad {
  /** 4 corners in boundary order (starts top-left-most, clockwise). */
  corners: Point2[];
  /** Fraction of the image the detected region covers (0..1). */
  areaFraction: number;
}

export function detectBedQuad(
  img: RgbaImage,
  seedPx?: Point2,
): DetectedQuad | null {
  const { widthPx: w, heightPx: h } = img;
  if (w < 20 || h < 20) return null;
  const sx = clamp(Math.round(seedPx?.x ?? w / 2), 3, w - 4);
  const sy = clamp(Math.round(seedPx?.y ?? h / 2), 3, h - 4);

  // Seed signature: median chroma + luma over a 7×7 patch
  const rg: number[] = [];
  const gb: number[] = [];
  const lum: number[] = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const i = ((sy + dy) * w + (sx + dx)) * 4;
      const r = img.data[i]!;
      const g = img.data[i + 1]!;
      const b = img.data[i + 2]!;
      rg.push(r - g);
      gb.push(g - b);
      lum.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  const sRg = median(rg);
  const sGb = median(gb);
  const sLum = median(lum);

  // Chroma tolerance is tight (surface identity); luma tolerance is loose
  // (shadows and highlights on the same surface).
  const CHROMA_TOL = 26;
  const LUM_TOL = 95;
  const match = (i: number): boolean => {
    const r = img.data[i]!;
    const g = img.data[i + 1]!;
    const b = img.data[i + 2]!;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    return (
      Math.abs(r - g - sRg) < CHROMA_TOL &&
      Math.abs(g - b - sGb) < CHROMA_TOL &&
      Math.abs(l - sLum) < LUM_TOL
    );
  };

  // Flood fill from the seed
  const seen = new Uint8Array(w * h);
  const seedI = sy * w + sx;
  if (!match(seedI * 4)) return null;
  const stack = [seedI];
  seen[seedI] = 1;
  const pts: Point2[] = [];
  while (stack.length) {
    const p = stack.pop()!;
    const px = p % w;
    const py = (p / w) | 0;
    pts.push({ x: px, y: py });
    if (px > 0) tryVisit(p - 1);
    if (px < w - 1) tryVisit(p + 1);
    if (py > 0) tryVisit(p - w);
    if (py < h - 1) tryVisit(p + w);
  }
  function tryVisit(nb: number) {
    if (!seen[nb] && match(nb * 4)) {
      seen[nb] = 1;
      stack.push(nb);
    }
  }

  const frac = pts.length / (w * h);
  // Too small = noise / wrong seed. Too big = the "surface" is the whole
  // image (uniform background) — no meaningful outline either way.
  if (frac < 0.04 || frac > 0.9) return null;

  let hull = convexHull(pts);
  if (hull.length < 4) return null;
  if (hull.length > 48) {
    const step = hull.length / 48;
    const sub: Point2[] = [];
    for (let i = 0; i < hull.length; i += step) sub.push(hull[Math.floor(i)]!);
    hull = sub;
  }

  // Maximum-area quad over hull points
  let best: Point2[] | null = null;
  let bestA = -1;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        for (let l = k + 1; l < n; l++) {
          const A =
            triArea(hull[i]!, hull[j]!, hull[k]!) +
            triArea(hull[i]!, hull[k]!, hull[l]!);
          if (A > bestA) {
            bestA = A;
            best = [hull[i]!, hull[j]!, hull[k]!, hull[l]!];
          }
        }
      }
    }
  }
  if (!best) return null;
  // The quad must actually explain the region (reject degenerate slivers)
  if (bestA < 0.5 * pts.length) return null;

  return { corners: orderCorners(best), areaFraction: frac };
}

/** Boundary order, starting at the top-left-most corner, clockwise. */
function orderCorners(quad: Point2[]): Point2[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...quad].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = sorted[i]!.x + sorted[i]!.y;
    if (s < bestScore) {
      bestScore = s;
      start = i;
    }
  }
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]!);
}

function convexHull(pts: Point2[]): Point2[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2[] = [];
  for (const p of s) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function triArea(a: Point2, b: Point2, c: Point2): number {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
