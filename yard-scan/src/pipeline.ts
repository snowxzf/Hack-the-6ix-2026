import { attitudeWarnings, groundScaleFromAttitude } from "./attitude";
import { referenceDiameterCm, scaleFromReference } from "./coin";
import { boundsOf, polygonAreaCm2 } from "./geometry";
import { worldPolygonToGardenGrid } from "./grid";
import { measureRectBedWithReference } from "./rectify";
import {
  projectFramesToGround,
  stitchWorldPolygons,
  type FrameWorld,
} from "./stitch";
import type {
  ScaleReference,
  ScanFrame,
  ScanOptions,
  ScaleInfo,
  YardScanResult,
} from "./types";

function frameReference(f: ScanFrame): ScaleReference | undefined {
  return f.reference ?? f.coin;
}

/**
 * Project one frame to ground cm via full perspective rectification, treating
 * its 4-corner outline as a rectangle on the ground (a garden bed, or the
 * visible rectangular section of one in a multi-photo pan). The reference
 * (coin) lands at the origin, and the outline's first tapped edge maps to +x —
 * so frames tapped in a consistent order share a ground frame automatically.
 * Returns null when the frame can't be rectified (≠4 corners, no reference).
 */
function rectifyFrameToGround(f: ScanFrame): FrameWorld | null {
  const ref = frameReference(f);
  if (!ref || f.bedPolygonPx.length !== 4 || ref.diameterPx <= 0) return null;
  const a =
    ref.edgeAPx ?? {
      x: ref.centerPx.x - ref.diameterPx / 2,
      y: ref.centerPx.y,
    };
  const b =
    ref.edgeBPx ?? {
      x: ref.centerPx.x + ref.diameterPx / 2,
      y: ref.centerPx.y,
    };
  let dCm: number;
  try {
    dCm = referenceDiameterCm(ref.kind, ref.customDiameterCm);
  } catch {
    return null;
  }
  const m = measureRectBedWithReference(
    f.bedPolygonPx,
    a,
    b,
    dCm,
    f.widthPx,
    f.heightPx,
    f.focalPx,
  );
  if (!m || m.widthCm <= 1 || m.heightCm <= 1) return null;
  return { frameId: f.id, polygonCm: m.bedCm };
}

/**
 * Full yard-scan pipeline:
 *  1. Find a scale reference (coin recommended, or any known-size object)
 *  2. Apply device pitch/roll → ground-plane scale
 *  3. Project bed polygons to cm
 *  4. Stitch multiple frames if needed
 *  5. Rasterize to GardenGrid for the optimizer
 */
export function scanYard(
  frames: ScanFrame[],
  options: ScanOptions = {},
): YardScanResult {
  const cellSizeCm = options.cellSizeCm ?? 30;
  const minConf =
    options.minReferenceConfidence ?? options.minCoinConfidence ?? 0.4;
  const warnings: string[] = [];

  if (!frames.length) {
    throw new Error("scanYard requires at least one frame");
  }
  for (const f of frames) {
    if (f.bedPolygonPx.length < 3) {
      throw new Error(`frame ${f.id}: bedPolygonPx needs ≥ 3 points`);
    }
    warnings.push(...attitudeWarnings(f.attitude));
  }

  const refFrame = frames.find((f) => {
    const r = frameReference(f);
    return r && r.confidence >= minConf;
  });
  const ref = refFrame ? frameReference(refFrame) : undefined;
  if (!refFrame || !ref) {
    throw new Error(
      "Mark a scale reference in at least one frame — a coin (recommended) or any object with a known size.",
    );
  }

  const { cmPerPx, referenceDiameterCm } = scaleFromReference(
    ref.diameterPx,
    ref.kind,
    ref.customDiameterCm,
  );

  const ground = groundScaleFromAttitude(cmPerPx, refFrame.attitude);
  const scale: ScaleInfo = {
    cmPerPx,
    reference: ref.kind,
    referenceMode: ref.mode,
    referenceLabel: ref.label,
    referenceDiameterCm,
    cmPerPxGround: ground,
  };

  if (ref.confidence < 0.7) {
    warnings.push("Reference confidence is moderate — double-check the size you entered.");
  }
  if (ref.mode === "custom_object") {
    warnings.push(
      "Custom object scale depends on the size you typed — measure carefully.",
    );
  }

  // Prefer full perspective rectification per frame (accurate); fall back to
  // the attitude/foreshortening approximation for frames it can't handle.
  const attitudeProjected = projectFramesToGround(
    frames,
    scale,
    ref.centerPx,
    refFrame.attitude.rollRad ?? 0,
  );
  const byId = new Map(attitudeProjected.map((p) => [p.frameId, p]));
  let rectifiedCount = 0;
  const projected = frames.map((f) => {
    const rect = rectifyFrameToGround(f);
    if (rect) {
      rectifiedCount++;
      return rect;
    }
    return byId.get(f.id)!;
  });
  if (rectifiedCount < frames.length) {
    warnings.push(
      frames.length === 1
        ? "Couldn't perspective-correct this photo — outline the bed with exactly 4 corners for best accuracy."
        : `Perspective-corrected ${rectifiedCount}/${frames.length} photos — outline a 4-corner section and mark the coin in every photo for best accuracy.`,
    );
  }

  const worldBed = stitchWorldPolygons(frames, projected);
  const b = boundsOf(worldBed.pointsCm);
  const areaCm2 = polygonAreaCm2(worldBed.pointsCm);
  const garden = worldPolygonToGardenGrid(worldBed, cellSizeCm);

  if (garden.cells.length === 0) {
    warnings.push("No grid cells landed inside the bed — check the outline taps.");
  }

  return {
    garden,
    worldBed,
    diagnostics: {
      scale,
      frameCount: frames.length,
      stitched: frames.length > 1,
      widthCm: round1(b.widthCm),
      heightCm: round1(b.heightCm),
      areaM2: round2(areaCm2 / 10_000),
      warnings: unique(warnings),
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}
