/**
 * Hooks the mobile / test app implements — CV + device sensors plug in here.
 */

import { referenceFromEdgeTaps } from "./coin";
import type {
  Point2,
  ReferenceKind,
  ScaleReference,
  ScaleReferenceMode,
  DeviceAttitude,
} from "./types";

/** Map CoreMotion / ARKit gravity to our pitch-from-nadir convention. */
export function attitudeFromGravity(
  gravity: { x: number; y: number; z: number },
  rollRad = 0,
): DeviceAttitude {
  const g = Math.hypot(gravity.x, gravity.y, gravity.z) || 1;
  const nz = Math.abs(gravity.z) / g;
  const pitchFromNadirRad = Math.acos(Math.min(1, Math.max(0, nz)));
  return { pitchFromNadirRad, rollRad };
}

/** Quick helper: center + diameter in px (e.g. after circle detect). */
export function mockCoinFromTap(
  centerPx: Point2,
  diameterPx: number,
  kind: ReferenceKind = "cad_quarter",
  confidence = 0.95,
): ScaleReference {
  return {
    mode: kind === "custom" ? "custom_object" : "coin",
    kind,
    centerPx,
    diameterPx,
    confidence,
  };
}

export function mockReferenceFromTap(
  centerPx: Point2,
  diameterPx: number,
  opts: {
    mode: ScaleReferenceMode;
    kind: ReferenceKind;
    customDiameterCm?: number;
    label?: string;
    confidence?: number;
  },
): ScaleReference {
  return {
    mode: opts.mode,
    kind: opts.kind,
    label: opts.label,
    customDiameterCm: opts.customDiameterCm,
    centerPx,
    diameterPx,
    confidence: opts.confidence ?? 0.95,
  };
}

export { referenceFromEdgeTaps };

/** UX copy for the scan screen. */
export const SCAN_UX = {
  placeCoin:
    "Place a coin on the soil (recommended), then tap both edges of it in the photo.",
  placeCustom:
    "Or pick any object in the photo, type how wide it is in cm, and tap both edges.",
  holdOverhead:
    "Hold the phone more overhead (not at a steep angle) for accurate size.",
  outlineBed: "Tap the corners of your garden bed (at least 3).",
  multiFrame:
    "Yard too big? Capture overlapping photos left→right; we'll stitch them.",
  confirmDims: (wCm: number, hCm: number) =>
    `We measured about ${(wCm / 100).toFixed(1)} × ${(hCm / 100).toFixed(1)} m — look right?`,
} as const;
