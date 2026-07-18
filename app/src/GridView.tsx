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
  const lastTouched = useRef<string | null>(null);

  useEffect(() => {
    const up = () => {
      painting.current = null;
      lastTouched.current = null;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  /** Touch fix: during a touch drag the browser keeps sending pointermove
   *  events to the cell where the finger went *down*, not the cell it's
   *  currently over — pointerenter never fires on the cells in between.
   *  We look up the actual cell under the finger via elementFromPoint
   *  instead, using clientX/Y which stay accurate regardless of capture. */
  function handlePointerMove(e: React.PointerEvent) {
    if (!onPaint || painting.current === null || e.pointerType !== "touch") return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const key = el?.dataset.key;
    if (!key || key === lastTouched.current) return;
    lastTouched.current = key;
    onPaint(key, painting.current);
  }

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
          data-key={k}
          className={cls}
          style={style}
          onPointerDown={
            onPaint && paintable
              ? (e) => {
                  e.preventDefault();
                  painting.current = !selected?.has(k);
                  lastTouched.current = k;
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
      onPointerMove={handlePointerMove}
      style={{
        gridTemplateColumns: `repeat(${garden.cols}, ${cellPx}px)`,
        gridAutoRows: `${cellPx}px`,
      }}
    >
      {cells}
    </div>
  );
}
