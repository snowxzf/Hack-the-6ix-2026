import { useMemo } from "react";
import type { GardenGrid } from "../../optimizer/src/index";
import {
  applyHomographyPoint,
  homographyUnitSquareToQuad,
  type Point2,
} from "../../yard-scan/src/index";

export interface ScanPhotoOverlay {
  photoUrl: string;
  imageWidthPx: number;
  imageHeightPx: number;
  /** Bed outline in image pixels, boundary order (typically TL→TR→BR→BL). */
  bedCorners: Point2[];
}

function lerp(a: Point2, b: Point2, t: number): Point2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Map unit square (u,v) ∈ [0,1]² onto the bed quad. Uses a true perspective
 * homography when available (cells near the camera correctly render larger),
 * falling back to bilinear interpolation for degenerate quads.
 */
function unitToImage(
  corners: Point2[],
  H: number[] | null,
  u: number,
  v: number,
): Point2 {
  if (H) {
    const p = applyHomographyPoint(H, { x: u, y: v });
    if (p) return p;
  }
  const tl = corners[0]!;
  const tr = corners[1] ?? corners[0]!;
  const br = corners[2] ?? corners[1]!;
  const bl = corners[3] ?? corners[0]!;
  const top = lerp(tl, tr, u);
  const bot = lerp(bl, br, u);
  return lerp(top, bot, v);
}

function cellFill(state: string): string {
  switch (state) {
    case "selected":
      return "rgba(110, 168, 120, 0.35)";
    case "blocked":
      return "rgba(80, 80, 90, 0.45)";
    case "obstacle_movable":
      return "rgba(220, 160, 80, 0.4)";
    case "existing_plant":
      return "rgba(90, 160, 200, 0.45)";
    default:
      return "rgba(255, 255, 255, 0.08)";
  }
}

/**
 * Shows the planting grid warped onto the user's photo using the bed outline
 * they tapped — so the measure result reads on the real yard image.
 */
export function PhotoGridOverlay(props: {
  overlay: ScanPhotoOverlay;
  garden: GardenGrid;
}) {
  const { overlay, garden } = props;
  const { photoUrl, imageWidthPx: w, imageHeightPx: h, bedCorners } = overlay;
  const corners = useMemo(
    () =>
      bedCorners.length >= 4
        ? bedCorners.slice(0, 4)
        : [
            bedCorners[0]!,
            bedCorners[1] ?? bedCorners[0]!,
            bedCorners[2] ?? bedCorners[0]!,
            bedCorners[bedCorners.length - 1]!,
          ],
    [bedCorners],
  );
  const H = useMemo(
    () => (corners.length === 4 ? homographyUnitSquareToQuad(corners) : null),
    [corners],
  );

  if (bedCorners.length < 3 || garden.cols < 1 || garden.rows < 1) return null;

  const byKey = new Map(garden.cells.map((c) => [`${c.r},${c.c}`, c]));
  const stroke = Math.max(1.5, w / 500);

  // The grid tiles the bed edge to edge (cells stretch to fit), so cell
  // indices map straight onto even fractions of the quad.
  const uAt = (c: number): number => c / garden.cols;
  const vAt = (r: number): number => r / garden.rows;

  const quads: { key: string; points: string; fill: string }[] = [];
  for (let r = 0; r < garden.rows; r++) {
    for (let c = 0; c < garden.cols; c++) {
      const cellAt = byKey.get(`${r},${c}`);
      if (!cellAt) continue;
      const u0 = uAt(c);
      const u1 = uAt(c + 1);
      const v0 = vAt(r);
      const v1 = vAt(r + 1);
      const pts = [
        unitToImage(corners, H, u0, v0),
        unitToImage(corners, H, u1, v0),
        unitToImage(corners, H, u1, v1),
        unitToImage(corners, H, u0, v1),
      ];
      quads.push({
        key: `${r}-${c}`,
        points: pts.map((p) => `${p.x},${p.y}`).join(" "),
        fill: cellFill(cellAt.state),
      });
    }
  }

  return (
    <div className="photo-grid-overlay">
      <p className="tiny muted">Planting grid on your photo</p>
      <div className="photo-stage">
        <img className="photo" src={photoUrl} alt="yard with grid" draggable={false} />
        <svg className="mark-lines" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <polygon
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#6ea8fe"
            strokeWidth={stroke * 1.2}
            strokeDasharray={`${Math.max(6, w / 120)}`}
          />
          {quads.map((q) => (
            <polygon
              key={q.key}
              points={q.points}
              fill={q.fill}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={stroke * 0.6}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
