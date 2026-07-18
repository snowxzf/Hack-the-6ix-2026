import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { optimizeGarden } from "../../optimizer/src/index";
import type {
  GardenGrid,
  OptimizerResponse,
  Preferences,
  SkillTier,
  Target,
} from "../../optimizer/src/index";
import { GridView, cellKey, speciesColor } from "./GridView";
import {
  DAYS_TO_HARVEST,
  FAKE_WEATHER_ALERT,
  getCatalog,
  measureYardFromTaps,
  scanPhotoToGarden,
} from "./placeholders";
import type { ScanDiagnostics } from "../../yard-scan/src/index";
import { COIN_LABELS, SCAN_UX } from "../../yard-scan/src/index";
import type { Point2, ReferenceKind, ScaleReferenceMode } from "../../yard-scan/src/index";

type Step = "scan" | "review" | "prefs" | "select" | "results" | "dashboard";
const STEPS: [Step, string][] = [
  ["scan", "1. Scan"],
  ["review", "2. Review"],
  ["prefs", "3. Preferences"],
  ["select", "4. Space"],
  ["results", "5. Layout"],
  ["dashboard", "6. Garden"],
];

const CATALOG = getCatalog();
const byId = new Map(CATALOG.map((s) => [s.id, s]));
const nameOf = (id: string) => byId.get(id)?.name ?? id;

export function App() {
  const [step, setStep] = useState<Step>("scan");
  const [photo, setPhoto] = useState<string | null>(null);
  const [garden, setGarden] = useState<GardenGrid | null>(null);
  const [scanInfo, setScanInfo] = useState<ScanDiagnostics | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<Preferences>({ tier: "beginner", categories: [] });
  const [targets, setTargets] = useState<Target[]>([]);
  const [carbonWeight, setCarbonWeight] = useState(0.5);
  const [banned, setBanned] = useState<string[]>([]);
  const [result, setResult] = useState<OptimizerResponse | null>(null);

  const paintableKeys = useMemo(() => {
    if (!garden) return [];
    return garden.cells
      .filter((c) => c.state === "selected" || c.state === "obstacle_movable")
      .map((c) => cellKey(c.r, c.c));
  }, [garden]);

  function applyGarden(g: GardenGrid, diagnostics: ScanDiagnostics | null) {
    setGarden(g);
    setScanInfo(diagnostics);
    setSelected(
      new Set(
        g.cells
          .filter((c) => c.state === "selected" || c.state === "obstacle_movable")
          .map((c) => cellKey(c.r, c.c)),
      ),
    );
    setStep("review");
  }

  function doDemoScan() {
    applyGarden(scanPhotoToGarden(photo), null);
  }

  /** The user's selection shrinks the garden: unselected plantable cells are
   *  simply omitted from the request (contract: missing cell = unusable). */
  function requestGarden(): GardenGrid {
    const g = garden!;
    return {
      ...g,
      cells: g.cells.filter((c) => {
        const paintable = c.state === "selected" || c.state === "obstacle_movable";
        return !paintable || selected.has(cellKey(c.r, c.c));
      }),
    };
  }

  function run(bannedList: string[], targetsList: Target[] = targets) {
    const res = optimizeGarden({
      garden: requestGarden(),
      preferences: prefs,
      targets: targetsList.filter((t) => t.min > 0),
      carbonWeight,
      catalog: CATALOG.filter((s) => !bannedList.includes(s.id)),
    });
    setResult(res);
  }

  /** Applying a swap = ban the old species AND promise its freed area to the
   *  new one (as a hard target) — otherwise greedy refill may hand the space
   *  to something with worse carbon and the counter would drop on screen. */
  function applySwap(outId: string, inId: string) {
    if (!result) return;
    const area = (id: string) => {
      const s = byId.get(id)!;
      return s.cellsPerPlant[0] * s.cellsPerPlant[1];
    };
    const freed = (result.counts[outId] ?? 0) * area(outId);
    const extra = Math.max(1, Math.floor(freed / area(inId)));
    const wanted = (result.counts[inId] ?? 0) + extra;
    const nextTargets = [
      ...targets.filter((t) => t.speciesId !== inId && t.speciesId !== outId),
      { speciesId: inId, min: Math.max(wanted, targets.find((t) => t.speciesId === inId)?.min ?? 0) },
    ];
    const nextBanned = [...banned, outId];
    setTargets(nextTargets);
    setBanned(nextBanned);
    run(nextBanned, nextTargets);
  }

  function resetAll() {
    setStep("scan");
    setPhoto(null);
    setGarden(null);
    setScanInfo(null);
    setSelected(new Set());
    setTargets([]);
    setBanned([]);
    setResult(null);
  }

  return (
    <div>
      <h1>PlotTwist 🌱</h1>
      <p className="muted">Your garden, optimized — with a twist.</p>
      <div className="steps">
        {STEPS.map(([id, label]) => (
          <span key={id} className={id === step ? "on" : ""}>
            {label}
          </span>
        ))}
      </div>

      {step === "scan" && (
        <ScanScreen
          photo={photo}
          setPhoto={setPhoto}
          onMeasured={(g, d) => applyGarden(g, d)}
          onDemo={doDemoScan}
        />
      )}
      {step === "review" && garden && (
        <ReviewScreen
          garden={garden}
          scanInfo={scanInfo}
          setGarden={setGarden}
          selected={selected}
          setSelected={setSelected}
          onNext={() => setStep("prefs")}
        />
      )}
      {step === "prefs" && (
        <PrefsScreen
          prefs={prefs}
          setPrefs={setPrefs}
          targets={targets}
          setTargets={setTargets}
          carbonWeight={carbonWeight}
          setCarbonWeight={setCarbonWeight}
          onNext={() => setStep("select")}
        />
      )}
      {step === "select" && garden && (
        <SelectScreen
          garden={garden}
          selected={selected}
          setSelected={setSelected}
          paintableKeys={paintableKeys}
          onNext={() => {
            setBanned([]);
            run([]);
            setStep("results");
          }}
          onBack={() => setStep("prefs")}
        />
      )}
      {step === "results" && garden && result && (
        <ResultsScreen
          garden={requestGarden()}
          result={result}
          onSwap={applySwap}
          onTweak={() => setStep("select")}
          onConfirm={() => setStep("dashboard")}
        />
      )}
      {step === "dashboard" && result && (
        <DashboardScreen result={result} onReset={resetAll} />
      )}
    </div>
  );
}

/* ─────────────── 1. Scan (yard-scan: coin or custom reference) ─────────────── */

function ScanScreen(props: {
  photo: string | null;
  setPhoto: (p: string | null) => void;
  onMeasured: (g: GardenGrid, d: ScanDiagnostics) => void;
  onDemo: () => void;
}) {
  const [mode, setMode] = useState<ScaleReferenceMode>("coin");
  const [coinKind, setCoinKind] = useState<Exclude<ReferenceKind, "custom">>("cad_quarter");
  const [customSizeCm, setCustomSizeCm] = useState(8.56); // credit-card width default
  const [customLabel, setCustomLabel] = useState("credit card");
  const [tapPhase, setTapPhase] = useState<"reference" | "bed">("reference");
  const [refTaps, setRefTaps] = useState<Point2[]>([]);
  const [bedCorners, setBedCorners] = useState<Point2[]>([]);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetMarks() {
    setRefTaps([]);
    setBedCorners([]);
    setTapPhase("reference");
    setError(null);
  }

  function onPhotoClick(e: MouseEvent<HTMLDivElement>) {
    if (!props.photo || !imgSize) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * imgSize.w;
    const y = ((e.clientY - rect.top) / rect.height) * imgSize.h;
    const pt = { x, y };

    if (tapPhase === "reference") {
      const next = [...refTaps, pt].slice(0, 2);
      setRefTaps(next);
      if (next.length === 2) setTapPhase("bed");
    } else {
      setBedCorners((c) => [...c, pt]);
    }
  }

  function measure() {
    setError(null);
    if (!imgSize || refTaps.length < 2 || bedCorners.length < 3) {
      setError("Tap both edges of your reference, then at least 3 bed corners.");
      return;
    }
    try {
      const result = measureYardFromTaps({
        imageWidthPx: imgSize.w,
        imageHeightPx: imgSize.h,
        referenceEdgeA: refTaps[0]!,
        referenceEdgeB: refTaps[1]!,
        bedCorners,
        mode,
        coinKind,
        customSizeCm,
        customLabel,
      });
      props.onMeasured(result.garden, result.diagnostics);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const coinOptions = Object.entries(COIN_LABELS) as [
    Exclude<ReferenceKind, "custom">,
    string,
  ][];

  return (
    <div className="card">
      <h2>Scan your garden</h2>
      <p className="muted">
        Upload a photo, mark a scale reference, then tap the corners of your bed.
        We convert pixels → real size → a 30 cm planting grid.
      </p>

      <div className="row">
        <span
          className={`chip ${mode === "coin" ? "on" : ""}`}
          onClick={() => {
            setMode("coin");
            resetMarks();
          }}
        >
          Coin (recommended)
        </span>
        <span
          className={`chip ${mode === "custom_object" ? "on" : ""}`}
          onClick={() => {
            setMode("custom_object");
            resetMarks();
          }}
        >
          Custom object
        </span>
      </div>

      {mode === "coin" ? (
        <>
          <p className="muted">{SCAN_UX.placeCoin}</p>
          <div className="row">
            <label className="tiny">Coin type</label>
            <select
              value={coinKind}
              onChange={(e) =>
                setCoinKind(e.target.value as Exclude<ReferenceKind, "custom">)
              }
            >
              {coinOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{SCAN_UX.placeCustom}</p>
          <div className="row">
            <input
              type="text"
              placeholder="Object name"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              style={{ flex: 1, minWidth: 120 }}
            />
            <input
              type="number"
              min={0.5}
              step={0.1}
              value={customSizeCm}
              onChange={(e) => setCustomSizeCm(Number(e.target.value))}
              title="Width in cm"
            />
            <span className="tiny">cm wide</span>
          </div>
        </>
      )}

      <div className="row">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            props.setPhoto(f ? URL.createObjectURL(f) : null);
            resetMarks();
            setImgSize(null);
          }}
        />
      </div>

      {props.photo && (
        <>
          <p className="tiny">
            Phase:{" "}
            <b>{tapPhase === "reference" ? "1) Tap both edges of reference" : "2) Tap bed corners"}</b>
            {" · "}
            ref {refTaps.length}/2 · corners {bedCorners.length}
          </p>
          <div className="photo-stage" onClick={onPhotoClick}>
            <img
              className="photo"
              src={props.photo}
              alt="your yard"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
            {imgSize &&
              refTaps.map((p, i) => (
                <span
                  key={`r${i}`}
                  className="mark ref"
                  style={{
                    left: `${(p.x / imgSize.w) * 100}%`,
                    top: `${(p.y / imgSize.h) * 100}%`,
                  }}
                />
              ))}
            {imgSize && refTaps.length === 2 && (
              <svg className="mark-lines" viewBox={`0 0 ${imgSize.w} ${imgSize.h}`} preserveAspectRatio="none">
                <line
                  x1={refTaps[0]!.x}
                  y1={refTaps[0]!.y}
                  x2={refTaps[1]!.x}
                  y2={refTaps[1]!.y}
                  stroke="#7fe89a"
                  strokeWidth={Math.max(2, imgSize.w / 400)}
                />
              </svg>
            )}
            {imgSize &&
              bedCorners.map((p, i) => (
                <span
                  key={`b${i}`}
                  className="mark bed"
                  style={{
                    left: `${(p.x / imgSize.w) * 100}%`,
                    top: `${(p.y / imgSize.h) * 100}%`,
                  }}
                >
                  {i + 1}
                </span>
              ))}
          </div>
        </>
      )}

      {error && <p className="tiny" style={{ color: "#f0b4b4" }}>{error}</p>}

      <div className="row">
        <button
          disabled={!props.photo || refTaps.length < 2 || bedCorners.length < 3}
          onClick={measure}
        >
          Measure yard →
        </button>
        <button className="secondary small" onClick={resetMarks} disabled={!props.photo}>
          Clear marks
        </button>
      </div>
      <div className="row">
        <button className="secondary" onClick={props.onDemo}>
          Skip — use demo yard →
        </button>
      </div>
      <p className="tiny">
        Coin path is recommended (known diameter). Custom objects work if you type the
        real width carefully. Phone tilt correction runs in yard-scan (web demo uses a
        mild default pitch).
      </p>
    </div>
  );
}

/* ─────────────── 2. Review detected plants ─────────────── */

function ReviewScreen(props: {
  garden: GardenGrid;
  scanInfo: ScanDiagnostics | null;
  setGarden: (g: GardenGrid) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onNext: () => void;
}) {
  const { garden, scanInfo } = props;
  const existing = garden.existing ?? [];

  function removeExisting(idx: number) {
    const target = existing[idx];
    const k = cellKey(target.cell[0], target.cell[1]);
    props.setGarden({
      ...garden,
      cells: garden.cells.map((c) =>
        cellKey(c.r, c.c) === k ? { ...c, state: "selected" as const } : c,
      ),
      existing: existing.filter((_, i) => i !== idx),
    });
    props.setSelected(new Set(props.selected).add(k));
  }

  function renameExisting(idx: number, speciesId: string) {
    props.setGarden({
      ...garden,
      existing: existing.map((e, i) => (i === idx ? { ...e, speciesId } : e)),
    });
  }

  return (
    <>
      <div className="card">
        <h2>Here's your yard</h2>
        {scanInfo ? (
          <p className="muted">
            Measured ~{scanInfo.widthCm} × {scanInfo.heightCm} cm ({scanInfo.areaM2} m²)
            using{" "}
            {scanInfo.scale.referenceMode === "coin"
              ? `coin (${scanInfo.scale.reference})`
              : scanInfo.scale.referenceLabel || "custom object"}
            . Gray path / bike / flowers only appear on the demo yard.
          </p>
        ) : (
          <p className="muted">
            Gray = path (can't plant). 🚲 = movable obstacle. 🌸 = plants we detected.
          </p>
        )}
        <GridView garden={garden} />
      </div>
      <div className="card">
        <h2>Detected plants — did we get it right?</h2>
        {existing.length === 0 && <p className="muted">Nothing detected (or all removed).</p>}
        {existing.map((e, i) => (
          <div className="row spread" key={`${e.cell[0]}-${e.cell[1]}`}>
            <span style={{ fontSize: 14 }}>
              🌸 row {e.cell[0] + 1}, col {e.cell[1] + 1}
              <span className="tiny"> {Math.round((e.confidence ?? 0) * 100)}% sure</span>
            </span>
            <span className="row">
              <select value={e.speciesId} onChange={(ev) => renameExisting(i, ev.target.value)}>
                {CATALOG.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button className="small secondary" onClick={() => removeExisting(i)}>
                ✕ not a plant
              </button>
            </span>
          </div>
        ))}
        <div className="row">
          <button onClick={props.onNext}>Looks right →</button>
        </div>
      </div>
    </>
  );
}

/* ─────────────── 3. Preferences ─────────────── */

function PrefsScreen(props: {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
  targets: Target[];
  setTargets: (t: Target[]) => void;
  carbonWeight: number;
  setCarbonWeight: (n: number) => void;
  onNext: () => void;
}) {
  const categories = [...new Set(CATALOG.map((s) => s.category))];
  const tiers: [SkillTier, string][] = [
    ["beginner", "🌱 Beginner — pick vibes, we pick plants"],
    ["intermediate", "🪴 Intermediate — I know my plants"],
    ["advanced", "🧑‍🌾 Advanced — give me everything"],
  ];

  return (
    <>
      <div className="card">
        <h2>How much of a gardener are you?</h2>
        {tiers.map(([tier, label]) => (
          <label className="opt" key={tier}>
            <input
              type="radio"
              checked={props.prefs.tier === tier}
              onChange={() => props.setPrefs({ ...props.prefs, tier })}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="card">
        <h2>What do you want to grow?</h2>
        <p className="muted">Pick any — leave empty for "surprise me".</p>
        <div className="row">
          {categories.map((cat) => {
            const on = props.prefs.categories.includes(cat);
            return (
              <span
                key={cat}
                className={`chip ${on ? "on" : ""}`}
                onClick={() =>
                  props.setPrefs({
                    ...props.prefs,
                    categories: on
                      ? props.prefs.categories.filter((c) => c !== cat)
                      : [...props.prefs.categories, cat],
                  })
                }
              >
                {cat}
              </span>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Must-haves</h2>
        <p className="muted">Hard minimums — the optimizer treats these as promises.</p>
        {props.targets.map((t, i) => (
          <div className="row" key={i}>
            <select
              value={t.speciesId}
              onChange={(e) =>
                props.setTargets(
                  props.targets.map((x, j) => (j === i ? { ...x, speciesId: e.target.value } : x)),
                )
              }
            >
              {CATALOG.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.cellsPerPlant[0]}×{s.cellsPerPlant[1]})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={t.min}
              onChange={(e) =>
                props.setTargets(
                  props.targets.map((x, j) =>
                    j === i ? { ...x, min: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <button
              className="small secondary"
              onClick={() => props.setTargets(props.targets.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="small secondary"
          onClick={() =>
            props.setTargets([...props.targets, { speciesId: CATALOG[0].id, min: 1 }])
          }
        >
          + Add a must-have
        </button>
      </div>

      <div className="card">
        <h2>How much should carbon impact matter?</h2>
        <div className="row">
          <span className="tiny">just vibes</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(props.carbonWeight * 100)}
            onChange={(e) => props.setCarbonWeight(Number(e.target.value) / 100)}
            style={{ flex: 1 }}
          />
          <span className="tiny">max climate</span>
        </div>
      </div>

      <button onClick={props.onNext}>Choose planting space →</button>
    </>
  );
}

/* ─────────────── 4. Select space ─────────────── */

function SelectScreen(props: {
  garden: GardenGrid;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  paintableKeys: string[];
  onNext: () => void;
  onBack: () => void;
}) {
  const m2 = (props.selected.size * 0.09).toFixed(1);
  return (
    <>
      <div className="card">
        <h2>Where can we plant?</h2>
        <p className="muted">
          Drag to paint the area you're giving us. Dashed cells are opted out.
        </p>
        <GridView
          garden={props.garden}
          selected={props.selected}
          onPaint={(k, adding) => {
            const next = new Set(props.selected);
            if (adding) next.add(k);
            else next.delete(k);
            props.setSelected(next);
          }}
        />
        <div className="row spread">
          <span className="muted">
            {props.selected.size} cells (~{m2} m²)
          </span>
          <span className="row">
            <button
              className="small secondary"
              onClick={() => props.setSelected(new Set(props.paintableKeys))}
            >
              Select all
            </button>
            <button className="small secondary" onClick={() => props.setSelected(new Set())}>
              Clear
            </button>
          </span>
        </div>
      </div>
      <div className="row">
        <button className="secondary" onClick={props.onBack}>
          ← Back
        </button>
        <button disabled={props.selected.size === 0} onClick={props.onNext}>
          Optimize my garden ✨
        </button>
      </div>
    </>
  );
}

/* ─────────────── 5. Results / layout playground ─────────────── */

function ResultsScreen(props: {
  garden: GardenGrid;
  result: OptimizerResponse;
  onSwap: (out: string, inId: string) => void;
  onTweak: () => void;
  onConfirm: () => void;
}) {
  const { result } = props;
  const total = result.placements.length;
  const [reveal, setReveal] = useState(0);

  useEffect(() => {
    setReveal(0);
    const iv = setInterval(() => {
      setReveal((r) => {
        if (r >= total) {
          clearInterval(iv);
          return r;
        }
        return r + 1;
      });
    }, 80);
    return () => clearInterval(iv);
  }, [result, total]);

  const frac = total === 0 ? 1 : Math.min(1, reveal / total);
  const speciesIds = result.beds.map((b) => b.speciesId);

  return (
    <>
      {!result.feasible && (
        <div className="card warn">
          <h2>Plot twist 🌀</h2>
          {result.conflicts.map((c, i) => (
            <p className="muted" key={i}>
              {c.message}
            </p>
          ))}
          {result.compromise && (
            <p className="muted">
              Compromise applied:{" "}
              {Object.entries(result.compromise.original)
                .map(
                  ([id, n]) =>
                    `${nameOf(id)} ${n} → ${result.compromise!.applied[id] ?? 0}`,
                )
                .join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Your optimized layout</h2>
        <GridView garden={props.garden} placements={result.placements} reveal={reveal} />
        <div className="legend">
          {speciesIds.map((id) => (
            <span className="item" key={id}>
              <span className="dot" style={{ background: speciesColor(id) }} />
              {nameOf(id)} ×{result.counts[id]}
            </span>
          ))}
          {result.existingBeds.map((b) => (
            <span className="item" key={b.speciesId}>
              🌸 {nameOf(b.speciesId)} ×{b.count} (already yours)
            </span>
          ))}
        </div>
        <div className="row">
          <div className="stat">
            <b>{(result.carbon.kgCo2eSeason * frac).toFixed(1)}</b>
            <span>kg CO₂e saved / season</span>
          </div>
          <div className="stat">
            <b>{(result.carbon.kmDrivingEquiv * frac).toFixed(0)}</b>
            <span>km of driving</span>
          </div>
          <div className="stat">
            <b>{(result.carbon.foodKgPerSeason * frac).toFixed(1)}</b>
            <span>kg food grown</span>
          </div>
        </div>
        <p className="tiny">
          {Math.round(result.stats.utilization * 100)}% of your space used · solved in{" "}
          {result.stats.solveMs} ms
        </p>
      </div>

      {result.swaps.length > 0 && (
        <div className="card info">
          <h2>Greener swaps 🌍</h2>
          {result.swaps.map((s) => (
            <div className="row spread" key={s.out}>
              <span style={{ fontSize: 13.5 }}>
                {nameOf(s.out)} → <b>{nameOf(s.in)}</b>
                <span className="tiny"> +{s.deltaKgCo2e} kg CO₂e</span>
              </span>
              <button className="small" onClick={() => props.onSwap(s.out, s.in)}>
                Swap
              </button>
            </div>
          ))}
        </div>
      )}

      {result.tasks.length > 0 && (
        <div className="card">
          <h2>Before you plant</h2>
          <ul className="clean">
            {result.tasks.map((t, i) => (
              <li key={i}>☐ {t.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="row">
        <button className="secondary" onClick={props.onTweak}>
          ← Tweak space
        </button>
        <button onClick={props.onConfirm}>Confirm my garden ✓</button>
      </div>
    </>
  );
}

/* ─────────────── 6. Dashboard ─────────────── */

function DashboardScreen(props: { result: OptimizerResponse; onReset: () => void }) {
  const { result } = props;
  const planted = Object.entries(result.counts).filter(([, n]) => n > 0);

  const trips = new Map<number, string[]>();
  for (const [id] of planted) {
    const s = byId.get(id);
    if (!s) continue;
    trips.set(s.waterEveryDays, [...(trips.get(s.waterEveryDays) ?? []), s.name]);
  }

  return (
    <>
      <div className="card warn">
        <h2>{FAKE_WEATHER_ALERT.title}</h2>
        <p className="muted">{FAKE_WEATHER_ALERT.advice}</p>
        <p className="tiny">⚠ PLACEHOLDER: live Open-Meteo forecast pending.</p>
      </div>

      <div className="card">
        <h2>Watering trips 🚿</h2>
        <p className="muted">Beds that drink together sit together — one trip each.</p>
        <ul className="clean">
          {[...trips.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([days, names]) => (
              <li key={days}>
                <b>Every {days} day{days > 1 ? "s" : ""}:</b> {names.join(", ")}
              </li>
            ))}
        </ul>
      </div>

      <div className="card">
        <h2>Your plants</h2>
        {planted.map(([id, n]) => {
          const s = byId.get(id);
          if (!s) return null;
          const harvest = DAYS_TO_HARVEST[s.category] ?? 60;
          return (
            <div key={id} style={{ margin: "10px 0" }}>
              <div className="row spread">
                <span>
                  <span className="dot" style={{ background: speciesColor(id), marginRight: 6 }} />
                  {s.name} ×{n}
                </span>
                <span className="tiny">
                  water every {s.waterEveryDays}d ·{" "}
                  {s.yieldKgPerSeason > 0 ? `~${harvest}d to harvest` : "ornamental"}
                </span>
              </div>
              <div className="bar">
                <div style={{ width: "4%" }} />
              </div>
              <span className="tiny">Day 0 — planted today 🌱</span>
            </div>
          );
        })}
      </div>

      <button className="secondary" onClick={props.onReset}>
        ↺ Start over
      </button>
    </>
  );
}
