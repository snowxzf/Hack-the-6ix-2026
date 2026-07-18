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
  /** Planting units (by origin cellKey) currently harvested — rendered as an
   *  empty, reseedable spot instead of the species' color. */
  harvestedUnits?: Set<string>;
  /** When set, clicking an eligible planted cell fires onUnitClick with that
   *  unit's origin key: "harvest" targets non-empty units, "reseed" targets
   *  empty ones. Clicking anywhere in a multi-cell plant's footprint targets
   *  the whole unit, not just the cell under the cursor. */
  clickMode?: "harvest" | "reseed" | null;
  onUnitClick?: (unitKey: string) => void;
  /** Row/column number strip along the top and left edges — lets "R2C3" in
   *  the Dashboard's unit bars be found on the actual grid at a glance. */
  showAxisLabels?: boolean;
}

const LABEL_PX = 16;

export function GridView({
  garden,
  selected,
  onPaint,
  placements,
  reveal,
  harvestedUnits,
  clickMode,
  onUnitClick,
  showAxisLabels,
}: Props) {
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
  const plantedBy = new Map<string, PlacementInstance>();
  const shown = placements ? placements.slice(0, reveal ?? placements.length) : [];
  for (const p of shown) {
    for (const [r, c] of p.cells) plantedBy.set(cellKey(r, c), p);
  }

  const axisTracks = showAxisLabels ? 1 : 0;

  const cells = [];
  for (let r = 0; r < garden.rows; r++) {
    for (let c = 0; c < garden.cols; c++) {
      const k = cellKey(r, c);
      const state = stateAt.get(k);
      const placement = plantedBy.get(k);
      const species = placement?.speciesId;
      const unitKey = placement ? cellKey(placement.origin[0], placement.origin[1]) : null;
      const isEmptyUnit = unitKey ? (harvestedUnits?.has(unitKey) ?? false) : false;
      const paintable = state === "selected" || state === "obstacle_movable";
      const isSelected = !selected || selected.has(k);
      const actionable =
        !!unitKey &&
        !!clickMode &&
        ((clickMode === "harvest" && !isEmptyUnit) || (clickMode === "reseed" && isEmptyUnit));

      let cls = "cell";
      let style: React.CSSProperties = {};
      let label = "";
      if (species) {
        style.background = speciesColor(species);
        cls += " planted";
        if (isEmptyUnit) cls += " empty-unit";
      } else if (state === "existing_plant") {
        cls += " existing";
        label = "P";
      } else if (state === "blocked") {
        cls += " blocked";
      } else if (state === "obstacle_movable") {
        cls += " obstacle" + (isSelected ? " sel" : "");
        label = "B";
      } else if (state === "selected") {
        cls += isSelected ? " sel" : " unsel";
      } else {
        cls += " off";
      }
      if (actionable) cls += ` actionable mode-${clickMode}`;

      if (showAxisLabels) {
        style = { ...style, gridColumn: c + 1 + axisTracks, gridRow: r + 1 + axisTracks };
      }

      cells.push(
        <div
          key={k}
          data-key={k}
          className={cls}
          style={style}
          title={
            actionable
              ? clickMode === "harvest"
                ? "Click to harvest"
                : "Click to reseed"
              : undefined
          }
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
          onClick={actionable ? () => onUnitClick?.(unitKey!) : undefined}
        >
          {label}
        </div>,
      );
    }
  }

  const axisLabels = [];
  if (showAxisLabels) {
    axisLabels.push(
      <div key="corner" className="grid-label" style={{ gridColumn: 1, gridRow: 1 }} />,
    );
    for (let c = 0; c < garden.cols; c++) {
      axisLabels.push(
        <div key={`ch${c}`} className="grid-label" style={{ gridColumn: c + 2, gridRow: 1 }}>
          {c + 1}
        </div>,
      );
    }
    for (let r = 0; r < garden.rows; r++) {
      axisLabels.push(
        <div key={`rh${r}`} className="grid-label" style={{ gridColumn: 1, gridRow: r + 2 }}>
          {r + 1}
        </div>,
      );
    }
  }

  // Fluid tracks: always fill the phone/card width. Cells stay square via aspect-ratio.
  const template = showAxisLabels
    ? {
        gridTemplateColumns: `${LABEL_PX}px repeat(${garden.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `${LABEL_PX}px repeat(${garden.rows}, auto)`,
      }
    : {
        gridTemplateColumns: `repeat(${garden.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${garden.rows}, auto)`,
      };

  return (
    <div className="grid-wrap">
      <div className="grid" onPointerMove={handlePointerMove} style={template}>
        {axisLabels}
        {cells}
      </div>
    </div>
  );
}
