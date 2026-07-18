import { groundScaleFromAttitude, polygonImageToGroundCm } from "./attitude";
import { scaleFromReference } from "./coin";
import { convexHull, translatePolygon } from "./geometry";
import type { Point2, ScaleInfo, ScanFrame, WorldPolygon } from "./types";

export interface FrameWorld {
  frameId: string;
  polygonCm: Point2[];
}

/**
 * Project each frame's bed polygon into ground cm using coin scale + attitude.
 * When a frame has its own coin, that coin is the origin and that frame's
 * diameter sets the scale — so the same physical coin in two photos lands at
 * (0,0) in both, and the outlines already share a ground frame.
 */
export function projectFramesToGround(
  frames: ScanFrame[],
  scale: ScaleInfo,
  originPx: Point2,
  rollRad: number,
): FrameWorld[] {
  return frames.map((f) => {
    const ref = frameReference(f);
    let ground = scale.cmPerPxGround;
    let origin = ref?.centerPx ?? originPx;
    if (ref && ref.diameterPx > 0) {
      try {
        const { cmPerPx } = scaleFromReference(
          ref.diameterPx,
          ref.kind,
          ref.customDiameterCm,
        );
        ground = groundScaleFromAttitude(cmPerPx, f.attitude);
        origin = ref.centerPx;
      } catch {
        // fall back to session scale
      }
    }
    return {
      frameId: f.id,
      polygonCm: polygonImageToGroundCm(
        f.bedPolygonPx,
        origin,
        ground,
        f.attitude.rollRad ?? rollRad,
      ),
    };
  });
}

function frameReference(f: ScanFrame) {
  return f.reference ?? f.coin;
}

/**
 * Stitch multiple ground-plane polygons into one yard outline.
 *
 * Preferred paths (best → fallback):
 *  1. ARKit/ARCore `worldPositionM` on each frame
 *  2. Same physical coin marked in every frame → coin-centered merge (no offset)
 *  3. `stitch.direction` + `overlapFraction` pan hint
 */
export function stitchWorldPolygons(
  frames: ScanFrame[],
  projected: FrameWorld[],
): WorldPolygon {
  if (projected.length === 0) {
    return { pointsCm: [], sourceFrameIds: [] };
  }
  if (projected.length === 1) {
    return {
      pointsCm: projected[0]!.polygonCm,
      sourceFrameIds: [projected[0]!.frameId],
    };
  }

  if (frames.every((f) => f.attitude.worldPositionM)) {
    const byId = new Map(projected.map((p) => [p.frameId, p]));
    const origin = frames[0]!.attitude.worldPositionM!;
    const merged: Point2[] = [];
    for (const f of frames) {
      const poly = byId.get(f.id)?.polygonCm ?? [];
      const pos = f.attitude.worldPositionM!;
      const dxCm = (pos[0] - origin[0]) * 100;
      const dzCm = (pos[2] - origin[2]) * 100; // AR: Y up, XZ ground
      for (const p of poly) {
        merged.push({ x: p.x + dxCm, y: p.y + dzCm });
      }
    }
    return {
      pointsCm: convexHull(merged),
      sourceFrameIds: frames.map((f) => f.id),
    };
  }

  // Same coin in every frame → already a shared ground frame (origin = coin).
  if (frames.every((f) => frameReference(f))) {
    return {
      pointsCm: convexHull(projected.flatMap((p) => p.polygonCm)),
      sourceFrameIds: frames.map((f) => f.id),
    };
  }

  const byId = new Map(projected.map((p) => [p.frameId, p.polygonCm]));
  const placed = new Map<string, Point2[]>();
  const root = frames[0]!;
  placed.set(root.id, byId.get(root.id) ?? []);

  let progress = true;
  while (progress) {
    progress = false;
    for (const f of frames) {
      if (placed.has(f.id) || !f.stitch) continue;
      const prev = placed.get(f.stitch.linksTo);
      const local = byId.get(f.id);
      if (!prev || !local) continue;
      const offset = overlapOffsetCm(
        prev,
        local,
        f.stitch.direction,
        f.stitch.overlapFraction,
      );
      placed.set(f.id, translatePolygon(local, offset.x, offset.y));
      progress = true;
    }
  }

  for (const f of frames) {
    if (placed.has(f.id)) continue;
    const local = byId.get(f.id) ?? [];
    const all = [...placed.values()].flat();
    const maxX = all.reduce((m, p) => Math.max(m, p.x), 0);
    placed.set(f.id, translatePolygon(local, maxX + 20, 0));
  }

  return {
    pointsCm: convexHull([...placed.values()].flat()),
    sourceFrameIds: [...placed.keys()],
  };
}

function overlapOffsetCm(
  prev: Point2[],
  next: Point2[],
  direction: "right" | "left" | "up" | "down",
  overlapFraction: number,
): Point2 {
  const pb = aabb(prev);
  const nb = aabb(next);
  const frac = Math.min(Math.max(overlapFraction, 0.05), 0.6);

  switch (direction) {
    case "right":
      return {
        x: pb.maxX - nb.minX - nb.width * frac,
        y: (pb.minY + pb.maxY) / 2 - (nb.minY + nb.maxY) / 2,
      };
    case "left":
      return {
        x: pb.minX - nb.maxX + nb.width * frac,
        y: (pb.minY + pb.maxY) / 2 - (nb.minY + nb.maxY) / 2,
      };
    case "down":
      return {
        x: (pb.minX + pb.maxX) / 2 - (nb.minX + nb.maxX) / 2,
        y: pb.maxY - nb.minY - nb.height * frac,
      };
    case "up":
      return {
        x: (pb.minX + pb.maxX) / 2 - (nb.minX + nb.maxX) / 2,
        y: pb.minY - nb.maxY + nb.height * frac,
      };
  }
}

/**
 * Where the previous frame's coin should appear in the *next* photo after a
 * pan. Used as a UI ghost so the user can line the real coin up with the
 * outline (hackathon alignment aid — not computer-vision stitch).
 *
 * Pan right → coin that was on the right slides toward the left of the next frame.
 */
export function coinGhostForNextFrame(
  prevCoinCenter: Point2,
  prevDiameterPx: number,
  prevSize: { w: number; h: number },
  nextSize: { w: number; h: number },
  direction: "right" | "left" | "up" | "down",
  overlapFraction: number,
): { center: Point2; diameterPx: number } {
  const frac = Math.min(Math.max(overlapFraction, 0.05), 0.6);
  const sx = nextSize.w / Math.max(prevSize.w, 1);
  const sy = nextSize.h / Math.max(prevSize.h, 1);
  let x = prevCoinCenter.x * sx;
  let y = prevCoinCenter.y * sy;
  const shiftX = (1 - frac) * nextSize.w;
  const shiftY = (1 - frac) * nextSize.h;
  switch (direction) {
    case "right":
      x -= shiftX;
      break;
    case "left":
      x += shiftX;
      break;
    case "down":
      y -= shiftY;
      break;
    case "up":
      y += shiftY;
      break;
  }
  // Keep the ghost on-screen so it's usable as a guide
  const r = (prevDiameterPx * sx) / 2;
  x = Math.min(Math.max(x, r + 4), nextSize.w - r - 4);
  y = Math.min(Math.max(y, r + 4), nextSize.h - r - 4);
  return {
    center: { x, y },
    diameterPx: Math.max(8, prevDiameterPx * sx),
  };
}

function aabb(pts: Point2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
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
    width: maxX - minX,
    height: maxY - minY,
  };
}
