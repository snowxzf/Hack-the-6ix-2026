export type {
  Cell,
  CellState,
  CoinDetection,
  DeviceAttitude,
  GardenGrid,
  Point2,
  ReferenceKind,
  ScaleInfo,
  ScaleReference,
  ScaleReferenceMode,
  ScanDiagnostics,
  ScanFrame,
  ScanOptions,
  WorldPolygon,
  YardScanResult,
} from "./types";

export {
  COIN_DIAMETER_CM,
  COIN_LABELS,
  referenceDiameterCm,
  referenceFromEdgeTaps,
  scaleFromCoin,
  scaleFromReference,
} from "./coin";
export {
  attitudeWarnings,
  groundScaleFromAttitude,
  imageToGroundCm,
  polygonImageToGroundCm,
} from "./attitude";
export {
  boundsOf,
  convexHull,
  pointInPolygon,
  polygonAreaCm2,
  translatePolygon,
} from "./geometry";
export { projectFramesToGround, stitchWorldPolygons } from "./stitch";
export { worldPolygonToGardenGrid } from "./grid";
export { scanYard } from "./pipeline";
export {
  SCAN_UX,
  attitudeFromGravity,
  mockCoinFromTap,
  mockReferenceFromTap,
} from "./mobile";
