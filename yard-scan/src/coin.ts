import type { ReferenceKind, ScaleReference, ScaleReferenceMode } from "./types";

/** Physical diameters (cm) for common coins used as scale references. */
export const COIN_DIAMETER_CM: Record<Exclude<ReferenceKind, "custom">, number> = {
  cad_penny: 1.905,
  cad_nickel: 2.12,
  cad_dime: 1.803,
  cad_quarter: 2.388,
  usd_penny: 1.905,
  usd_nickel: 2.121,
  usd_dime: 1.791,
  usd_quarter: 2.426,
};

export const COIN_LABELS: Record<Exclude<ReferenceKind, "custom">, string> = {
  cad_penny: "CAD penny",
  cad_nickel: "CAD nickel",
  cad_dime: "CAD dime",
  cad_quarter: "CAD quarter",
  usd_penny: "USD penny",
  usd_nickel: "USD nickel",
  usd_dime: "USD dime",
  usd_quarter: "USD quarter",
};

export function referenceDiameterCm(
  kind: ReferenceKind,
  customDiameterCm?: number,
): number {
  if (kind === "custom") {
    if (!customDiameterCm || customDiameterCm <= 0) {
      throw new Error("custom reference requires customDiameterCm > 0");
    }
    return customDiameterCm;
  }
  return COIN_DIAMETER_CM[kind];
}

/**
 * Image-plane scale from a marked reference span.
 * cmPerPx = real_size_cm / size_in_pixels
 */
export function scaleFromReference(
  diameterPx: number,
  kind: ReferenceKind,
  customDiameterCm?: number,
): { cmPerPx: number; referenceDiameterCm: number } {
  if (diameterPx <= 0) throw new Error("reference diameterPx must be > 0");
  const dCm = referenceDiameterCm(kind, customDiameterCm);
  return { cmPerPx: dCm / diameterPx, referenceDiameterCm: dCm };
}

/** @deprecated Use scaleFromReference */
export const scaleFromCoin = scaleFromReference;

/** Build a ScaleReference from two edge taps across a known-size object. */
export function referenceFromEdgeTaps(
  a: { x: number; y: number },
  b: { x: number; y: number },
  opts: {
    mode: ScaleReferenceMode;
    kind: ReferenceKind;
    customDiameterCm?: number;
    label?: string;
    confidence?: number;
  },
): ScaleReference {
  const diameterPx = Math.hypot(b.x - a.x, b.y - a.y);
  if (diameterPx < 2) throw new Error("Reference taps are too close together");
  return {
    mode: opts.mode,
    kind: opts.kind,
    label: opts.label,
    customDiameterCm: opts.customDiameterCm,
    centerPx: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    diameterPx,
    confidence: opts.confidence ?? 0.95,
  };
}
