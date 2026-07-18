import type { DeviceAttitude, Point2, ScaleInfo } from "./types";

const MAX_PITCH = (75 * Math.PI) / 180; // beyond this, measurements get unreliable

/**
 * Correct image-plane cm/px into ground-plane cm/px using device pitch.
 *
 * Looking straight down (pitch≈0): x and y scales match the coin.
 * Tilting toward the horizon compresses depth (image y, assuming
 * phone is held in portrait with the top of the frame farther away).
 *
 * Ground depth stretch ≈ 1 / cos(pitch) for small-to-moderate tilts
 * when the coin lies on the same ground plane as the bed.
 *
 * Plug real ARKit/ARCore hit-tests here later for higher accuracy.
 */
export function groundScaleFromAttitude(
  cmPerPxImage: number,
  attitude: DeviceAttitude,
): ScaleInfo["cmPerPxGround"] {
  const pitch = clamp(attitude.pitchFromNadirRad, 0, MAX_PITCH);
  const depthFactor = 1 / Math.max(Math.cos(pitch), 0.25);
  // Lateral (x) mostly unaffected; depth (y) foreshortened in the image
  // so each image-pixel vertically covers more ground.
  return {
    x: cmPerPxImage,
    y: cmPerPxImage * depthFactor,
  };
}

/**
 * Map an image pixel to ground-plane centimeters.
 * Origin defaults to (0,0) at the provided originPx (usually the coin center).
 */
export function imageToGroundCm(
  p: Point2,
  originPx: Point2,
  ground: ScaleInfo["cmPerPxGround"],
  rollRad = 0,
): Point2 {
  let dx = p.x - originPx.x;
  let dy = p.y - originPx.y;
  if (rollRad) {
    const c = Math.cos(-rollRad);
    const s = Math.sin(-rollRad);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    dx = rx;
    dy = ry;
  }
  return { x: dx * ground.x, y: dy * ground.y };
}

export function polygonImageToGroundCm(
  poly: Point2[],
  originPx: Point2,
  ground: ScaleInfo["cmPerPxGround"],
  rollRad = 0,
): Point2[] {
  return poly.map((p) => imageToGroundCm(p, originPx, ground, rollRad));
}

export function attitudeWarnings(attitude: DeviceAttitude): string[] {
  const warnings: string[] = [];
  if (attitude.pitchFromNadirRad > MAX_PITCH) {
    warnings.push(
      "Phone is tilted too far toward the horizon — hold more overhead for better accuracy.",
    );
  } else if (attitude.pitchFromNadirRad > (45 * Math.PI) / 180) {
    warnings.push(
      "Steep tilt detected — dimensions are approximate; a more overhead shot is better.",
    );
  }
  return warnings;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
