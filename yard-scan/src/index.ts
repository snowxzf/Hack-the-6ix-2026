export type {
  Cell,
  CellState,
  CoinDetection,
  DeviceAttitude,
  GardenGrid,
  Point2,
  ReferenceKind,
  ScaleInfo,
  ScanDiagnostics,
  ScanFrame,
  ScanOptions,
  WorldPolygon,
  YardScanResult,
} from "./types";

export { COIN_DIAMETER_CM, referenceDiameterCm, scaleFromCoin } from "./coin";
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
} from "./mobile";
