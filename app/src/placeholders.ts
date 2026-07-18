/**
 * ─────────────────────────────────────────────────────────────
 *  JESSICA INTEGRATION POINTS — every fake / live bridge lives here.
 * ─────────────────────────────────────────────────────────────
 */
import { MOCK_CATALOG, SUBURBAN } from "../../optimizer/src/index";
import type { GardenGrid, Species } from "../../optimizer/src/index";
import {
  scanYard,
  referenceFromEdgeTaps,
  type Point2,
  type ReferenceKind,
  type ScaleReferenceMode,
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

/** Live yard-scan: coin (recommended) or any known-size object → GardenGrid. */
export function measureYardFromTaps(input: MeasureYardInput): YardScanResult {
  const mode = input.mode;
  const kind: ReferenceKind =
    mode === "coin" ? (input.coinKind ?? "cad_quarter") : "custom";

  if (mode === "custom_object" && !(input.customSizeCm && input.customSizeCm > 0)) {
    throw new Error("Enter how wide your reference object is (cm).");
  }

  const reference = referenceFromEdgeTaps(input.referenceEdgeA, input.referenceEdgeB, {
    mode,
    kind,
    customDiameterCm: mode === "custom_object" ? input.customSizeCm : undefined,
    label: mode === "custom_object" ? input.customLabel || "custom object" : undefined,
  });

  return scanYard(
    [
      {
        id: "web-frame",
        widthPx: input.imageWidthPx,
        heightPx: input.imageHeightPx,
        attitude: {
          pitchFromNadirRad: input.pitchFromNadirRad ?? (12 * Math.PI) / 180,
        },
        bedPolygonPx: input.bedCorners,
        reference,
      },
    ],
    { cellSizeCm: 30 },
 );
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
