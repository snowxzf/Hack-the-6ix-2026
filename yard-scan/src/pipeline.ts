import { attitudeWarnings, groundScaleFromAttitude } from "./attitude";
import { scaleFromCoin } from "./coin";
import { boundsOf, polygonAreaCm2 } from "./geometry";
import { worldPolygonToGardenGrid } from "./grid";
import { projectFramesToGround, stitchWorldPolygons } from "./stitch";
import type {
  ScanFrame,
  ScanOptions,
  ScaleInfo,
  YardScanResult,
} from "./types";

/**
 * Full yard-scan pipeline:
 *  1. Find a coin reference across frames → cm/px scale
 *  2. Apply device pitch/roll → ground-plane scale
 *  3. Project bed polygons to cm
 *  4. Stitch multiple frames if needed (AR pose or pan hints)
 *  5. Rasterize to GardenGrid for the optimizer
 *
 * The mobile app supplies: camera image → (CV) coin + bed outline,
 * plus CoreMotion/ARKit attitude on each shutter press.
 */
export function scanYard(
  frames: ScanFrame[],
  options: ScanOptions = {},
): YardScanResult {
  const cellSizeCm = options.cellSizeCm ?? 30;
  const minConf = options.minCoinConfidence ?? 0.4;
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

  const coinFrame = frames.find(
    (f) => f.coin && f.coin.confidence >= minConf,
  );
  if (!coinFrame?.coin) {
    throw new Error(
      "Place a coin in at least one frame (or lower minCoinConfidence).",
    );
  }

  const { cmPerPx, referenceDiameterCm } = scaleFromCoin(
    coinFrame.coin.diameterPx,
    coinFrame.coin.kind,
    coinFrame.coin.customDiameterCm,
  );

  const ground = groundScaleFromAttitude(cmPerPx, coinFrame.attitude);
  const scale: ScaleInfo = {
    cmPerPx,
    reference: coinFrame.coin.kind,
    referenceDiameterCm,
    cmPerPxGround: ground,
  };

  if (coinFrame.coin.confidence < 0.7) {
    warnings.push("Coin detection confidence is moderate — double-check scale.");
  }

  const projected = projectFramesToGround(
    frames,
    scale,
    coinFrame.coin.centerPx,
    coinFrame.attitude.rollRad ?? 0,
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
