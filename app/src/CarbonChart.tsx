import { useState } from "react";
import { useDevClock } from "./devClock";

/**
 * Carbon progress so far (not a forecast).
 *
 * X-axis: left = past → right = present (now).
 * Range chips zoom how far BACK from now you look:
 *   1d → yesterday … now,  1w → ~7 days ago … now,  etc.
 *
 * DevTools advances "now": you pretend the user has already spent that
 * many days on the app, so look-back windows fill with simulated history.
 */
export const SEASON_MS = 90 * 24 * 60 * 60 * 1000;

type RangeId = "1d" | "1w" | "1m" | "6m" | "1y";
const RANGES: { id: RangeId; label: string; ms: number }[] = [
  { id: "1d", label: "1d", ms: 1 * 24 * 60 * 60 * 1000 },
  { id: "1w", label: "1w", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "1m", label: "1m", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "6m", label: "6m", ms: 182 * 24 * 60 * 60 * 1000 },
  { id: "1y", label: "1y", ms: 365 * 24 * 60 * 60 * 1000 },
];

export function carbonAt(t: number, plantedAt: number, totalKg: number): number {
  const frac = Math.min(1, Math.max(0, (t - plantedAt) / SEASON_MS));
  return totalKg * frac;
}

const W = 320;
const H = 188;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 18;
const PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const SAMPLES = 48;
const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function CarbonChart(props: { plantedAt: number; totalKgCo2eSeason: number }) {
  const [range, setRange] = useState<RangeId>("1m");
  const [hover, setHover] = useState<number | null>(null);

  const { now: clockNow, offsetDays } = useDevClock();
  const plantedAt = props.plantedAt;
  // "Now" follows DevTools — simulate months of use ending at this present.
  const tRight = Math.max(clockNow, plantedAt);
  const rangeDef = RANGES.find((r) => r.id === range)!;
  // Look BACK from now; never before plant day.
  const tLeft = Math.max(plantedAt, tRight - rangeDef.ms);
  const span = Math.max(1, tRight - tLeft);

  const yMax = Math.max(
    props.totalKgCo2eSeason,
    carbonAt(tRight, plantedAt, props.totalKgCo2eSeason),
    0.1,
  );

  const points = Array.from({ length: SAMPLES }, (_, i) => {
    const t = tLeft + (span * i) / (SAMPLES - 1);
    const v = carbonAt(t, plantedAt, props.totalKgCo2eSeason);
    return {
      t,
      v,
      x: PAD_L + (PLOT_W * i) / (SAMPLES - 1),
      y: PAD_T + PLOT_H * (1 - v / yMax),
    };
  });

  const baselineY = PAD_T + PLOT_H;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;

  const first = points[0];
  const last = points[points.length - 1];
  const hovered = hover !== null ? points[hover] : null;

  const endLabelX = Math.min(Math.max(last.x - 4, PAD_L + 4), W - PAD_R - 4);
  const endLabelY = Math.min(last.y - 12, baselineY - 14);
  const endLabelAnchor = last.x > PAD_L + PLOT_W * 0.55 ? "end" : "start";

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = Math.round(frac * (SAMPLES - 1));
    setHover(i);
  }

  const leftIsPlant = Math.abs(tLeft - plantedAt) < DAY_MS;
  const leftAxis = leftIsPlant
    ? `${fmtDate(tLeft)} · planted`
    : `${fmtDate(tLeft)} · −${rangeDef.label}`;
  const rightAxis =
    offsetDays !== 0
      ? `${fmtDate(tRight)} · now (+${offsetDays}d)`
      : `${fmtDate(tRight)} · now`;

  return (
    <div className="card">
      <h2>Your carbon progress</h2>
      <p className="muted">
        Past → present (left → right). Chips zoom how far back from now. Advance DevTools
        time to pretend you&apos;ve been growing for weeks or months.
      </p>
      <div className="row">
        {RANGES.map((r) => (
          <span
            key={r.id}
            className={`chip ${range === r.id ? "on" : ""}`}
            onClick={() => {
              setRange(r.id);
              setHover(null);
            }}
          >
            {r.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + PLOT_H * (1 - f)}
            y2={PAD_T + PLOT_H * (1 - f)}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        ))}

        <text
          x={PAD_L - 6}
          y={PAD_T + 4}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize={9}
        >
          {yMax.toFixed(1)} kg
        </text>
        <text
          x={PAD_L - 6}
          y={baselineY + 3}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize={9}
        >
          0 kg
        </text>

        <path d={areaPath} fill="hsl(var(--palette-leaf))" opacity={0.2} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--palette-leaf))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <circle
          cx={first.x}
          cy={first.y}
          r={3.5}
          fill="hsl(var(--palette-leaf))"
          stroke="hsl(var(--foreground))"
          strokeWidth={1.5}
        />
        <circle
          cx={last.x}
          cy={last.y}
          r={4}
          fill="hsl(var(--palette-leaf))"
          stroke="hsl(var(--foreground))"
          strokeWidth={1.5}
        />
        <text
          x={PAD_L + 4}
          y={Math.min(first.y - 12, baselineY - 14)}
          textAnchor="start"
          fontSize={11}
          fontWeight={600}
          fill="hsl(var(--foreground))"
        >
          {first.v.toFixed(1)} kg
        </text>
        <text
          x={endLabelX}
          y={endLabelY}
          textAnchor={endLabelAnchor}
          fontSize={11}
          fontWeight={600}
          fill="hsl(var(--foreground))"
        >
          {last.v.toFixed(1)} kg
        </text>

        <text x={PAD_L} y={H - 8} fill="hsl(var(--muted-foreground))" fontSize={9}>
          {leftAxis}
        </text>
        <text
          x={W - PAD_R}
          y={H - 8}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize={9}
        >
          {rightAxis}
        </text>

        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_T}
              y2={baselineY}
              stroke="hsl(var(--palette-sage))"
              strokeWidth={1}
            />
            <circle
              cx={hovered.x}
              cy={hovered.y}
              r={4}
              fill="hsl(var(--palette-leaf))"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
            />
          </>
        )}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hovered && (
        <p className="tiny">
          {fmtDate(hovered.t)} · <b>{hovered.v.toFixed(1)} kg CO₂e</b> saved so far
        </p>
      )}
    </div>
  );
}
