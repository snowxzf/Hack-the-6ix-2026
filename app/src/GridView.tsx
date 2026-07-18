import { useEffect, useRef } from "react";
import type { GardenGrid, PlacementInstance } from "../../optimizer/src/index";

export const cellKey = (r: number, c: number) => `${r},${c}`;

/** Deterministic color per species so the legend always matches the map. */
export function speciesColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 62%, 40%)`;
}

interface Props {
  garden: GardenGrid;
  /** Plantable cells the user has opted in. Omit → everything shown as-is. */
  selected?: Set<string>;
  /** Enables drag-painting of the selected set. */
  onPaint?: (key: string, adding: boolean) => void;
  /** Planted layout to overlay; `reveal` limits to the first N (animation). */
  placements?: PlacementInstance[];
  reveal?: number;
}

export function GridView({ garden, selected, onPaint, placements, reveal }: Props) {
  const painting = useRef<boolean | null>(null);

  useEffect(() => {
    const up = () => (painting.current = null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const stateAt = new Map(garden.cells.map((c) => [cellKey(c.r, c.c), c.state]));
  const planted = new Map<string, string>();
  const shown = placements ? placements.slice(0, reveal ?? placements.length) : [];
  for (const p of shown) {
    for (const [r, c] of p.cells) planted.set(cellKey(r, c), p.speciesId);
  }

  const cellPx = Math.max(18, Math.min(34, Math.floor(430 / garden.cols)));
  const cells = [];
  for (let r = 0; r < garden.rows; r++) {
    for (let c = 0; c < garden.cols; c++) {
      const k = cellKey(r, c);
      const state = stateAt.get(k);
      const species = planted.get(k);
      const paintable = state === "selected" || state === "obstacle_movable";
      const isSelected = !selected || selected.has(k);

      let cls = "cell";
      let style: React.CSSProperties = {};
      let label = "";
      if (species) {
        style.background = speciesColor(species);
        cls += " planted";
      } else if (state === "existing_plant") {
        cls += " existing";
        label = "🌸";
      } else if (state === "blocked") {
        cls += " blocked";
      } else if (state === "obstacle_movable") {
        cls += " obstacle" + (isSelected ? " sel" : "");
        label = "🚲";
      } else if (state === "selected") {
        cls += isSelected ? " sel" : " unsel";
      } else {
        cls += " off";
      }

      cells.push(
        <div
          key={k}
          className={cls}
          style={style}
          onPointerDown={
            onPaint && paintable
              ? (e) => {
                  e.preventDefault();
                  painting.current = !selected?.has(k);
                  onPaint(k, painting.current);
                }
              : undefined
          }
          onPointerEnter={
            onPaint && paintable
              ? () => {
                  if (painting.current !== null) onPaint(k, painting.current);
                }
              : undefined
          }
        >
          {label}
        </div>,
      );
    }
  }

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${garden.cols}, ${cellPx}px)`,
        gridAutoRows: `${cellPx}px`,
      }}
    >
      {cells}
    </div>
  );
}
