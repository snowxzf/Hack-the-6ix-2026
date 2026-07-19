import type { Point2 } from "./types";

/**
 * Snap reference-object edge taps to the actual image edge.
 *
 * A coin spans only ~25–40 px in a phone photo, so a 2 px tap miss is a
 * 5–10% scale error. Here we slide each tap a few pixels along the tap line
 * to the strongest luminance edge (sub-pixel, parabola-refined), which
 * removes most human tap error without any heavyweight computer vision.
 */

export interface LumaImage {
  widthPx: number;
  heightPx: number;
  /** Row-major grayscale, 0–255, length widthPx × heightPx. */
  luma: Float32Array;
}

/** Grayscale from RGBA bytes (canvas ImageData layout). */
export function lumaFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  widthPx: number,
  heightPx: number,
): LumaImage {
  const luma = new Float32Array(widthPx * heightPx);
  for (let i = 0; i < luma.length; i++) {
    const o = i * 4;
    luma[i] =
      0.299 * rgba[o]! + 0.587 * rgba[o + 1]! + 0.114 * rgba[o + 2]!;
  }
  return { widthPx, heightPx, luma };
}

function sample(img: LumaImage, x: number, y: number): number {
  const cx = Math.min(Math.max(x, 0), img.widthPx - 1.001);
  const cy = Math.min(Math.max(y, 0), img.heightPx - 1.001);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const i = y0 * img.widthPx + x0;
  const a = img.luma[i]!;
  const b = img.luma[i + 1]!;
  const c = img.luma[i + img.widthPx]!;
  const d = img.luma[i + img.widthPx + 1]!;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/**
 * |directional gradient| along `dir` at point p, averaged across a small
 * perpendicular window so single-pixel noise doesn't win.
 */
function edgeStrength(img: LumaImage, p: Point2, dir: Point2): number {
  const px = { x: -dir.y, y: dir.x };
  let g = 0;
  for (const o of [-1, 0, 1]) {
    const bx = p.x + px.x * o;
    const by = p.y + px.y * o;
    g +=
      sample(img, bx + dir.x, by + dir.y) - sample(img, bx - dir.x, by - dir.y);
  }
  return Math.abs(g / 3);
}

export interface RefineResult {
  a: Point2;
  b: Point2;
  /** True when at least one tap actually snapped to a clear edge. */
  refined: boolean;
}

/**
 * Refine two edge taps across a *coin* (any roughly circular reference).
 *
 * Far more robust than line-snapping on textured ground (wood grain, soil):
 * estimates coin/background contrast, casts rays from the tap midpoint to
 * find the boundary as a level-set crossing, re-centers from opposite ray
 * pairs (median), then measures the chord along the original tap direction.
 * Falls back to the original taps whenever the contrast or fit is unclear.
 */
export function refineCoinTaps(
  img: LumaImage,
  a: Point2,
  b: Point2,
): RefineResult {
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(span > 6)) return { a, b, refined: false };
  const dir = { x: (b.x - a.x) / span, y: (b.y - a.y) / span };
  let r0 = span / 2;
  let cx = (a.x + b.x) / 2;
  let cy = (a.y + b.y) / 2;

  // Coin vs background contrast around the taps
  const inner = ringSamples(img, cx, cy, 0, r0 * 0.55, 48);
  const outer = ringSamples(img, cx, cy, r0 * 1.35, r0 * 1.9, 64);
  const mIn = median(inner);
  const mOut = median(outer);
  if (Math.abs(mIn - mOut) < 12) return { a, b, refined: false };
  const thr = (mIn + mOut) / 2;
  const insideBelow = mIn < mOut;

  const K = 24;
  for (let iter = 0; iter < 3; iter++) {
    // Each opposite ray pair measures the center offset o along its
    // direction: with estimated center = true center + o, the boundary lies
    // at r − o·u along +u and r + o·u along −u, so o·u = (rm − rp) / 2.
    const pairs: { u: Point2; m: number }[] = [];
    const radii: number[] = [];
    let found = 0;
    for (let k = 0; k < K / 2; k++) {
      const th = (2 * Math.PI * k) / K + (iter * Math.PI) / K;
      const u = { x: Math.cos(th), y: Math.sin(th) };
      const rp = boundaryAlongRay(img, cx, cy, u, r0, thr, insideBelow);
      const rm = boundaryAlongRay(
        img,
        cx,
        cy,
        { x: -u.x, y: -u.y },
        r0,
        thr,
        insideBelow,
      );
      if (rp != null) {
        found++;
        radii.push(rp);
      }
      if (rm != null) {
        found++;
        radii.push(rm);
      }
      if (rp != null && rm != null) {
        pairs.push({ u, m: (rm - rp) / 2 });
      }
    }
    if (found < K / 2 || pairs.length < K / 6) return { a, b, refined: false };
    // Least squares (uniform directions → Σuuᵀ ≈ (n/2)·I), one outlier pass
    const solve = (ps: typeof pairs) => {
      let ox = 0;
      let oy = 0;
      for (const p of ps) {
        ox += p.u.x * p.m;
        oy += p.u.y * p.m;
      }
      return { x: (2 * ox) / ps.length, y: (2 * oy) / ps.length };
    };
    let o = solve(pairs);
    const res = pairs.map((p) => Math.abs(p.m - (o.x * p.u.x + o.y * p.u.y)));
    const medRes = median(res);
    const kept = pairs.filter((_, i) => res[i]! <= Math.max(3 * medRes, 0.5));
    if (kept.length >= K / 6) o = solve(kept);
    cx -= o.x;
    cy -= o.y;
    // Re-anchor the search radius on the measured boundary so trials that
    // started with different tap spans converge to the same circle — but
    // never drift far from the user's span (texture riders could run away).
    r0 = Math.min(Math.max(median(radii), (span / 2) * 0.7), (span / 2) * 1.3);
  }

  // Final chord: median over a small fan of rays so a single texture hit
  // (grain line, speck) at the boundary can't skew an endpoint.
  const fanBoundary = (sign: number): number | null => {
    const rs: number[] = [];
    for (const dth of [-0.13, 0, 0.13]) {
      const base = Math.atan2(dir.y * sign, dir.x * sign);
      const u = { x: Math.cos(base + dth), y: Math.sin(base + dth) };
      const r = boundaryAlongRay(img, cx, cy, u, r0, thr, insideBelow);
      if (r != null) rs.push(r);
    }
    // All three rays must see the boundary — a 2-sample median degenerates
    // to max/min and would let a single texture hit through.
    return rs.length === 3 ? median(rs) : null;
  };
  const rPlus = fanBoundary(+1);
  const rMinus = fanBoundary(-1);
  if (rPlus == null || rMinus == null) return { a, b, refined: false };
  const d = rPlus + rMinus;
  if (d < span * 0.6 || d > span * 1.5) return { a, b, refined: false };
  return {
    a: { x: cx - dir.x * rMinus, y: cy - dir.y * rMinus },
    b: { x: cx + dir.x * rPlus, y: cy + dir.y * rPlus },
    refined: true,
  };
}

/**
 * Find the coin from a SINGLE tap anywhere on (or near) it — no edge taps
 * needed. Runs the circle refiner over a ladder of radius hypotheses
 * (covering ~6–100 px diameters) and keeps the answer most hypotheses agree
 * on. Returns null when nothing coin-like surrounds the tap.
 */
export function detectCoinFromTap(
  img: LumaImage,
  tap: Point2,
): RefineResult | null {
  const results: { a: Point2; b: Point2; d: number }[] = [];
  for (const r0 of [5, 7, 10, 14, 19, 26, 34]) {
    const res = refineCoinTaps(
      img,
      { x: tap.x - r0, y: tap.y },
      { x: tap.x + r0, y: tap.y },
    );
    if (res.refined) {
      results.push({
        a: res.a,
        b: res.b,
        d: Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y),
      });
    }
  }
  if (!results.length) return null;
  // Consensus: the diameter cluster with the most agreeing hypotheses wins
  results.sort((x, y) => x.d - y.d);
  let best: typeof results = [];
  for (const r of results) {
    const group = results.filter((o) => Math.abs(o.d - r.d) <= r.d * 0.2);
    if (group.length > best.length) best = group;
  }
  const mid = best[Math.floor(best.length / 2)]!;
  return { a: mid.a, b: mid.b, refined: true };
}

/**
 * Walk a ray outward and return the sub-pixel radius where luma last leaves
 * the coin side of the threshold (i.e. the outermost inside→outside
 * transition that stays outside), or null if no clean boundary is found.
 */
function boundaryAlongRay(
  img: LumaImage,
  cx: number,
  cy: number,
  u: Point2,
  r0: number,
  thr: number,
  insideBelow: boolean,
): number | null {
  const step = 0.35;
  const tMin = r0 * 0.3;
  const tMax = r0 * 1.6;
  const inside = (v: number) => (insideBelow ? v < thr : v > thr);
  // Sample the whole ray outside → in
  const ts: number[] = [];
  const vals: number[] = [];
  for (let t = tMax; t >= tMin; t -= step) {
    ts.push(t);
    vals.push(sample(img, cx + u.x * t, cy + u.y * t));
  }
  // The boundary is where a sustained inside region starts (≥ RUN samples
  // ≈ 2.8 px) with a genuinely-outside window just beyond it — thin texture
  // features (wood grain lines, specks) fail one of the two conditions.
  const RUN = 8;
  const OUT_WIN = 9;
  for (let i = 3; i + RUN <= vals.length; i++) {
    if (!inside(vals[i]!)) continue;
    let sustained = true;
    for (let j = 1; j < RUN; j++) {
      if (!inside(vals[i + j]!)) {
        sustained = false;
        break;
      }
    }
    if (!sustained) continue;
    let outCount = 0;
    let tot = 0;
    for (let j = 1; j <= OUT_WIN && i - j >= 0; j++) {
      tot++;
      if (!inside(vals[i - j]!)) outCount++;
    }
    if (tot === 0 || outCount / tot < 0.5) continue;
    // sub-pixel: interpolate the threshold crossing toward the outside sample
    const vIn = vals[i]!;
    const vOut = vals[i - 1]!;
    const denom = vOut - vIn;
    const frac = Math.abs(denom) > 1e-6 ? (thr - vIn) / denom : 0;
    return ts[i]! + Math.min(Math.max(frac, 0), 1) * step;
  }
  return null;
}

function ringSamples(
  img: LumaImage,
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  n: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    const r = rInner + (rOuter - rInner) * ((i % 4) + 1) * 0.25;
    out.push(sample(img, cx + Math.cos(th) * r, cy + Math.sin(th) * r));
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * Refine two edge taps across a reference object (coin etc.).
 * Conservative: each tap moves at most ~20% of the tap span, and only when a
 * clearly dominant edge exists — otherwise the original tap is kept.
 */
export function refineReferenceTaps(
  img: LumaImage,
  a: Point2,
  b: Point2,
): RefineResult {
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(span > 4)) return { a, b, refined: false };
  const dir = { x: (b.x - a.x) / span, y: (b.y - a.y) / span };
  const radius = Math.min(Math.max(span * 0.2, 3), 15);

  // Bias each tap toward the *outermost* strong edge: coins have internal
  // contrast (bright rim, engraving) and the object boundary is always the
  // farthest edge from the center of the tap span.
  const ra = snapAlong(img, a, dir, radius, -1);
  const rb = snapAlong(img, b, dir, radius, +1);
  const newSpan = Math.hypot(rb.p.x - ra.p.x, rb.p.y - ra.p.y);
  // Reject snaps that blow up the span (grabbed something that isn't the coin)
  if (newSpan < span * 0.6 || newSpan > span * 1.5) {
    return { a, b, refined: false };
  }
  return { a: ra.p, b: rb.p, refined: ra.snapped || rb.snapped };
}

function snapAlong(
  img: LumaImage,
  p: Point2,
  dir: Point2,
  radius: number,
  /** +1 = prefer the farthest edge along +dir, −1 = along −dir. */
  outwardSign: number,
): { p: Point2; snapped: boolean } {
  const step = 0.5;
  const scores: number[] = [];
  const ts: number[] = [];
  for (let t = -radius; t <= radius + 1e-9; t += step) {
    ts.push(t);
    scores.push(
      edgeStrength(img, { x: p.x + dir.x * t, y: p.y + dir.y * t }, dir),
    );
  }
  let peakI = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]! > scores[peakI]!) peakI = i;
  }
  const sorted = [...scores].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const peak = scores[peakI]!;
  // Demand a real edge: strong in absolute terms and vs. local texture.
  if (peak < 6 || peak < median * 1.8) return { p, snapped: false };

  // Among local maxima nearly as strong as the peak, take the outermost —
  // that's the object boundary rather than interior detail (coin rim etc.).
  let best = peakI;
  for (let i = 1; i < scores.length - 1; i++) {
    const isMax =
      scores[i]! >= scores[i - 1]! &&
      scores[i]! >= scores[i + 1]! &&
      scores[i]! >= peak * 0.6 &&
      scores[i]! >= 6;
    if (isMax && ts[i]! * outwardSign > ts[best]! * outwardSign) best = i;
  }

  // Sub-pixel: parabola through the peak and neighbors
  let t = ts[best]!;
  if (best > 0 && best < scores.length - 1) {
    const s0 = scores[best - 1]!;
    const s1 = scores[best]!;
    const s2 = scores[best + 1]!;
    const denom = s0 - 2 * s1 + s2;
    if (Math.abs(denom) > 1e-9) {
      const dt = (0.5 * (s0 - s2)) / denom;
      if (Math.abs(dt) <= 1) t += dt * step;
    }
  }
  return {
    p: { x: p.x + dir.x * t, y: p.y + dir.y * t },
    snapped: true,
  };
}
