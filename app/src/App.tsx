import { useEffect, useMemo, useRef, useState } from "react";
import { optimizeGarden } from "../../optimizer/src/index";
import type {
  GardenGrid,
  OptimizerResponse,
  Preferences,
  SkillTier,
  Target,
} from "../../optimizer/src/index";
import { GridView, cellKey, speciesColor } from "./GridView";
import { CarbonChart } from "./CarbonChart";
import {
  DAYS_TO_HARVEST,
  FAKE_WEATHER_ALERT,
  getCatalog,
  scanPhotoToGarden,
} from "./placeholders";

/** Only the first-time setup flow. Once onboarded, "prefs"/"select"/"results"
 *  are reused as the Planner tab's sub-view instead of a linear step. */
type Step = "scan" | "review" | "prefs" | "select" | "results";
type Tab = "dashboard" | "planner";

const STEPS: [Step, string][] = [
  ["scan", "1. Scan"],
  ["review", "2. Review"],
  ["prefs", "3. Preferences"],
  ["select", "4. Space"],
  ["results", "5. Layout"],
];

const CATALOG = getCatalog();
const byId = new Map(CATALOG.map((s) => [s.id, s]));
const nameOf = (id: string) => byId.get(id)?.name ?? id;

/** Everything needed to resume mid-flow after a refresh. `photo` is
 *  deliberately excluded — it's a blob: URL that's invalidated once the
 *  page unloads, so persisting it would just point at a dead image. */
interface SwapSnapshot {
  targets: Target[];
  banned: string[];
}

interface PersistedState {
  step: Step;
  onboarded: boolean;
  activeTab: Tab;
  editingLayout: boolean;
  garden: GardenGrid | null;
  selected: string[];
  prefs: Preferences;
  targets: Target[];
  carbonWeight: number;
  banned: string[];
  swapHistory: SwapSnapshot[];
  result: OptimizerResponse | null;
  /** Set once, the first time a garden is confirmed — never touched by later
   *  edits, so the carbon-savings chart has a stable start date to ramp from. */
  plantedAt: number | null;
}

// Bumped from v1: Step dropped "dashboard" and onboarded/activeTab were added
// when the app moved from a single linear flow to a post-onboarding tab shell.
const STORAGE_KEY = "plottwist:v2";

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null; // corrupted or unavailable storage — start fresh
  }
}

export function App() {
  const saved = useRef(loadPersisted()).current;

  const [step, setStep] = useState<Step>(saved?.step ?? "scan");
  const [onboarded, setOnboarded] = useState(saved?.onboarded ?? false);
  const [activeTab, setActiveTab] = useState<Tab>(saved?.activeTab ?? "dashboard");
  // Only meaningful once onboarded: false = just viewing the confirmed layout
  // in the Planner tab (only "Edit" makes sense); true = mid-edit, having
  // clicked Edit and walked back through prefs/space (Tweak/Confirm apply).
  const [editingLayout, setEditingLayout] = useState(saved?.editingLayout ?? false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [garden, setGarden] = useState<GardenGrid | null>(saved?.garden ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set(saved?.selected ?? []));
  const [prefs, setPrefs] = useState<Preferences>(
    saved?.prefs ?? { tier: "beginner", categories: [] },
  );
  const [targets, setTargets] = useState<Target[]>(saved?.targets ?? []);
  const [carbonWeight, setCarbonWeight] = useState(saved?.carbonWeight ?? 0.5);
  const [banned, setBanned] = useState<string[]>(saved?.banned ?? []);
  const [swapHistory, setSwapHistory] = useState<SwapSnapshot[]>(saved?.swapHistory ?? []);
  const [result, setResult] = useState<OptimizerResponse | null>(saved?.result ?? null);
  const [plantedAt, setPlantedAt] = useState<number | null>(saved?.plantedAt ?? null);

  useEffect(() => {
    const toSave: PersistedState = {
      step,
      onboarded,
      activeTab,
      editingLayout,
      garden,
      selected: [...selected],
      prefs,
      targets,
      carbonWeight,
      banned,
      swapHistory,
      result,
      plantedAt,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // best-effort — quota errors or disabled storage shouldn't break the app
    }
  }, [
    step,
    onboarded,
    activeTab,
    editingLayout,
    garden,
    selected,
    prefs,
    targets,
    carbonWeight,
    banned,
    swapHistory,
    result,
    plantedAt,
  ]);

  const paintableKeys = useMemo(() => {
    if (!garden) return [];
    return garden.cells
      .filter((c) => c.state === "selected" || c.state === "obstacle_movable")
      .map((c) => cellKey(c.r, c.c));
  }, [garden]);

  function doScan() {
    const g = scanPhotoToGarden(photo);
    setGarden(g);
    setSelected(
      new Set(
        g.cells
          .filter((c) => c.state === "selected" || c.state === "obstacle_movable")
          .map((c) => cellKey(c.r, c.c)),
      ),
    );
    setStep("review");
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
    setSwapHistory([...swapHistory, { targets, banned }]);
    setTargets(nextTargets);
    setBanned(nextBanned);
    run(nextBanned, nextTargets);
  }

  function undoSwap() {
    const prev = swapHistory[swapHistory.length - 1];
    if (!prev) return;
    setSwapHistory(swapHistory.slice(0, -1));
    setTargets(prev.targets);
    setBanned(prev.banned);
    run(prev.banned, prev.targets);
  }

  const showPlanner = !onboarded || activeTab === "planner";

  return (
    <div style={{ paddingBottom: onboarded ? 56 : 0 }}>
      <h1>PlotTwist 🌱</h1>
      <p className="muted">Your garden, optimized — with a twist.</p>

      {(!onboarded || editingLayout) && (
        <div className="steps">
          {STEPS.map(([id, label]) => (
            <span key={id} className={id === step ? "on" : ""}>
              {label}
            </span>
          ))}
        </div>
      )}

      {showPlanner && (
        <>
          {step === "scan" && (
            <ScanScreen
              photo={photo}
              setPhoto={setPhoto}
              onScan={doScan}
              onSkip={editingLayout && garden ? () => setStep("review") : undefined}
            />
          )}
          {step === "review" && garden && (
            <ReviewScreen
              garden={garden}
              setGarden={setGarden}
              selected={selected}
              setSelected={setSelected}
              onNext={() => setStep("prefs")}
              skippable={editingLayout}
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
              skippable={editingLayout}
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
                setSwapHistory([]);
                run([]);
                setStep("results");
              }}
              onBack={() => setStep("prefs")}
              skippable={editingLayout}
            />
          )}
          {step === "results" && garden && result && (
            <ResultsScreen
              garden={requestGarden()}
              result={result}
              onSwap={applySwap}
              onUndoSwap={swapHistory.length > 0 ? undoSwap : undefined}
              onEdit={
                onboarded && !editingLayout
                  ? () => {
                      setEditingLayout(true);
                      setStep("scan");
                    }
                  : undefined
              }
              onTweak={!onboarded || editingLayout ? () => setStep("select") : undefined}
              onConfirm={
                !onboarded || editingLayout
                  ? () => {
                      setOnboarded(true);
                      setEditingLayout(false);
                      setActiveTab("dashboard");
                      setPlantedAt((prev) => prev ?? Date.now());
                    }
                  : undefined
              }
            />
          )}
        </>
      )}

      {onboarded && activeTab === "dashboard" && result && (
        <DashboardScreen result={result} plantedAt={plantedAt} />
      )}

      {onboarded && (
        <TabBar
          active={activeTab}
          onSelect={setActiveTab}
        />
      )}
    </div>
  );
}

function TabBar(props: { active: Tab; onSelect: (t: Tab) => void }) {
  const tabs: [Tab, string][] = [
    ["dashboard", "🏡 Dashboard"],
    ["planner", "🛠 Garden Planner"],
  ];
  return (
    <nav className="tabbar">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          className={id === props.active ? "on" : ""}
          onClick={() => props.onSelect(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/* ─────────────── 1. Scan (CV placeholder) ─────────────── */

function ScanScreen(props: {
  photo: string | null;
  setPhoto: (p: string | null) => void;
  onScan: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="card">
      <h2>Scan your garden</h2>
      <p className="muted">
        Take or upload a photo of your yard. We map it onto a 30 cm grid and
        detect what's already growing.
      </p>
      <div className="row">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            props.setPhoto(f ? URL.createObjectURL(f) : null);
          }}
        />
      </div>
      {props.photo && <img className="photo" src={props.photo} alt="your yard" />}
      <div className="row">
        <button onClick={props.onScan}>
          {props.photo ? "Scan this photo →" : "No photo? Use the demo yard →"}
        </button>
        {props.onSkip && (
          <button className="secondary" onClick={props.onSkip}>
            Skip → keep current yard
          </button>
        )}
      </div>
      <p className="tiny">
        ⚠ PLACEHOLDER: photo → grid CV pipeline is Jessica's; every photo currently
        becomes the demo backyard (stone path, bike, three lilies).
      </p>
    </div>
  );
}

/* ─────────────── 2. Review detected plants ─────────────── */

function ReviewScreen(props: {
  garden: GardenGrid;
  setGarden: (g: GardenGrid) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onNext: () => void;
  skippable?: boolean;
}) {
  const { garden } = props;
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
        <p className="muted">
          Gray = path (can't plant). 🚲 = movable obstacle. 🌸 = plants we detected.
        </p>
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
          {props.skippable && (
            <button className="secondary" onClick={props.onNext}>
              Skip → keep as detected
            </button>
          )}
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
  skippable?: boolean;
}) {
  const categories = [...new Set(CATALOG.map((s) => s.category))];
  const tiers: [SkillTier, string][] = [
    ["beginner", "🌱 Beginner — pick vibes, we pick plants"],
    ["intermediate", "🪴 Intermediate — I know my plants"],
    ["advanced", "🧑‍🌾 Advanced — give me everything"],
  ];

  const isBeginner = props.prefs.tier === "beginner";

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

      {isBeginner ? <BeginnerVibes prefs={props.prefs} setPrefs={props.setPrefs} /> : (
        <>
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
                      props.targets.map((x, j) =>
                        j === i ? { ...x, speciesId: e.target.value } : x,
                      ),
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
        </>
      )}

      <div className="row">
        <button onClick={props.onNext}>Choose planting space →</button>
        {props.skippable && (
          <button className="secondary" onClick={props.onNext}>
            Skip → keep preferences
          </button>
        )}
      </div>
    </>
  );
}

/** Beginner goal cards — replaces the chip/must-have/carbon-slider UI with a
 *  single pick. Maps each vibe to categories the optimizer already understands.
 *  NOTE: "Low effort" is approximated via category (herbs/flowers tend to be
 *  lower-maintenance) since the catalog has no hardiness/effort field yet —
 *  swap this mapping out once that field exists. */
function BeginnerVibes(props: {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
}) {
  const goals: { emoji: string; label: string; categories: string[] }[] = [
    { emoji: "🍅", label: "Feed me (easy edibles)", categories: ["veggies", "fruit", "herbs"] },
    { emoji: "🌸", label: "Make it pretty (flowers)", categories: ["flowers"] },
    { emoji: "🐝", label: "Help the bees (pollinators)", categories: ["pollinator"] },
    { emoji: "🪴", label: "Low effort (hardy stuff)", categories: ["herbs", "flowers"] },
  ];

  const current = props.prefs.categories;
  const isActive = (cats: string[]) =>
    cats.length === current.length && cats.every((c) => current.includes(c));

  return (
    <div className="card">
      <h2>What's the vibe?</h2>
      <p className="muted">Pick one — we'll handle the species picking.</p>
      <div className="row">
        {goals.map((g) => (
          <span
            key={g.label}
            className={`chip ${isActive(g.categories) ? "on" : ""}`}
            style={{ fontSize: 14, padding: "10px 14px" }}
            onClick={() => props.setPrefs({ ...props.prefs, categories: g.categories })}
          >
            {g.emoji} {g.label}
          </span>
        ))}
      </div>
    </div>
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
  skippable?: boolean;
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
        {props.skippable && (
          <button className="secondary" onClick={props.onNext}>
            Skip → keep painted area
          </button>
        )}
      </div>
    </>
  );
}

/* ─────────────── 5. Results / layout playground ─────────────── */

function ResultsScreen(props: {
  garden: GardenGrid;
  result: OptimizerResponse;
  onSwap: (out: string, inId: string) => void;
  onUndoSwap?: () => void;
  onEdit?: () => void;
  onTweak?: () => void;
  onConfirm?: () => void;
}) {
  const { result } = props;
  const total = result.placements.length;
  const [reveal, setReveal] = useState(0);

  // 80ms/bed reads nicely for small gardens, but scales past ~40 beds
  // (90 beds ≈ 7s) — scale the interval down so the whole reveal caps at ~3s.
  const REVEAL_CAP_MS = 3000;
  const MIN_INTERVAL_MS = 10;

  useEffect(() => {
    setReveal(0);
    const interval =
      total > 0 ? Math.max(MIN_INTERVAL_MS, Math.min(80, REVEAL_CAP_MS / total)) : 80;
    const iv = setInterval(() => {
      setReveal((r) => {
        if (r >= total) {
          clearInterval(iv);
          return r;
        }
        return r + 1;
      });
    }, interval);
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

      {props.onUndoSwap && (
        <div className="row">
          <button className="small secondary" onClick={props.onUndoSwap}>
            ↩ Undo last swap
          </button>
        </div>
      )}

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
        {props.onEdit && (
          <button className="secondary" onClick={props.onEdit}>
            ✏️ Edit my garden
          </button>
        )}
        {props.onTweak && (
          <button className="secondary" onClick={props.onTweak}>
            ← Tweak space
          </button>
        )}
        {props.onConfirm && <button onClick={props.onConfirm}>Confirm my garden ✓</button>}
      </div>
    </>
  );
}

/* ─────────────── 6. Dashboard ─────────────── */

function DashboardScreen(props: { result: OptimizerResponse; plantedAt: number | null }) {
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

      {props.plantedAt && (
        <CarbonChart plantedAt={props.plantedAt} totalKgCo2eSeason={result.carbon.kgCo2eSeason} />
      )}

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
    </>
  );
}
