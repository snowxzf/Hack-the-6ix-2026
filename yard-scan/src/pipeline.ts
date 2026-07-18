import { attitudeWarnings, groundScaleFromAttitude } from "./attitude";
import { scaleFromReference } from "./coin";
import { boundsOf, polygonAreaCm2 } from "./geometry";
import { worldPolygonToGardenGrid } from "./grid";
import { projectFramesToGround, stitchWorldPolygons } from "./stitch";
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

  const projected = projectFramesToGround(
    frames,
    scale,
    ref.centerPx,
    refFrame.attitude.rollRad ?? 0,
  );

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
