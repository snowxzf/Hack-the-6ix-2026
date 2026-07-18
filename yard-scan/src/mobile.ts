/**
 * Hooks the mobile app implements — CV + device sensors plug in here.
 * This package stays pure math so it runs in Node, RN, or the browser.
 */

import type { CoinDetection, DeviceAttitude, Point2, ReferenceKind } from "./types";

/** Map CoreMotion / ARKit gravity to our pitch-from-nadir convention. */
export function attitudeFromGravity(
  gravity: { x: number; y: number; z: number },
  rollRad = 0,
): DeviceAttitude {
  // When phone is flat face-up, gravity ≈ (0, 0, -1) in many APIs.
  // Pitch from nadir ≈ angle between -gravity and the camera look axis.
  // Simplified: use |z| dominance for overhead shots.
  const g = Math.hypot(gravity.x, gravity.y, gravity.z) || 1;
  const nz = Math.abs(gravity.z) / g;
  const pitchFromNadirRad = Math.acos(Math.min(1, Math.max(0, nz)));
  return { pitchFromNadirRad, rollRad };
}

/**
 * Placeholder coin detector — replace with Vision/OpenCV circle Hough
 * or a tiny on-device model. For demos, the UI can let the user tap the coin
 * and drag a diameter handle (most reliable at a hackathon).
 */
export function mockCoinFromTap(
  centerPx: Point2,
  diameterPx: number,
  kind: ReferenceKind = "cad_quarter",
  confidence = 0.95,
): CoinDetection {
  return { kind, centerPx, diameterPx, confidence };
}

/** UX copy for the scan screen. */
export const SCAN_UX = {
  placeCoin:
    "Place a coin on the soil at the edge of your bed, then frame it in the shot.",
  holdOverhead:
    "Hold the phone more overhead (not at a steep angle) for accurate size.",
  outlineBed: "Tap the corners of your garden bed, or drag the outline.",
  multiFrame:
    "Yard too big? Capture overlapping photos left→right; we'll stitch them.",
  confirmDims: (wCm: number, hCm: number) =>
    `We measured about ${(wCm / 100).toFixed(1)} × ${(hCm / 100).toFixed(1)} m — look right?`,
} as const;
