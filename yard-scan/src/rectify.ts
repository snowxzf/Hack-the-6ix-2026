import type { Point2 } from "./types";

export interface RectifiedMeasure {
  /** Ground-plane bed corners in cm (origin near coin). */
  bedCm: Point2[];
  widthCm: number;
  heightCm: number;
  /** Aspect ratio width/height in the metric plane before cm scale. */
  aspect: number;
  /** Estimated focal length in pixels (principal point = image center). */
  focalPx: number;
}

type H = { x: number; y: number; z: number };

/**
 * Measure a rectangular bed from a perspective photo using vanishing-point
 * metric rectification + any known-size reference (coin diameter, custom object).
 *
 * Works for any photo of a planar rectangle — not tuned to a specific image.
 * Bed taps must be 4 corners in boundary order.
 */
export function measureRectBedWithReference(
  bedPolygonPx: Point2[],
  referenceEdgeA: Point2,
  referenceEdgeB: Point2,
  referenceDiameterCm: number,
  imageWidthPx: number,
  imageHeightPx: number,
): RectifiedMeasure | null {
  if (bedPolygonPx.length !== 4 || referenceDiameterCm <= 0) return null;

  const [p0, p1, p2, p3] = bedPolygonPx as [Point2, Point2, Point2, Point2];
  const cx = imageWidthPx / 2;
  const cy = imageHeightPx / 2;

  const vx = lineIntersect(line(p0, p1), line(p3, p2));
  const vy = lineIntersect(line(p1, p2), line(p0, p3));
  if (!vx || !vy) return null;

  // When one pair of sides is nearly parallel, a vanishing point goes to
  // infinity and f² is undefined — fall back to a typical phone HFOV.
  const f2 = focalLengthSqFromOrthogonalVanishing(vx, vy, cx, cy);
  const fFallback = imageWidthPx / 2 / Math.tan(((65 * Math.PI) / 180) / 2);
  const f =
    Number.isFinite(f2) && f2 > 100 && f2 < 1e10 ? Math.sqrt(f2) : fFallback;

  const unitSq: Point2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const Hsq = homographyDlt(unitSq, bedPolygonPx);
  if (!Hsq) return null;

  // H columns: h1, h2, h3
  const h1 = { x: Hsq[0]!, y: Hsq[3]!, z: Hsq[6]! };
  const h2 = { x: Hsq[1]!, y: Hsq[4]!, z: Hsq[7]! };
  const r1 = applyKInv(h1, f, cx, cy);
  const r2 = applyKInv(h2, f, cx, cy);
  const n1 = Math.hypot(r1.x, r1.y, r1.z);
  const n2 = Math.hypot(r2.x, r2.y, r2.z);
  if (n1 < 1e-12 || n2 < 1e-12) return null;
  const aspect = n1 / n2;

  const worldRect: Point2[] = [
    { x: 0, y: 0 },
    { x: aspect, y: 0 },
    { x: aspect, y: 1 },
    { x: 0, y: 1 },
  ];
  const H = homographyDlt(worldRect, bedPolygonPx);
  if (!H) return null;
  const Hinv = invert3(H);
  if (!Hinv) return null;

  const coinA = applyH(Hinv, referenceEdgeA);
  const coinB = applyH(Hinv, referenceEdgeB);
  if (!coinA || !coinB) return null;
  const coinUnits = Math.hypot(coinB.x - coinA.x, coinB.y - coinA.y);
  if (coinUnits < 1e-12) return null;
  const cmPerUnit = referenceDiameterCm / coinUnits;

  const origin = {
    x: ((coinA.x + coinB.x) / 2) * cmPerUnit,
    y: ((coinA.y + coinB.y) / 2) * cmPerUnit,
  };
  const bedCm = worldRect.map((p) => ({
    x: p.x * cmPerUnit - origin.x,
    y: p.y * cmPerUnit - origin.y,
  }));

  return {
    bedCm,
    widthCm: aspect * cmPerUnit,
    heightCm: cmPerUnit,
    aspect,
    focalPx: f,
  };
}

function line(a: Point2, b: Point2): H {
  return cross({ x: a.x, y: a.y, z: 1 }, { x: b.x, y: b.y, z: 1 });
}

function lineIntersect(l1: H, l2: H): H | null {
  const p = cross(l1, l2);
  if (Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z) < 1e-18) return null;
  return p;
}

function cross(a: H, b: H): H {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function focalLengthSqFromOrthogonalVanishing(
  vx: H,
  vy: H,
  cx: number,
  cy: number,
): number {
  const { x: X1, y: Y1, z: Z1 } = vx;
  const { x: X2, y: Y2, z: Z2 } = vy;
  const den = Z1 * Z2;
  if (Math.abs(den) < 1e-18) return NaN;
  return (
    (-(X1 * X2 + Y1 * Y2) +
      cx * (X1 * Z2 + X2 * Z1) +
      cy * (Y1 * Z2 + Y2 * Z1) -
      (cx * cx + cy * cy) * den) /
    den
  );
}

function applyKInv(h: H, f: number, cx: number, cy: number): H {
  return {
    x: (h.x - cx * h.z) / f,
    y: (h.y - cy * h.z) / f,
    z: h.z,
  };
}

/** DLT with h₈ = 1 → 8×8 linear solve. */
function homographyDlt(src: Point2[], dst: Point2[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    // u = (h0 x + h1 y + h2) / (h6 x + h7 y + h8)
    // with h8=1: u(h6 x + h7 y + 1) = h0 x + h1 y + h2
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h8 = solve8(A, b);
  if (!h8) return null;
  return [...h8, 1];
}

function solve8(A: number[][], b: number[]): number[] | null {
  // Gaussian elimination with partial pivoting
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    }
    if (Math.abs(M[piv]![col]!) < 1e-12) return null;
    if (piv !== col) {
      const tmp = M[col]!;
      M[col] = M[piv]!;
      M[piv] = tmp;
    }
    const div = M[col]![col]!;
    for (let c = col; c <= n; c++) M[col]![c]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

function applyH(H: number[], p: Point2): Point2 | null {
  const x = H[0]! * p.x + H[1]! * p.y + H[2]!;
  const y = H[3]! * p.x + H[4]! * p.y + H[5]!;
  const z = H[6]! * p.x + H[7]! * p.y + H[8]!;
  if (Math.abs(z) < 1e-12) return null;
  return { x: x / z, y: y / z };
}

function invert3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const D = c * h - b * i;
  const E = a * i - c * g;
  const F = b * g - a * h;
  const G = b * f - c * e;
  const Hh = c * d - a * f;
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  const inv = 1 / det;
  // adjugate transpose layout
  return [
    A * inv,
    D * inv,
    G * inv,
    B * inv,
    E * inv,
    Hh * inv,
    C * inv,
    F * inv,
    I * inv,
  ];
}
