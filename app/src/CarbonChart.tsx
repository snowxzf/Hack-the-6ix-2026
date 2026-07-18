import { useState } from "react";

/**
 * Modeled carbon-savings trend — not real historical tracking. The optimizer
 * only produces a single season-end total (no day-by-day snapshots exist),
 * so this assumes a linear ramp from 0 at plantedAt to the season total over
 * SEASON_MS. Swap for real deltas once /gardens snapshots are saved over time.
 */
const SEASON_MS = 90 * 24 * 60 * 60 * 1000;

type RangeId = "1d" | "1w" | "1m" | "6m" | "1y";
const RANGES: { id: RangeId; label: string; ms: number }[] = [
  { id: "1d", label: "1d", ms: 1 * 24 * 60 * 60 * 1000 },
  { id: "1w", label: "1w", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "1m", label: "1m", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "6m", label: "6m", ms: 182 * 24 * 60 * 60 * 1000 },
  { id: "1y", label: "1y", ms: 365 * 24 * 60 * 60 * 1000 },
];

function carbonAt(t: number, plantedAt: number, totalKg: number): number {
  const frac = Math.min(1, Math.max(0, (t - plantedAt) / SEASON_MS));
  return totalKg * frac;
}

const W = 320;
const H = 160;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 16;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const SAMPLES = 48;

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function CarbonChart(props: { plantedAt: number; totalKgCo2eSeason: number }) {
  const [range, setRange] = useState<RangeId>("1m");
  const [hover, setHover] = useState<number | null>(null);

  const now = Date.now();
  const rangeMs = RANGES.find((r) => r.id === range)!.ms;
  const windowStart = Math.max(props.plantedAt, now - rangeMs);
  const yMax = Math.max(props.totalKgCo2eSeason, 0.1);

  const points = Array.from({ length: SAMPLES }, (_, i) => {
    const t = windowStart + ((now - windowStart) * i) / (SAMPLES - 1);
    const v = carbonAt(t, props.plantedAt, props.totalKgCo2eSeason);
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

  const last = points[points.length - 1];
  const hovered = hover !== null ? points[hover] : null;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = Math.round(frac * (SAMPLES - 1));
    setHover(i);
  }

  return (
    <div className="card">
      <h2>🌍 Carbon saved over time</h2>
      <p className="muted">Modeled from your season total — not a live day-by-day log yet.</p>
      <div className="row">
        {RANGES.map((r) => (
          <span
            key={r.id}
            className={`chip ${range === r.id ? "on" : ""}`}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      >
        {/* gridlines: 0%, 50%, 100% of season total */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + PLOT_H * (1 - f)}
            y2={PAD_T + PLOT_H * (1 - f)}
            stroke="#263229"
            strokeWidth={1}
          />
        ))}
        <text x={PAD_L} y={PAD_T - 5} className="tiny" fill="#6f8377" fontSize={9}>
          {yMax.toFixed(1)} kg
        </text>
        <text x={PAD_L} y={baselineY + 12} className="tiny" fill="#6f8377" fontSize={9}>
          0 kg
        </text>

        <path d={areaPath} fill="#4ade80" opacity={0.14} stroke="none" />
        <path d={linePath} fill="none" stroke="#4ade80" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* endpoint marker + direct label (current total) */}
        <circle cx={last.x} cy={last.y} r={4} fill="#4ade80" stroke="#171f1a" strokeWidth={2} />
        <text
          x={Math.min(last.x, W - 46)}
          y={Math.max(last.y - 10, PAD_T + 8)}
          fontSize={11}
          fontWeight={700}
          fill="#e8f0ea"
        >
          {last.v.toFixed(1)} kg
        </text>

        {/* x-axis endpoints */}
        <text x={PAD_L} y={H - 4} className="tiny" fill="#6f8377" fontSize={9}>
          {fmtDate(windowStart)}
        </text>
        <text x={W - PAD_R} y={H - 4} textAnchor="end" className="tiny" fill="#6f8377" fontSize={9}>
          {fmtDate(now)}
        </text>

        {/* hover layer */}
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_T}
              y2={baselineY}
              stroke="#4c7a58"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill="#4ade80" stroke="#171f1a" strokeWidth={2} />
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
