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
  kind: ReferenceKind,
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
    "Place a coin flat on the bed, choose the coin type, then tap both edges of it in the photo.",
  placeCustom:
    "Or pick any object in the photo, type how wide it is in cm, and tap both edges.",
  holdOverhead:
    "Hold the phone more overhead (not at a steep angle) for accurate size.",
  outlineBed: "Tap the corners of your garden bed (at least 3).",
  multiFrame:
    "Too wide for one shot? Turn on Stitch, then for each photo: upload/capture → mark coin + corners → Save frame & add next. Repeat for 2 or more overlapping shots, then Measure. Keep the same coin in each overlap — we stitch by lining that coin up. You can also multi-select several photos at once in the file picker.",
  coinGhost:
    "Line the real coin up with this dashed circle, then Capture and mark its edges again.",
  confirmDims: (wCm: number, hCm: number) =>
    `We measured about ${(wCm / 100).toFixed(1)} × ${(hCm / 100).toFixed(1)} m — look right?`,
} as const;
