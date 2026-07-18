/**
 * ─────────────────────────────────────────────────────────────
 *  JESSICA INTEGRATION POINTS: every fake / live bridge lives here.
 * ─────────────────────────────────────────────────────────────
 */
import { MOCK_CATALOG, SUBURBAN } from "../../optimizer/src/index";
import type { GardenGrid, Species } from "../../optimizer/src/index";
import {
  scanYard,
  referenceFromEdgeTaps,
  estimatePitchFromRectangle,
  measureRectBedWithReference,
  scaleFromReference,
  worldPolygonToGardenGrid,
  boundsOf,
  polygonAreaCm2,
  type Point2,
  type ReferenceKind,
  type ScaleReferenceMode,
  type ScanFrame,
  type YardScanResult,
} from "../../yard-scan/src/index";

/** Fallback demo yard when the user skips measuring. */
export function scanPhotoToGarden(_photoUrl: string | null): GardenGrid {
  return structuredClone(SUBURBAN);
}

export interface MeasureYardInput {
  imageWidthPx: number;
  imageHeightPx: number;
  /** Two taps across the reference object (coin or custom). */
  referenceEdgeA: Point2;
  referenceEdgeB: Point2;
  /** Bed corner taps (≥ 3). */
  bedCorners: Point2[];
  mode: ScaleReferenceMode;
  coinKind?: Exclude<ReferenceKind, "custom">;
  customSizeCm?: number;
  customLabel?: string;
  /** Pitch from nadir; 0 = overhead. Web demo defaults to a mild tilt. */
  pitchFromNadirRad?: number;
}

/** Live yard-scan: coin or any known-size object → GardenGrid. */
export function measureYardFromTaps(input: MeasureYardInput): YardScanResult {
  const mode = input.mode;

  if (mode === "coin" && !input.coinKind) {
    throw new Error("Choose which coin you used.");
  }
  if (mode === "custom_object" && !(input.customSizeCm && input.customSizeCm > 0)) {
    throw new Error("Enter how wide your reference object is (cm).");
  }

  const kind: ReferenceKind =
    mode === "coin" ? input.coinKind! : "custom";

  const reference = referenceFromEdgeTaps(input.referenceEdgeA, input.referenceEdgeB, {
    mode,
    kind,
    customDiameterCm: mode === "custom_object" ? input.customSizeCm : undefined,
    label: mode === "custom_object" ? input.customLabel || "custom object" : undefined,
  });

  const customCm = mode === "custom_object" ? input.customSizeCm : undefined;
  const { cmPerPx, referenceDiameterCm: dCm } = scaleFromReference(
    reference.diameterPx,
    kind,
    customCm,
  );

  // 4 corners of a real rectangle (desk / raised bed / patio): undo
  // perspective with vanishing-point metric rectification + reference scale.
  if (input.bedCorners.length === 4 && input.pitchFromNadirRad == null) {
    const rect = measureRectBedWithReference(
      input.bedCorners,
      input.referenceEdgeA,
      input.referenceEdgeB,
      dCm,
      input.imageWidthPx,
      input.imageHeightPx,
    );
    if (rect && rect.widthCm > 5 && rect.heightCm > 5) {
      const worldBed = {
        pointsCm: rect.bedCm,
        sourceFrameIds: ["web-frame"],
      };
      const garden = worldPolygonToGardenGrid(worldBed, 30);
      const b = boundsOf(rect.bedCm);
      const areaCm2 = polygonAreaCm2(rect.bedCm);
      return {
        garden,
        worldBed,
        diagnostics: {
          scale: {
            cmPerPx,
            reference: kind,
            referenceMode: mode,
            referenceLabel: reference.label,
            referenceDiameterCm: dCm,
            cmPerPxGround: { x: cmPerPx, y: cmPerPx },
          },
          frameCount: 1,
          stitched: false,
          widthCm: Math.round(b.widthCm * 10) / 10,
          heightCm: Math.round(b.heightCm * 10) / 10,
          areaM2: Math.round((areaCm2 / 10_000) * 100) / 100,
          warnings: [
            "Perspective-corrected assuming a rectangular bed (desk / raised bed / patio).",
          ],
        },
      };
    }
  }

  // Fallback: mild pitch estimate when the outline isn't a clean quad.
  let pitch = input.pitchFromNadirRad;
  if (pitch == null) {
    pitch = estimatePitchFromRectangle(
      input.bedCorners,
      cmPerPx,
      reference.centerPx,
    ).pitchFromNadirRad;
  }

  return scanYard(
    [
      {
        id: "web-frame",
        widthPx: input.imageWidthPx,
        heightPx: input.imageHeightPx,
        attitude: {
          pitchFromNadirRad: pitch,
        },
        bedPolygonPx: input.bedCorners,
        reference,
      },
    ],
    { cellSizeCm: 30 },
  );
}

export interface MeasureFrameInput {
  id: string;
  imageWidthPx: number;
  imageHeightPx: number;
  referenceEdgeA: Point2;
  referenceEdgeB: Point2;
  bedCorners: Point2[];
}

export interface MeasureYardFramesInput {
  frames: MeasureFrameInput[];
  mode: ScaleReferenceMode;
  coinKind?: Exclude<ReferenceKind, "custom">;
  customSizeCm?: number;
  customLabel?: string;
  /** How the user panned between shots (hackathon stitch). */
  stitchDirection?: "right" | "left" | "up" | "down";
  /** Overlap between consecutive frames, 0.1–0.5 typical. */
  overlapFraction?: number;
  pitchFromNadirRad?: number;
}

/**
 * Multi-photo yard measure. Frame 0 holds the scale reference; later frames
 * are linked with overlap hints (coin-ghost alignment in the UI). Approximate.
 */
export function measureYardFromFrames(input: MeasureYardFramesInput): YardScanResult {
  if (!input.frames.length) {
    throw new Error("Add at least one photo frame before measuring.");
  }
  if (input.frames.length === 1) {
    const f = input.frames[0]!;
    return measureYardFromTaps({
      imageWidthPx: f.imageWidthPx,
      imageHeightPx: f.imageHeightPx,
      referenceEdgeA: f.referenceEdgeA,
      referenceEdgeB: f.referenceEdgeB,
      bedCorners: f.bedCorners,
      mode: input.mode,
      coinKind: input.coinKind,
      customSizeCm: input.customSizeCm,
      customLabel: input.customLabel,
      pitchFromNadirRad: input.pitchFromNadirRad,
    });
  }

  if (input.mode === "coin" && !input.coinKind) {
    throw new Error("Choose which coin you used.");
  }
  if (input.mode === "custom_object" && !(input.customSizeCm && input.customSizeCm > 0)) {
    throw new Error("Enter how wide your reference object is (cm).");
  }

  const kind: ReferenceKind =
    input.mode === "coin" ? input.coinKind! : "custom";
  const customCm = input.mode === "custom_object" ? input.customSizeCm : undefined;
  const direction = input.stitchDirection ?? "right";
  const overlap = input.overlapFraction ?? 0.3;

  const frames: ScanFrame[] = input.frames.map((f, i) => {
    const reference = referenceFromEdgeTaps(f.referenceEdgeA, f.referenceEdgeB, {
      mode: input.mode,
      kind,
      customDiameterCm: customCm,
      label: input.mode === "custom_object" ? input.customLabel || "custom object" : undefined,
    });
    const { cmPerPx } = scaleFromReference(reference.diameterPx, kind, customCm);
    const pitch =
      input.pitchFromNadirRad ??
      estimatePitchFromRectangle(f.bedCorners, cmPerPx, reference.centerPx)
        .pitchFromNadirRad;

    const frame: ScanFrame = {
      id: f.id,
      widthPx: f.imageWidthPx,
      heightPx: f.imageHeightPx,
      attitude: { pitchFromNadirRad: pitch },
      bedPolygonPx: f.bedCorners,
      reference,
    };
    if (i > 0) {
      frame.stitch = {
        linksTo: input.frames[i - 1]!.id,
        direction,
        overlapFraction: overlap,
      };
    }
    return frame;
  });

  const result = scanYard(frames, { cellSizeCm: 30 });
  const allHaveCoin = frames.every((f) => f.reference ?? f.coin);
  result.diagnostics.warnings = [
    ...result.diagnostics.warnings,
    allHaveCoin
      ? "Stitched by aligning the same coin across photos (keep the coin in the overlap)."
      : "Stitched with pan-overlap hints — mark the coin in every frame for better accuracy.",
  ];
  return result;
}

/** TODO(Jessica): fetch curated catalog from Mongo/plants.json. */
export function getCatalog(): Species[] {
  return MOCK_CATALOG;
}

/** Offline fallback alert when live Open-Meteo is unreachable. */
export const FAKE_WEATHER_ALERT = {
  severity: "warning" as const,
  title: "Thunderstorm Friday ~6 PM",
  advice: "Petunia Protection Protocol: cover seedlings and move potted succulents inside.",
};

export const DAYS_TO_HARVEST: Record<string, number> = {
  veggies: 70,
  herbs: 40,
  fruit: 90,
  flowers: 60,
  pollinator: 75,
};

/** Prefer per-species catalog harvest days; category map is last-resort only. */
export function harvestDaysFor(s: {
  daysToHarvest?: number;
  daysToHarvestMin?: number;
  daysToHarvestMax?: number;
  category: string;
  yieldKgPerSeason: number;
}): number | null {
  if (s.yieldKgPerSeason <= 0) return null;
  if (s.daysToHarvest != null && s.daysToHarvest > 0) return s.daysToHarvest;
  if (s.daysToHarvestMin != null && s.daysToHarvestMax != null) {
    return Math.round((s.daysToHarvestMin + s.daysToHarvestMax) / 2);
  }
  return DAYS_TO_HARVEST[s.category] ?? 60;
}

export function harvestRangeLabel(s: {
  daysToHarvestMin?: number;
  daysToHarvestMax?: number;
}): string {
  if (s.daysToHarvestMin != null && s.daysToHarvestMax != null) {
    return ` (${s.daysToHarvestMin}-${s.daysToHarvestMax}d; weather can shift this)`;
  }
  return "";
}
