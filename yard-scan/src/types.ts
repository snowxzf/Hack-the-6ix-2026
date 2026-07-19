/**
 * Yard-scan data contracts.
 *
 * Pipeline: camera frames (+ device attitude) → coin scale → ground plane
 * correction → optional multi-frame stitch → GardenGrid for the optimizer.
 *
 * GardenGrid shape matches optimizer/src/types.ts (duplicated lightly so this
 * package stays dependency-free for the hackathon).
 */

export type CellState = "selected" | "blocked" | "obstacle_movable" | "existing_plant";

export interface Cell {
  r: number;
  c: number;
  state: CellState;
}

export interface GardenGrid {
  /** Nominal cell size the catalog spacing is calibrated for. */
  cellSizeCm: number;
  cols: number;
  rows: number;
  cells: Cell[];
  /** Actual cell size after stretching to tile the bed exactly (≈ cellSizeCm). */
  cellWidthCm?: number;
  cellHeightCm?: number;
}

/** Device spatial attitude at capture time (radians). */
export interface DeviceAttitude {
  /**
   * Pitch from looking straight down at the ground.
   * 0 = phone parallel to ground (bird's-eye).
   * π/2 = phone upright, looking at the horizon.
   * From CoreMotion / ARKit / ARCore gravity vector.
   */
  pitchFromNadirRad: number;
  /** Optional roll around the lens axis (radians). */
  rollRad?: number;
  /**
   * Optional AR world pose (meters) if ARKit/ARCore session is running —
   * preferred for multi-frame stitching.
   */
  worldPositionM?: [number, number, number];
  worldYawRad?: number;
}

export interface Point2 {
  x: number;
  y: number;
}

/** Known reference objects the user can place in frame. */
export type ReferenceKind =
  | "cad_penny"
  | "cad_nickel"
  | "cad_dime"
  | "cad_quarter"
  | "usd_penny"
  | "usd_nickel"
  | "usd_dime"
  | "usd_quarter"
  | "custom";

/** How the user provided scale. */
export type ScaleReferenceMode = "coin" | "custom_object";

/**
 * Image-space scale reference — either a coin (recommended) or any object
 * whose real-world width/diameter the user typed in.
 */
export interface ScaleReference {
  mode: ScaleReferenceMode;
  kind: ReferenceKind;
  /** Optional label for custom objects, e.g. "credit card", "phone". */
  label?: string;
  /** Real-world size in cm across the marked pixel span (required for custom). */
  customDiameterCm?: number;
  centerPx: Point2;
  /** Pixel length of the known real-world dimension (coin diameter or object width). */
  diameterPx: number;
  /**
   * The two edge tap points the span was measured between. Optional but
   * recommended: perspective rectification projects these exact points to the
   * ground plane (direction matters — the coin is an ellipse in the image).
   */
  edgeAPx?: Point2;
  edgeBPx?: Point2;
  confidence: number; // 0..1
}

/** @deprecated Use ScaleReference — kept for older call sites. */
export type CoinDetection = ScaleReference;

/** One camera capture of (part of) the yard. */
export interface ScanFrame {
  id: string;
  /** Pixel size of the image. */
  widthPx: number;
  heightPx: number;
  /** Camera focal length in px (from EXIF) — improves perspective correction. */
  focalPx?: number;
  attitude: DeviceAttitude;
  /**
   * Bed outline polygon in image pixels (user taps or CV segmentation).
   * Clockwise or counter-clockwise; closed implied.
   */
  bedPolygonPx: Point2[];
  /**
   * Scale reference in this frame (required on at least one frame).
   * Prefer `reference`; `coin` is accepted as an alias.
   */
  reference?: ScaleReference;
  /** @deprecated Alias of `reference`. */
  coin?: ScaleReference;
  /**
   * Optional overlap hint: this frame continues to the right/below of `linksTo`.
   * Used when AR world pose is unavailable (hackathon fallback stitch).
   */
  stitch?: {
    linksTo: string; // previous frame id
    /** Rough overlap fraction along the join edge, 0.1–0.5 typical. */
    overlapFraction: number;
    direction: "right" | "left" | "up" | "down";
  };
}

export interface WorldPolygon {
  /** Vertices in centimeters on the ground plane (origin = first frame reference center). */
  pointsCm: Point2[];
  sourceFrameIds: string[];
}

export interface ScaleInfo {
  cmPerPx: number;
  reference: ReferenceKind;
  referenceMode: ScaleReferenceMode;
  referenceLabel?: string;
  referenceDiameterCm: number;
  /** Effective cm/px after attitude foreshortening along the camera tilt axis. */
  cmPerPxGround: { x: number; y: number };
}

export interface ScanDiagnostics {
  scale: ScaleInfo;
  frameCount: number;
  stitched: boolean;
  widthCm: number;
  heightCm: number;
  areaM2: number;
  warnings: string[];
}

export interface YardScanResult {
  garden: GardenGrid;
  worldBed: WorldPolygon;
  diagnostics: ScanDiagnostics;
}

export interface ScanOptions {
  cellSizeCm?: number; // default 30
  /** Minimum confidence to accept a scale reference. */
  minCoinConfidence?: number;
  minReferenceConfidence?: number;
}
