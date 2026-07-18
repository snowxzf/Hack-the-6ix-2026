import type { Point2 } from "./types";

/** Axis-aligned bounding box in cm. */
export function boundsOf(points: Point2[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthCm: number;
  heightCm: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    widthCm: maxX - minX,
    heightCm: maxY - minY,
  };
}

/** Shoelace formula — area in cm² (absolute). */
export function polygonAreaCm2(points: Point2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function translatePolygon(points: Point2[], dx: number, dy: number): Point2[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Point-in-polygon (ray cast). */
export function pointInPolygon(p: Point2, poly: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Merge polygons by taking the convex hull of all vertices (simple stitch union). */
export function convexHull(points: Point2[]): Point2[] {
  const pts = uniquePoints(points);
  if (pts.length <= 2) return pts;

  pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function uniquePoints(points: Point2[]): Point2[] {
  const seen = new Set<string>();
  const out: Point2[] = [];
  for (const p of points) {
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
