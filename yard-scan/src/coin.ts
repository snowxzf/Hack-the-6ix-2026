import type { ReferenceKind } from "./types";

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
 * Image-plane scale from a detected coin.
 * cmPerPx = real_diameter_cm / diameter_in_pixels
 */
export function scaleFromCoin(
  diameterPx: number,
  kind: ReferenceKind,
  customDiameterCm?: number,
): { cmPerPx: number; referenceDiameterCm: number } {
  if (diameterPx <= 0) throw new Error("coin diameterPx must be > 0");
  const dCm = referenceDiameterCm(kind, customDiameterCm);
  return { cmPerPx: dCm / diameterPx, referenceDiameterCm: dCm };
}
