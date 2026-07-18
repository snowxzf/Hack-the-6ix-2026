import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { advanceDevClock, resetDevClock, useDevClock } from "./devClock";
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
import {
  API_URL,
  fetchFoodWasteImpact,
  fetchLiveCatalog,
  fetchSuggestions,
  fetchWeather,
  identifyPlant,
  localFoodWasteImpact,
  saveGardenToCloud,
  type IdentifyCandidate,
  type IdentifyResult,
  type Suggestion,
  type WeatherData,
} from "./api";

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

/** Catalog starts as the bundled mock so first render is instant and the app
 *  works fully offline; App upgrades these module bindings in place from
 *  GET /plants once the backend answers (a state bump forces the re-render,
 *  and nameOf/byId read the current binding at call time). */
let CATALOG = getCatalog();
let byId = new Map(CATALOG.map((s) => [s.id, s]));
const nameOf = (id: string) => byId.get(id)?.name ?? id;

interface SwapSnapshot {
  targets: Target[];
  banned: string[];
}

/** One user-owned garden, fully self-contained: its own layout, preferences,
 *  optimizer result, and planted date. The working copy (App's garden/prefs/
 *  targets/... state) always mirrors whichever SavedGarden is active — think
 *  of `gardens` as commits and the working copy as the checked-out one. */
interface SavedGarden {
  id: string;
  name: string;
  createdAt: number;
  garden: GardenGrid;
  selected: string[];
  prefs: Preferences;
  targets: Target[];
  carbonWeight: number;
  banned: string[];
  swapHistory: SwapSnapshot[];
  result: OptimizerResponse | null;
  /** Set once, the first time this garden is confirmed — never touched by
   *  later edits, so the carbon-savings chart has a stable start date to
   *  ramp from. */
  plantedAt: number | null;
  cloudId: string | null;
}

/** Everything needed to resume mid-flow after a refresh. `photo` and
 *  `scanInfo` are deliberately excluded — `photo` is a blob: URL that's
 *  invalidated once the page unloads, and `scanInfo` is diagnostics tied to
 *  that same ephemeral photo, so persisting either would be meaningless. */
interface PersistedState {
  gardens: SavedGarden[];
  /** null while the working copy is a brand-new, not-yet-confirmed garden
   *  (nothing to write back to) — matches a SavedGarden.id once confirmed. */
  activeGardenId: string | null;
  activeTab: Tab;
  step: Step;
  editingLayout: boolean;
  draftName: string;
  garden: GardenGrid | null;
  selected: string[];
  prefs: Preferences;
  targets: Target[];
  carbonWeight: number;
  banned: string[];
  swapHistory: SwapSnapshot[];
  result: OptimizerResponse | null;
  plantedAt: number | null;
  cloudId: string | null;
}

// Bumped from v2: single-garden fields (onboarded, the working state) split
// into a `gardens[]` library + one working copy that mirrors whichever
// garden is active, so a user can create and switch between multiple gardens.
const STORAGE_KEY = "plottwist:v3";

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

  const [gardens, setGardens] = useState<SavedGarden[]>(saved?.gardens ?? []);
  const [activeGardenId, setActiveGardenId] = useState<string | null>(
    saved?.activeGardenId ?? null,
  );
  // "Onboarded" now just means at least one garden has ever been confirmed —
  // no separate flag to drift out of sync with the gardens list.
  const onboarded = gardens.length > 0;

  const [step, setStep] = useState<Step>(saved?.step ?? "scan");
  const [activeTab, setActiveTab] = useState<Tab>(saved?.activeTab ?? "dashboard");
  // Only meaningful once onboarded: false = just viewing the active garden's
  // confirmed layout (only "Edit" makes sense); true = mid-flow, either
  // creating a brand-new garden or walking an existing one back through
  // prefs/space (Tweak/Confirm apply).
  const [editingLayout, setEditingLayout] = useState(saved?.editingLayout ?? false);
  const [draftName, setDraftName] = useState(saved?.draftName ?? "My Garden");
  const [photo, setPhoto] = useState<string | null>(null);
  const [garden, setGarden] = useState<GardenGrid | null>(saved?.garden ?? null);
  const [scanInfo, setScanInfo] = useState<ScanDiagnostics | null>(null);
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
  const [cloudId, setCloudId] = useState<string | null>(saved?.cloudId ?? null);
  const [catalogSource, setCatalogSource] = useState<"demo" | "live">("demo");
  const [catalogCount, setCatalogCount] = useState(CATALOG.length);

  // Upgrade the bundled catalog to the backend's curated one when reachable.
  useEffect(() => {
    fetchLiveCatalog().then((live) => {
      if (!live) return; // offline — stay on the bundled demo catalog
      CATALOG = live;
      byId = new Map(live.map((s) => [s.id, s]));
      setCatalogSource("live");
      setCatalogCount(live.length);
    });
  }, []);

  /** Keeps gardens[activeGardenId] mirroring the working copy live — the app
   *  has never had an explicit "save" step (everything just persists as you
   *  go), so a swap applied in plain view mode or a mid-edit change should
   *  land in the saved library the same way it always landed in localStorage.
   *  Skipped while activeGardenId is null: a brand-new garden only joins the
   *  library at "Confirm my garden", same as onboarding always worked. */
  useEffect(() => {
    if (!activeGardenId || !garden) return;
    setGardens((gs) =>
      gs.map((g) =>
        g.id === activeGardenId
          ? {
              ...g,
              garden,
              selected: [...selected],
              prefs,
              targets,
              carbonWeight,
              banned,
              swapHistory,
              result,
              plantedAt,
              cloudId,
            }
          : g,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeGardenId,
    garden,
    selected,
    prefs,
    targets,
    carbonWeight,
    banned,
    swapHistory,
    result,
    plantedAt,
    cloudId,
  ]);

  useEffect(() => {
    const toSave: PersistedState = {
      gardens,
      activeGardenId,
      activeTab,
      step,
      editingLayout,
      draftName,
      garden,
      selected: [...selected],
      prefs,
      targets,
      carbonWeight,
      banned,
      swapHistory,
      result,
      plantedAt,
      cloudId,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // best-effort — quota errors or disabled storage shouldn't break the app
    }
  }, [
    gardens,
    activeGardenId,
    activeTab,
    step,
    editingLayout,
    draftName,
    garden,
    selected,
    prefs,
    targets,
    carbonWeight,
    banned,
    swapHistory,
    result,
    plantedAt,
    cloudId,
  ]);

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

  /** Load a saved garden into the working copy — the Dashboard's garden
   *  dropdown only ever appears in plain view mode (never mid-edit, since
   *  editing keeps activeTab pinned to "planner"), so there's never an
   *  in-progress draft to lose here. */
  /** Loads a saved garden's data into the working copy — the shared core of
   *  switchGarden() and "delete the active garden, fall back to another". */
  function loadGarden(g: SavedGarden) {
    setActiveGardenId(g.id);
    setGarden(g.garden);
    setSelected(new Set(g.selected));
    setPrefs(g.prefs);
    setTargets(g.targets);
    setCarbonWeight(g.carbonWeight);
    setBanned(g.banned);
    setSwapHistory(g.swapHistory);
    setResult(g.result);
    setPlantedAt(g.plantedAt);
    setCloudId(g.cloudId);
    setPhoto(null);
    setScanInfo(null);
    setStep("results");
    setEditingLayout(false);
  }

  /** Blanks the working copy with activeGardenId = null — the shared core of
   *  startNewGarden() and "delete the last remaining garden". */
  function resetWorkingCopy() {
    setActiveGardenId(null);
    setGarden(null);
    setSelected(new Set());
    setPrefs({ tier: "beginner", categories: [] });
    setTargets([]);
    setCarbonWeight(0.5);
    setBanned([]);
    setSwapHistory([]);
    setResult(null);
    setPlantedAt(null);
    setCloudId(null);
    setPhoto(null);
    setScanInfo(null);
  }

  /** The Dashboard's garden dropdown only ever appears in plain view mode
   *  (never mid-edit, since editing keeps activeTab pinned to "planner"), so
   *  there's never an in-progress draft to lose here. */
  function switchGarden(id: string) {
    const g = gardens.find((x) => x.id === id);
    if (g) loadGarden(g);
  }

  /** Starts a fresh onboarding flow for an additional garden, without
   *  touching any already-saved one. It only joins `gardens` at Confirm —
   *  same rule as the very first garden ever onboarded. */
  function startNewGarden() {
    // No window.prompt() here on purpose — it's a blocking synchronous
    // dialog that embedded webviews (VS Code preview, some in-app browsers)
    // silently suppress, which made this button look broken. Auto-name
    // instead; the name is editable via the "Garden name" field on screen.
    resetWorkingCopy();
    setDraftName(`Garden ${gardens.length + 1}`);
    setStep("scan");
    setEditingLayout(true);
    setActiveTab("planner");
  }

  function renameGarden(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGardens((gs) => gs.map((g) => (g.id === id ? { ...g, name: trimmed } : g)));
  }

  /** Deleting the active garden falls back to another saved one, or — if it
   *  was the last one — drops back to the pre-onboarding first-run flow. */
  function deleteGarden(id: string) {
    const remaining = gardens.filter((g) => g.id !== id);
    setGardens(remaining);
    if (id !== activeGardenId) return;
    if (remaining.length > 0) {
      loadGarden(remaining[0]);
    } else {
      resetWorkingCopy();
      setStep("scan");
      setEditingLayout(false);
      setActiveTab("dashboard");
    }
  }

  /** Hard reset for testing: wipes persisted state and reloads, so the app
   *  comes up exactly as it would for a brand-new user. Restarting the
   *  garden itself is handled by "Edit my garden" in the Planner tab, which
   *  walks back through scan/review/prefs/space while keeping existing data
   *  to tweak — this is the dev-only full wipe instead. */
  function hardResetApp() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort — if storage is unavailable there's nothing to clear
    }
    resetDevClock();
    window.location.reload();
  }

  const showPlanner = !onboarded || activeTab === "planner";
  // Whichever garden the working copy currently reflects — an existing
  // one's saved name, or the in-progress name for a not-yet-confirmed one.
  // Shown on every screen (Dashboard + all Planner steps) so it's always
  // clear which garden is on screen.
  const currentGardenName = activeGardenId
    ? (gardens.find((g) => g.id === activeGardenId)?.name ?? draftName)
    : draftName;

  return (
    <div style={{ paddingBottom: onboarded ? 56 : 0 }}>
      <DevTools onRestart={hardResetApp} />
      <h1>PlotTwist 🌱</h1>
      <p className="muted">Your garden, optimized — with a twist.</p>
      {(onboarded || editingLayout) && (
        <p className="tiny">🌱 Garden: <b>{currentGardenName}</b></p>
      )}
      <p className="tiny">
        {catalogSource === "live"
          ? `☁ live catalog — ${catalogCount} plants · ${API_URL}`
          : `⚡ demo catalog — ${catalogCount} plants (backend not reachable)`}
      </p>

      {(!onboarded || editingLayout) && (
        <div className="steps">
          {STEPS.map(([id, label]) => (
            <span key={id} className={id === step ? "on" : ""}>
              {label}
            </span>
          ))}
        </div>
      )}

      {editingLayout && !activeGardenId && (
        <div className="row">
          <label className="tiny">Garden name</label>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            style={{ flex: 1, minWidth: 120 }}
          />
        </div>
      )}

      {showPlanner && (
        <>
          {step === "scan" && (
            <ScanScreen
              photo={photo}
              setPhoto={setPhoto}
              onMeasured={applyGarden}
              onDemo={doDemoScan}
              onSkip={editingLayout && garden ? () => setStep("review") : undefined}
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
          {step === "results" && garden && result && onboarded && !editingLayout && (
            <GardenSwitcher
              gardens={gardens}
              activeGardenId={activeGardenId}
              onSwitchGarden={switchGarden}
              onNewGarden={startNewGarden}
              onRenameGarden={renameGarden}
              onDeleteGarden={deleteGarden}
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
                      const effectivePlantedAt = plantedAt ?? Date.now();
                      if (!activeGardenId) {
                        // Brand-new garden — joins the library now, not before.
                        const id = crypto.randomUUID();
                        setGardens((gs) => [
                          ...gs,
                          {
                            id,
                            name: draftName.trim() || `Garden ${gs.length + 1}`,
                            createdAt: Date.now(),
                            garden: garden!,
                            selected: [...selected],
                            prefs,
                            targets,
                            carbonWeight,
                            banned,
                            swapHistory,
                            result,
                            plantedAt: effectivePlantedAt,
                            cloudId: null,
                          },
                        ]);
                        setActiveGardenId(id);
                      }
                      setPlantedAt(effectivePlantedAt);
                      setEditingLayout(false);
                      setActiveTab("dashboard");
                      // Cloud save is best-effort — the demo never blocks on it.
                      saveGardenToCloud({
                        garden: requestGarden(),
                        counts: result?.counts,
                        carbon: result?.carbon,
                        preferences: prefs,
                      }).then(setCloudId);
                    }
                  : undefined
              }
            />
          )}
        </>
      )}

      {onboarded && activeTab === "dashboard" && result && (
        <DashboardScreen
          result={result}
          plantedAt={plantedAt}
          cloudId={cloudId}
          gardens={gardens}
          activeGardenId={activeGardenId}
          onSwitchGarden={switchGarden}
          onNewGarden={startNewGarden}
          onRenameGarden={renameGarden}
          onDeleteGarden={deleteGarden}
        />
      )}

      {onboarded && <TabBar active={activeTab} onSelect={setActiveTab} />}
    </div>
  );
}

/** Dev-only corner widget — not part of the product flow. Lets us fast-forward
 *  the simulated clock (to watch carbon-saved and watering respond live) and
 *  wipe localStorage to test the first-time-use experience, without digging
 *  through browser devtools every time. */
function DevTools(props: { onRestart: () => void }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const { offsetDays } = useDevClock();
  return (
    <div className="devtools">
      <button
        className="devtools-toggle"
        onClick={() => {
          setOpen((o) => !o);
          setArmed(false);
        }}
        title="Developer tools"
      >
        🛠
      </button>
      {open && (
        <div className="devtools-panel">
          <p className="tiny">Dev tools</p>
          <p className="tiny">
            Simulated time: <b>{offsetDays === 0 ? "real time" : `+${offsetDays}d`}</b>
          </p>
          <div className="row" style={{ margin: "4px 0" }}>
            <button className="small secondary" onClick={() => advanceDevClock(1)}>
              +1 day
            </button>
            <button className="small secondary" onClick={() => advanceDevClock(7)}>
              +7 days
            </button>
            <button className="small secondary" onClick={() => advanceDevClock(30)}>
              +30 days
            </button>
          </div>
          <button
            className="small secondary"
            onClick={resetDevClock}
            disabled={offsetDays === 0}
          >
            ↺ Reset clock to real time
          </button>
          {/* Two-step "arm then confirm" instead of window.confirm() — some
              embedded webviews (VS Code preview, in-app browsers) silently
              swallow blocking dialogs, which made a confirm()-gated button
              look broken. */}
          {armed ? (
            <button className="small" onClick={props.onRestart}>
              ⚠ Click again to wipe everything
            </button>
          ) : (
            <button className="small secondary" onClick={() => setArmed(true)}>
              ↺ Restart app (first-time use)
            </button>
          )}
        </div>
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

/* ─────────────── 1. Scan (yard-scan: coin or custom reference) ─────────────── */

function ScanScreen(props: {
  photo: string | null;
  setPhoto: (p: string | null) => void;
  onMeasured: (g: GardenGrid, d: ScanDiagnostics) => void;
  onDemo: () => void;
  onSkip?: () => void;
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
        {props.onSkip && (
          <button className="secondary" onClick={props.onSkip}>
            Skip → keep current yard
          </button>
        )}
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
  skippable?: boolean;
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
          {props.skippable && (
            <button className="secondary" onClick={props.onNext}>
              Skip → keep as detected
            </button>
          )}
        </div>
      </div>

      <IdentifyCard />
    </>
  );
}

function identifyLabel(c: IdentifyCandidate): string {
  const pn = c.plantnet;
  const common = pn?.commonNames?.[0];
  const sci =
    pn?.scientificNameWithoutAuthor ?? pn?.scientificName ?? "Unknown plant";
  return common ? `${common} · ${sci}` : sci;
}

function confidencePct(score?: number): number | null {
  if (score == null || Number.isNaN(score)) return null;
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

/** PlantNet-powered close-up identification (backend /identify). */
function IdentifyCard() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onFile(file: File) {
    // Some mobile browsers leave type empty for camera captures — allow those through.
    if (file.type && !file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, or HEIC).");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    const outcome = await identifyPlant(file);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    if (!outcome.data.candidates?.length) {
      setError("No confident match — try a closer photo of a leaf or flower.");
      return;
    }
    setResult(outcome.data);
  }

  function clearIdentify() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setResult(null);
    setError(null);
  }

  const top =
    result?.bestMatch ??
    result?.candidates?.find((c) => c.catalogMatch) ??
    result?.candidates?.[0] ??
    null;
  const care = top?.catalogMatch ?? null;
  const others = (result?.candidates ?? []).filter((c) => c !== top).slice(0, 4);

  return (
    <div className="card" aria-busy={busy}>
      <h2>Identify a plant 📷</h2>
      <p className="muted">
        Take or upload a close-up of one plant. PlantNet names it; we match care tips from our catalog when we can.
      </p>
      <div className="row">
        <button
          type="button"
          className="secondary small"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          Take photo
        </button>
        <button
          type="button"
          className="secondary small"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Upload photo
        </button>
        {(preview || result || error) && (
          <button
            type="button"
            className="secondary small"
            disabled={busy}
            onClick={clearIdentify}
          >
            Clear
          </button>
        )}
        {/* capture=environment opens the rear camera on mobile browsers */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
      </div>

      {!preview && !busy && !error && (
        <p className="tiny" style={{ marginTop: 8 }}>
          Tip: fill the frame with one leaf or flower — blurry wide shots confuse PlantNet.
        </p>
      )}

      {preview && (
        <img
          className="photo"
          src={preview}
          alt="Plant to identify"
          style={{ opacity: busy ? 0.55 : 1, marginTop: 8 }}
        />
      )}
      {busy && (
        <p className="tiny" role="status" style={{ marginTop: 6 }}>
          Asking PlantNet… this can take up to ~30s on slow wifi.
        </p>
      )}
      {error && (
        <p className="identify-error" role="alert">
          {error}
        </p>
      )}

      {top && !busy && (
        <div className="identify-result">
          <div className="row spread" style={{ alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: "8px 0 2px" }}>
                {care?.name ?? identifyLabel(top)}
              </p>
              <p className="tiny">
                {top.plantnet?.scientificNameWithoutAuthor ??
                  top.plantnet?.scientificName ??
                  care?.scientificName ??
                  "—"}
                {top.plantnet?.commonNames?.[0]
                  ? ` · also called ${top.plantnet.commonNames[0]}`
                  : ""}
              </p>
            </div>
            {confidencePct(top.score) != null && (
              <span className="chip on" style={{ cursor: "default" }}>
                {confidencePct(top.score)}% sure
              </span>
            )}
          </div>

          {care ? (
            <>
              <p className="muted" style={{ marginTop: 8 }}>
                Matched catalog care for <b>{care.name}</b>
                {care.id ? ` (${care.id})` : ""}. Use the dropdown above if this is one of your detected plants.
              </p>
              <ul className="clean">
                {care.sun && (
                  <li>
                    <b>Sun:</b> {care.sun}
                  </li>
                )}
                {care.waterEveryDays != null && (
                  <li>
                    <b>Water:</b> every {care.waterEveryDays} day
                    {care.waterEveryDays === 1 ? "" : "s"}
                  </li>
                )}
                {care.heightCm != null && (
                  <li>
                    <b>Height:</b> ~{care.heightCm} cm
                  </li>
                )}
                {care.tempMinC != null && care.tempMaxC != null && (
                  <li>
                    <b>Temp:</b> {care.tempMinC}–{care.tempMaxC} °C
                  </li>
                )}
                {care.spacingCm != null && (
                  <li>
                    <b>Spacing:</b> ~{care.spacingCm} cm
                  </li>
                )}
                {care.daysToHarvest != null && (
                  <li>
                    <b>Harvest:</b> ~{care.daysToHarvest} days
                    {care.daysToHarvestMin != null && care.daysToHarvestMax != null
                      ? ` (range ${care.daysToHarvestMin}–${care.daysToHarvestMax})`
                      : ""}
                    {care.harvest?.plantSeasons?.length
                      ? ` · plant in ${care.harvest.plantSeasons.join(", ")}`
                      : ""}
                  </li>
                )}
                {care.harvest?.weatherNotes && (
                  <li>
                    <b>Weather:</b> {care.harvest.weatherNotes}
                  </li>
                )}
                {care.category && (
                  <li>
                    <b>Category:</b> {care.category}
                    {care.tier ? ` · ${care.tier}` : ""}
                  </li>
                )}
              </ul>
            </>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>
              Not in our curated catalog yet — PlantNet ID only. You can still rename a detected plant
              manually above.
            </p>
          )}

          {others.length > 0 && (
            <>
              <p className="tiny" style={{ marginTop: 10 }}>
                Other candidates
              </p>
              <ul className="clean">
                {others.map((c, i) => (
                  <li key={i}>
                    {identifyLabel(c)}
                    {confidencePct(c.score) != null ? (
                      <span className="tiny"> · {confidencePct(c.score)}%</span>
                    ) : null}
                    {c.catalogMatch?.name ? (
                      <span className="tiny"> · catalog: {c.catalogMatch.name}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
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

          <SuggestCard
            tier={props.prefs.tier}
            carbonWeight={props.carbonWeight}
            targets={props.targets}
            setTargets={props.setTargets}
          />

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


/** Location-aware picks from the backend's multi-factor ranker (/plants/suggest):
 *  season + live weather + carbon + native region + skill tier. Hidden offline. */
function SuggestCard(props: {
  tier: SkillTier;
  carbonWeight: number;
  targets: Target[];
  setTargets: (t: Target[]) => void;
}) {
  const [sugs, setSugs] = useState<Suggestion[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setSugs(undefined);
    fetchSuggestions(props.tier, props.carbonWeight).then((s) => {
      if (alive) setSugs(s);
    });
    return () => {
      alive = false;
    };
  }, [props.tier, props.carbonWeight]);

  if (sugs === undefined) {
    return (
      <div className="card info">
        <p className="tiny">✨ Ranking plants for Toronto's season + this week's weather…</p>
      </div>
    );
  }
  if (!sugs) return null; // backend offline — the card simply doesn't exist

  return (
    <div className="card info">
      <h2>Suggested for Toronto, right now ✨</h2>
      <p className="muted">
        Ranked live: season fit + this week's forecast + carbon + native region.
      </p>
      <div className="row">
        {sugs.map((s) => {
          const added = props.targets.some((t) => t.speciesId === s.species.id);
          return (
            <span
              key={s.species.id}
              className={`chip ${added ? "on" : ""}`}
              onClick={() => {
                if (added) return;
                props.setTargets([...props.targets, { speciesId: s.species.id, min: 1 }]);
              }}
            >
              {added ? "✓ " : "+ "}
              {s.species.name}
            </span>
          );
        })}
      </div>
      <p className="tiny">Tap to add as a must-have.</p>
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

/** Live Open-Meteo forecast + per-plant tolerance checks via backend /weather.
 *  Falls back to the canned storm alert when offline — the demo never breaks. */
function WeatherCard(props: { plantIds: string[] }) {
  const idsKey = props.plantIds.join(",");
  const [data, setData] = useState<WeatherData | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setData(undefined);
    fetchWeather(props.plantIds).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (data === undefined) {
    return (
      <div className="card">
        <p className="tiny">🌤 Checking the sky over Toronto…</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="card warn">
        <h2>{FAKE_WEATHER_ALERT.title}</h2>
        <p className="muted">{FAKE_WEATHER_ALERT.advice}</p>
        <p className="tiny">⚡ offline — demo forecast (live Open-Meteo unavailable)</p>
      </div>
    );
  }

  const notes = data.notifications ?? [];
  const week = (data.sky?.week ?? []).slice(0, 4);
  // Tolerance problems arrive nested under issues[]; flatten to messages.
  const warnings = (data.plantChecks ?? [])
    .filter((c) => !c.ok && c.type !== "unknown_plant")
    .flatMap((c) => (c.issues ?? []).map((i) => i.message))
    .filter(Boolean)
    .slice(0, 4);
  const dayName = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

  return (
    <div className={`card ${notes.length > 0 ? "warn" : ""}`}>
      <h2>{notes.length > 0 ? "Weather guard ⛈" : "Weather guard ☀"}</h2>
      {notes.length === 0 && (
        <p className="muted">All clear in Toronto for the next few days.</p>
      )}
      {notes.map((n, i) => (
        <p className="muted" key={i}>
          {n.type === "frost_warning" ? "🥶 " : n.type === "skip_watering" ? "💧 " : "⛈ "}
          {n.message}
        </p>
      ))}
      {warnings.map((msg, i) => (
        <p className="muted" key={`p${i}`}>
          🪴 {msg}
        </p>
      ))}
      {week.length > 0 && (
        <p className="tiny">
          {week
            .map(
              (d) =>
                `${dayName(d.date)} ${Math.round(d.tempMinC ?? 0)}–${Math.round(d.tempMaxC ?? 0)}°${
                  d.storm ? " ⛈" : (d.precipMm ?? 0) >= 2 ? " 🌧" : ""
                }`,
            )
            .join(" · ")}
          {" · live Open-Meteo"}
        </p>
      )}
    </div>
  );
}

/** Optimizer yield vs City of Toronto household food-waste audits. Numbers are
 *  computed locally (same constants as backend/food_waste_stats.py); the
 *  backend /impact/food-waste call just verifies parity when reachable. */
function FoodWasteCard(props: { foodKg: number; kgCo2e: number }) {
  const [liveChecked, setLiveChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchFoodWasteImpact(props.foodKg, props.kgCo2e).then((d) => {
      if (alive && d) setLiveChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [props.foodKg, props.kgCo2e]);

  if (props.foodKg <= 0) return null;
  const local = localFoodWasteImpact(props.foodKg);

  return (
    <div className="card info">
      <h2>Toronto impact 🥕</h2>
      <p className="muted">
        Growing <b>{props.foodKg.toFixed(1)} kg</b> of food covers{" "}
        <b>{local.percentOfFruitVegWaste}%</b> of the average Toronto household's yearly
        fruit &amp; veg waste (45 kg) — roughly <b>${local.dollarsSaved}</b> of groceries
        and <b>{local.greenBinKgAvoided} kg</b> kept out of the Green Bin.
      </p>
      <p className="tiny">
        City of Toronto single-family waste audits, 2017–2018
        {liveChecked ? " · ✓ verified against backend /impact/food-waste" : " · computed locally"}
      </p>
    </div>
  );
}

/* ─────────────── 6. Dashboard ─────────────── */

/** Switches, renames, creates, or deletes gardens. Shared by DashboardScreen
 *  and the Planner tab's plain view mode — both are "not mid-edit" contexts,
 *  the only ones where there's no in-progress draft a switch could clobber. */
function GardenSwitcher(props: {
  gardens: { id: string; name: string }[];
  activeGardenId: string | null;
  onSwitchGarden: (id: string) => void;
  onNewGarden: () => void;
  onRenameGarden: (id: string, name: string) => void;
  onDeleteGarden: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const activeGarden = props.gardens.find((g) => g.id === props.activeGardenId);

  return (
    <div className="card">
      <div className="row spread">
        <select
          value={props.activeGardenId ?? ""}
          onChange={(e) => {
            props.onSwitchGarden(e.target.value);
            setRenaming(false);
            setDeleteArmed(false);
          }}
          style={{ flex: 1 }}
        >
          {props.gardens.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button className="small secondary" onClick={props.onNewGarden}>
          + New garden
        </button>
      </div>

      {renaming ? (
        <div className="row" style={{ marginTop: 6 }}>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            style={{ flex: 1, minWidth: 100 }}
            autoFocus
          />
          <button
            className="small"
            onClick={() => {
              if (props.activeGardenId) props.onRenameGarden(props.activeGardenId, renameValue);
              setRenaming(false);
            }}
          >
            Save
          </button>
          <button className="small secondary" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="row" style={{ marginTop: 6 }}>
          <button
            className="small secondary"
            onClick={() => {
              setRenameValue(activeGarden?.name ?? "");
              setRenaming(true);
            }}
          >
            ✎ Rename
          </button>
          {/* Two-step arm/confirm instead of window.confirm() — see DevTools. */}
          {deleteArmed ? (
            <button
              className="small"
              onClick={() => props.activeGardenId && props.onDeleteGarden(props.activeGardenId)}
            >
              ⚠ Click again to delete "{activeGarden?.name}"
            </button>
          ) : (
            <button className="small secondary" onClick={() => setDeleteArmed(true)}>
              🗑 Delete garden
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardScreen(props: {
  result: OptimizerResponse;
  plantedAt: number | null;
  cloudId?: string | null;
  gardens: { id: string; name: string }[];
  activeGardenId: string | null;
  onSwitchGarden: (id: string) => void;
  onNewGarden: () => void;
  onRenameGarden: (id: string, name: string) => void;
  onDeleteGarden: (id: string) => void;
}) {
  const { result } = props;
  const planted = Object.entries(result.counts).filter(([, n]) => n > 0);
  const { now } = useDevClock();

  // Day 0 = planted today. Cadence "due" matches backend/simulation.py's
  // watering_due_on_day: nothing due on day 0 (just watered by definition),
  // then due every waterEveryDays days after.
  const daysSincePlanted = props.plantedAt
    ? Math.max(0, Math.floor((now - props.plantedAt) / (24 * 60 * 60 * 1000)))
    : 0;
  const isDueToday = (days: number) => daysSincePlanted > 0 && daysSincePlanted % days === 0;

  const trips = new Map<number, string[]>();
  for (const [id] of planted) {
    const s = byId.get(id);
    if (!s) continue;
    trips.set(s.waterEveryDays, [...(trips.get(s.waterEveryDays) ?? []), s.name]);
  }

  return (
    <>
      <GardenSwitcher
        gardens={props.gardens}
        activeGardenId={props.activeGardenId}
        onSwitchGarden={props.onSwitchGarden}
        onNewGarden={props.onNewGarden}
        onRenameGarden={props.onRenameGarden}
        onDeleteGarden={props.onDeleteGarden}
      />

      <WeatherCard plantIds={planted.map(([id]) => id)} />

      <FoodWasteCard
        foodKg={result.carbon.foodKgPerSeason}
        kgCo2e={result.carbon.kgCo2eSeason}
      />

      {props.cloudId && (
        <p className="tiny">☁ layout saved to cloud · id {props.cloudId}</p>
      )}

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
                {isDueToday(days) && <span className="tiny"> · 💧 due today (day {daysSincePlanted})</span>}
              </li>
            ))}
        </ul>
      </div>

      <div className="card">
        <h2>Your plants</h2>
        {planted.map(([id, n]) => {
          const s = byId.get(id);
          if (!s) return null;
          const harvest = s.daysToHarvest ?? DAYS_TO_HARVEST[s.category] ?? 60;
          const harvestRange =
            s.daysToHarvestMin != null && s.daysToHarvestMax != null
              ? ` (${s.daysToHarvestMin}–${s.daysToHarvestMax}d; weather can shift this)`
              : "";
          const progress = Math.min(1, daysSincePlanted / harvest);
          return (
            <div key={id} style={{ margin: "10px 0" }}>
              <div className="row spread">
                <span>
                  <span className="dot" style={{ background: speciesColor(id), marginRight: 6 }} />
                  {s.name} ×{n}
                </span>
                <span className="tiny">
                  water every {s.waterEveryDays}d ·{" "}
                  {s.yieldKgPerSeason > 0
                    ? `~${harvest}d to harvest${harvestRange}`
                    : "ornamental"}
                </span>
              </div>
              <div className="bar">
                <div style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
              <span className="tiny">
                {daysSincePlanted === 0
                  ? "Day 0 — planted today 🌱"
                  : s.yieldKgPerSeason > 0 && progress >= 1
                    ? `Day ${daysSincePlanted} — ready to harvest 🎉`
                    : `Day ${daysSincePlanted}${s.yieldKgPerSeason > 0 ? ` — ${Math.round(progress * 100)}% to harvest` : ""}`}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
