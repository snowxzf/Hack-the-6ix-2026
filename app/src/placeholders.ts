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
  scaleFromReference,
  worldPolygonToGardenGrid,
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

/**
 * Build a garden from typed width × length (cm). Assumes an axis-aligned rectangle.
 */
export function gardenFromRectangleCm(
  widthCm: number,
  lengthCm: number,
  cellSizeCm = 30,
): YardScanResult {
  const w = Number(widthCm);
  const h = Number(lengthCm);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 5 || h < 5) {
    throw new Error("Enter width and length of at least 5 cm each.");
  }
  if (w > 5000 || h > 5000) {
    throw new Error("Dimensions look too large — use centimeters (e.g. 150 × 60 for a desk).");
  }
  const cell = Number(cellSizeCm);
  if (!Number.isFinite(cell) || cell < 5 || cell > 120) {
    throw new Error("Grid cell size must be between 5 and 120 cm.");
  }

  const pointsCm: Point2[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const worldBed = { pointsCm, sourceFrameIds: ["manual-rect"] };
  const garden = worldPolygonToGardenGrid(worldBed, cell);
  const areaCm2 = polygonAreaCm2(pointsCm);
  const warnings = ["Manual size — assumed a flat rectangle (no photo measure)."];
  if (cell !== 30) {
    warnings.push(
      `Grid cells are ${cell} cm (plant footprints in the catalog are sized for 30 cm cells).`,
    );
  }

  return {
    garden,
    worldBed,
    diagnostics: {
      scale: {
        cmPerPx: 1,
        reference: "custom",
        referenceMode: "custom_object",
        referenceLabel: "manual rectangle",
        referenceDiameterCm: 0,
        cmPerPxGround: { x: 1, y: 1 },
      },
      frameCount: 0,
      stitched: false,
      widthCm: Math.round(w * 10) / 10,
      heightCm: Math.round(h * 10) / 10,
      areaM2: Math.round((areaCm2 / 10_000) * 100) / 100,
      warnings,
    },
  };
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
  /** Planting grid cell edge length in cm (default 30). */
  cellSizeCm?: number;
  /** Camera focal length in px (from photo EXIF) — big accuracy win when set. */
  focalPx?: number;
}

/** Live yard-scan: coin or any known-size object → GardenGrid. */
export function measureYardFromTaps(input: MeasureYardInput): YardScanResult {
  const mode = input.mode;
  const cellSizeCm = input.cellSizeCm ?? 30;

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
  const { cmPerPx } = scaleFromReference(reference.diameterPx, kind, customCm);

  // Fallback attitude for frames the pipeline can't perspective-rectify
  // (scanYard rectifies 4-corner outlines internally; ≠4 corners use this).
  let pitch = input.pitchFromNadirRad;
  if (pitch == null) {
    pitch = estimatePitchFromRectangle(
      input.bedCorners,
      cmPerPx,
      reference.centerPx,
    ).pitchFromNadirRad;
  }

  const result = scanYard(
    [
      {
        id: "web-frame",
        widthPx: input.imageWidthPx,
        heightPx: input.imageHeightPx,
        focalPx: input.focalPx,
        attitude: {
          pitchFromNadirRad: pitch,
        },
        bedPolygonPx: input.bedCorners,
        reference,
      },
    ],
    { cellSizeCm },
  );
  annotateWebScan(result, input.focalPx, cellSizeCm);
  return result;
}

/** Shared web-app diagnostics: lens source + non-default cell size. */
function annotateWebScan(
  result: YardScanResult,
  focalPx: number | undefined,
  cellSizeCm: number,
): void {
  result.diagnostics.warnings.push(
    focalPx
      ? "Lens focal length read from the photo's EXIF."
      : "No EXIF lens data in this photo — used a typical phone-lens estimate.",
  );
  if (cellSizeCm !== 30) {
    result.diagnostics.warnings.push(
      `Grid cells are ${cellSizeCm} cm (plant footprints in the catalog are sized for 30 cm cells).`,
    );
  }
}

export interface MeasureFrameInput {
  id: string;
  imageWidthPx: number;
  imageHeightPx: number;
  referenceEdgeA: Point2;
  referenceEdgeB: Point2;
  bedCorners: Point2[];
  focalPx?: number;
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
  cellSizeCm?: number;
}

/**
 * Multi-photo yard measure. Frame 0 holds the scale reference; later frames
 * are linked with overlap hints (coin-ghost alignment in the UI). Approximate.
 */
export function measureYardFromFrames(input: MeasureYardFramesInput): YardScanResult {
  if (!input.frames.length) {
    throw new Error("Add at least one photo frame before measuring.");
  }
  const cellSizeCm = input.cellSizeCm ?? 30;
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
      cellSizeCm,
      focalPx: f.focalPx,
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
      focalPx: f.focalPx,
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

  const result = scanYard(frames, { cellSizeCm });
  const allHaveCoin = frames.every((f) => f.reference ?? f.coin);
  result.diagnostics.warnings = [
    ...result.diagnostics.warnings,
    allHaveCoin
      ? "Stitched by aligning the same coin across photos (keep the coin in the overlap)."
      : "Stitched with pan-overlap hints — mark the coin in every frame for better accuracy.",
  ];
  annotateWebScan(
    result,
    input.frames.every((f) => f.focalPx) ? input.frames[0]!.focalPx : undefined,
    cellSizeCm,
  );
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
    return " (weather can vary this)";
  }
  return "";
}
