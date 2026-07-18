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
  cellSizeCm: number;
  cols: number;
  rows: number;
  cells: Cell[];
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

/** Image-space detection of the reference coin. */
export interface CoinDetection {
  kind: ReferenceKind;
  /** Diameter of the custom reference in cm (required if kind === "custom"). */
  customDiameterCm?: number;
  /** Bounding circle in image pixels. */
  centerPx: Point2;
  diameterPx: number;
  confidence: number; // 0..1
}

/** One camera capture of (part of) the yard. */
export interface ScanFrame {
  id: string;
  /** Pixel size of the image. */
  widthPx: number;
  heightPx: number;
  attitude: DeviceAttitude;
  /**
   * Bed outline polygon in image pixels (user taps or CV segmentation).
   * Clockwise or counter-clockwise; closed implied.
   */
  bedPolygonPx: Point2[];
  /** Reference coin in this frame (required on at least one frame in a session). */
  coin?: CoinDetection;
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
  /** Vertices in centimeters on the ground plane (origin = first frame coin center). */
  pointsCm: Point2[];
  sourceFrameIds: string[];
}

export interface ScaleInfo {
  cmPerPx: number;
  reference: ReferenceKind;
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
  /** Minimum confidence to accept a coin detection. */
  minCoinConfidence?: number;
}
