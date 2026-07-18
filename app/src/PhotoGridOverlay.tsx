import type { GardenGrid } from "../../optimizer/src/index";
import type { Point2 } from "../../yard-scan/src/index";

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

/** Bilinear map from unit square (u,v) ∈ [0,1]² onto a 4-point bed quad. */
function unitToImage(corners: Point2[], u: number, v: number): Point2 {
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
  if (bedCorners.length < 3 || garden.cols < 1 || garden.rows < 1) return null;

  const corners =
    bedCorners.length >= 4
      ? bedCorners.slice(0, 4)
      : [
          bedCorners[0]!,
          bedCorners[1] ?? bedCorners[0]!,
          bedCorners[2] ?? bedCorners[0]!,
          bedCorners[bedCorners.length - 1]!,
        ];

  const byKey = new Map(garden.cells.map((c) => [`${c.r},${c.c}`, c]));
  const stroke = Math.max(1.5, w / 500);

  const quads: { key: string; points: string; fill: string }[] = [];
  for (let r = 0; r < garden.rows; r++) {
    for (let c = 0; c < garden.cols; c++) {
      const cell = byKey.get(`${r},${c}`);
      if (!cell) continue;
      const u0 = c / garden.cols;
      const u1 = (c + 1) / garden.cols;
      const v0 = r / garden.rows;
      const v1 = (r + 1) / garden.rows;
      const pts = [
        unitToImage(corners, u0, v0),
        unitToImage(corners, u1, v0),
        unitToImage(corners, u1, v1),
        unitToImage(corners, u0, v1),
      ];
      quads.push({
        key: `${r}-${c}`,
        points: pts.map((p) => `${p.x},${p.y}`).join(" "),
        fill: cellFill(cell.state),
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
