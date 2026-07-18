import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { optimizeGarden } from "../../optimizer/src/index";
import type {
  GardenGrid,
  OptimizerResponse,
  Preferences,
  SkillTier,
  Target,
} from "../../optimizer/src/index";
import { GridView, cellKey, speciesColor } from "./GridView";
import { PhotoGridOverlay, type ScanPhotoOverlay } from "./PhotoGridOverlay";
import { CarbonChart, carbonAt, SEASON_MS } from "./CarbonChart";
import { advanceDevClock, devNow, resetDevClock, useDevClock } from "./devClock";
import {
  DEV_WEATHER_OPTIONS,
  resetDevWeatherOverride,
  setDevWeatherOverride,
  useDevWeatherOverride,
} from "./devWeather";
import {
  CARBON_MILESTONE_KG,
  clampXpLoss,
  levelForXp,
  nextLevelForXp,
  STREAK_BONUSES,
  XP_CARBON_MILESTONE,
  XP_HARVEST,
  XP_MISSED_WATERING,
  XP_RESEED,
  XP_UNHARVESTED_WEEKLY,
  XP_WATER_PER_PLANT,
  type LevelInfo,
} from "./xp";
import {
  FAKE_WEATHER_ALERT,
  gardenFromRectangleCm,
  getCatalog,
  harvestDaysFor,
  harvestRangeLabel,
  measureYardFromFrames,
  measureYardFromTaps,
  scanPhotoToGarden,
} from "./placeholders";
import type { ScanDiagnostics } from "../../yard-scan/src/index";
import { COIN_LABELS, SCAN_UX, coinGhostForNextFrame } from "../../yard-scan/src/index";
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
  type SuggestPayload,
  type WeatherData,
} from "./api";
import { BottomNav, type AppTab } from "./components/BottomNav";
import { HomePanel } from "./components/HomePanel";
import { LearnPanel } from "./components/LearnPanel";
import { PlantIdentifyFlow } from "./components/PlantIdentifyFlow";
import { ProfilePanel } from "./components/ProfilePanel";
import { SearchPanel } from "./components/SearchPanel";
import { SpeciesSelectOptions } from "./components/SpeciesSelectOptions";
import { WeatherBackground } from "./components/WeatherBackground";
import { WeatherProvider } from "./components/WeatherProvider";
import { requestDeviceLocation } from "./lib/geo";
import { loadSavedPlants, mergeCatalogWithSaved } from "./lib/savedPlants";
import {
  syncGreenerSwapsFromCarbonInterest,
  useUserProfile,
} from "./lib/userProfile";

/** Only the first-time setup flow. Once onboarded, "prefs"/"select"/"results"
 *  are reused as the Planner tab's sub-view instead of a linear step. */
type Step = "scan" | "review" | "prefs" | "select" | "results";
type Tab = AppTab;

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
const nameOf = (id: string) => {
  const fromCatalog = byId.get(id)?.name;
  if (fromCatalog) return fromCatalog;
  const saved = loadSavedPlants().find((p) => p.speciesId === id);
  return saved?.commonName ?? id;
};

function refreshByIdFromCatalog() {
  const merged = mergeCatalogWithSaved(CATALOG);
  byId = new Map(merged.map((s) => [s.id, s]));
}

interface SwapSnapshot {
  targets: Target[];
  banned: string[];
}

/** One user-owned garden, fully self-contained: its own layout, preferences,
 *  optimizer result, and planted date. The working copy (App's garden/prefs/
 *  targets/... state) always mirrors whichever SavedGarden is active: think
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
  /** Set once, the first time this garden is confirmed: never touched by
   *  later edits, so the carbon-savings chart has a stable start date to
   *  ramp from. */
  plantedAt: number | null;
  cloudId: string | null;
  /** Individual planting units that have been harvested, keyed by
   *  cellKey(origin[r], origin[c]) of their PlacementInstance: each unit is
   *  its own spot in the grid, tracked independently so two same-species
   *  plants can be at different growth stages. An empty (harvested) spot
   *  stays visible in "Your plants" with a Reseed option. */
  harvestedUnits: string[];
  /** Per-unit "day 0" override set by Reseed, so a replanted spot's progress
   *  bar restarts independently of both the garden's plantedAt and every
   *  other unit of the same species. Absent = still on the garden's clock. */
  unitPlantedAt: Record<string, number>;
  /** Per-unit last confirmed-watering timestamp (via the "✓ I watered these"
   *  button). Once set, it becomes that unit's watering-cadence anchor going
   *  forward instead of plantedAt/unitPlantedAt — see xp system in README. */
  lastWateredAt: Record<string, number>;
}

/** Everything needed to resume mid-flow after a refresh. `photo` and
 *  `scanInfo` are deliberately excluded: `photo` is a blob: URL that's
 *  invalidated once the page unloads, and `scanInfo` is diagnostics tied to
 *  that same ephemeral photo, so persisting either would be meaningless. */
interface PersistedState {
  gardens: SavedGarden[];
  /** null while the working copy is a brand-new, not-yet-confirmed garden
   *  (nothing to write back to): matches a SavedGarden.id once confirmed. */
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
  harvestedUnits: string[];
  unitPlantedAt: Record<string, number>;
  lastWateredAt: Record<string, number>;
  /** XP/streak/level tracking — account-wide (spans every saved garden), not
   *  per-garden, since it's tracking the user's care habit, not one plot. */
  xp: number;
  streakDays: number;
  /** Last simulated day-index (devNow() / DAY_MS, floored) the daily XP tick
   *  (missed watering, unharvested weekly, streak) has processed through. */
  lastXpTickDay: number | null;
  /** How many 5kg-CO2e milestones have already paid out XP, across all
   *  gardens combined — prevents re-awarding the same milestone. */
  carbonMilestonesClaimed: number;
}

// Bumped from v2: single-garden fields (onboarded, the working state) split
// into a `gardens[]` library + one working copy that mirrors whichever
// garden is active, so a user can create and switch between multiple gardens.
const STORAGE_KEY = "plottwist:v3";
const DAY_MS = 24 * 60 * 60 * 1000;

/** A unit needs water once at least waterEveryDays have passed since its
 * anchor — and STAYS needing water every day after that (not just the one
 * exact day it first became due) until it's actually watered, which resets
 * the anchor and the countdown. Missing a watering doesn't make the button
 * disappear; it stays clickable/overdue until you act on it.
 * Anchor = lastWateredAt (once ever confirmed) else unitPlantedAt (once
 * reseeded) else the garden's own plantedAt. */
function isUnitDue(
  now: number,
  effectiveAnchor: number | null,
  waterEveryDays: number,
): boolean {
  if (!effectiveAnchor || waterEveryDays <= 0) return false;
  const days = Math.max(0, Math.floor((now - effectiveAnchor) / DAY_MS));
  return days >= waterEveryDays;
}

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null; // corrupted or unavailable storage: start fresh
  }
}

export function App() {
  const saved = useRef(loadPersisted()).current;

  const [gardens, setGardens] = useState<SavedGarden[]>(saved?.gardens ?? []);
  const [activeGardenId, setActiveGardenId] = useState<string | null>(
    saved?.activeGardenId ?? null,
 );
  // "Onboarded" now just means at least one garden has ever been confirmed : 
  // no separate flag to drift out of sync with the gardens list.
  const onboarded = gardens.length > 0;

  const [step, setStep] = useState<Step>(saved?.step ?? "scan");
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = saved?.activeTab as Tab | undefined;
    return t === "planner" ||
      t === "learn" ||
      t === "profile" ||
      t === "dashboard" ||
      t === "garden"
 ? t
 : "dashboard";
  });
  // Search is a full-screen overlay (Base44 /search), not a persisted tab.
  const [searchOpen, setSearchOpen] = useState(false);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  // Only meaningful once onboarded: false = just viewing the active garden's
  // confirmed layout (only "Edit" makes sense); true = mid-flow, either
  // creating a brand-new garden or walking an existing one back through
  // prefs/space (Tweak/Confirm apply).
  const [editingLayout, setEditingLayout] = useState(saved?.editingLayout ?? false);
  const [draftName, setDraftName] = useState(saved?.draftName ?? "My Garden");
  // Ephemeral (not persisted): which grid-click action, if any, is armed.
  // Lets the user tap multiple plants in a row without re-arming each time.
  const [clickMode, setClickMode] = useState<"harvest" | "reseed" | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [garden, setGarden] = useState<GardenGrid | null>(saved?.garden ?? null);
  const [scanInfo, setScanInfo] = useState<ScanDiagnostics | null>(null);
  const [scanOverlay, setScanOverlay] = useState<ScanPhotoOverlay | null>(null);
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
  const [harvestedUnits, setHarvestedUnits] = useState<string[]>(saved?.harvestedUnits ?? []);
  const [unitPlantedAt, setUnitPlantedAt] = useState<Record<string, number>>(
    saved?.unitPlantedAt ?? {},
  );
  const [lastWateredAt, setLastWateredAt] = useState<Record<string, number>>(
    saved?.lastWateredAt ?? {},
  );
  const [catalogSource, setCatalogSource] = useState<"demo" | "live">("demo");
  const [catalogCount, setCatalogCount] = useState(CATALOG.length);
  /** Which garden to restore if the user cancels "+ New garden" mid-flow. */
  const newGardenReturnIdRef = useRef<string | null>(null);

  // Account-wide XP/level/streak — see README "🎮 XP system".
  const [xp, setXp] = useState(saved?.xp ?? 0);
  const [streakDays, setStreakDays] = useState(saved?.streakDays ?? 0);
  const [lastXpTickDay, setLastXpTickDay] = useState<number | null>(
    saved?.lastXpTickDay ?? null,
  );
  const [carbonMilestonesClaimed, setCarbonMilestonesClaimed] = useState(
    saved?.carbonMilestonesClaimed ?? 0,
  );
  // Ephemeral (not persisted) — the level-up/streak popup, if one is showing.
  const [celebration, setCelebration] = useState<
    { kind: "level"; level: LevelInfo } | { kind: "streak"; days: number; bonus: number } | null
  >(null);
  const { now } = useDevClock();
  // Guard refs for the combined XP-tick effect below — synchronous (unlike
  // state) so a same-render duplicate call (React 18 StrictMode's dev-only
  // double-invocation of effects) sees the update from the first call and
  // no-ops instead of double-applying penalties/bonuses.
  const tickDayRef = useRef<number | null>(saved?.lastXpTickDay ?? null);
  const carbonMilestoneRef = useRef(saved?.carbonMilestonesClaimed ?? 0);
  const streakDaysRef = useRef(saved?.streakDays ?? 0);

  // Upgrade the bundled catalog to the backend's curated one when reachable.
  useEffect(() => {
    fetchLiveCatalog().then((live) => {
      if (!live) return; // offline: stay on the bundled demo catalog
      CATALOG = live;
      byId = new Map(live.map((s) => [s.id, s]));
      refreshByIdFromCatalog();
      setCatalogSource("live");
      setCatalogCount(live.length);
    });
  }, []);

  /** Keeps gardens[activeGardenId] mirroring the working copy live: the app
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
              harvestedUnits,
              unitPlantedAt,
              lastWateredAt,
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
    harvestedUnits,
    unitPlantedAt,
    lastWateredAt,
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
      harvestedUnits,
      unitPlantedAt,
      lastWateredAt,
      xp,
      streakDays,
      lastXpTickDay,
      carbonMilestonesClaimed,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // best-effort: quota errors or disabled storage shouldn't break the app
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
    harvestedUnits,
    unitPlantedAt,
    lastWateredAt,
    xp,
    streakDays,
    lastXpTickDay,
    carbonMilestonesClaimed,
  ]);

  /** (1) Pays out carbon-savings milestones as they're crossed — continuous,
   *  not day-gated. (2) Once per elapsed simulated day: missed-watering
   *  penalties, unharvested-weekly penalties, and streak advance/break.
   *  All land in one combined XP delta applied via a single setXp call —
   *  two separate effects each computing `xp + delta` from the same stale
   *  render closure would silently drop one delta when React coalesces
   *  same-commit setState calls to the same variable. */
  useEffect(() => {
    let xpDelta = 0;
    let celebrationCandidate: { kind: "streak"; days: number; bonus: number } | null = null;

    let totalCarbonSoFar = 0;
    for (const g of gardens) {
      if (!g.plantedAt || !g.result) continue;
      totalCarbonSoFar += carbonAt(now, g.plantedAt, g.result.carbon.kgCo2eSeason);
    }
    const milestonesReached = Math.floor(totalCarbonSoFar / CARBON_MILESTONE_KG);
    if (milestonesReached > carbonMilestoneRef.current) {
      xpDelta += (milestonesReached - carbonMilestoneRef.current) * XP_CARBON_MILESTONE;
      carbonMilestoneRef.current = milestonesReached;
      setCarbonMilestonesClaimed(milestonesReached);
    }

    const currentDay = Math.floor(now / DAY_MS);
    if (tickDayRef.current === null) {
      tickDayRef.current = currentDay;
    } else if (currentDay > tickDayRef.current) {
      const fromDay = tickDayRef.current;
      tickDayRef.current = currentDay;
      let streak = streakDaysRef.current;

      for (let d = fromDay + 1; d <= currentDay; d++) {
        let anyDueToday = false;
        let allConfirmed = true;
        for (const g of gardens) {
          if (!g.plantedAt || !g.result) continue;
          for (const p of g.result.placements) {
            const key = cellKey(p.origin[0], p.origin[1]);
            if (g.harvestedUnits.includes(key)) continue;
            const species = byId.get(p.speciesId);
            if (!species) continue;

            // Missed watering (−4): due on day d and never confirmed that day.
            if (species.waterEveryDays > 0) {
              const anchor = g.lastWateredAt[key] ?? g.unitPlantedAt[key] ?? g.plantedAt;
              const anchorDay = Math.floor(anchor / DAY_MS);
              if (d > anchorDay && (d - anchorDay) % species.waterEveryDays === 0) {
                anyDueToday = true;
                const wateredDay =
                  g.lastWateredAt[key] != null
                    ? Math.floor(g.lastWateredAt[key] / DAY_MS)
                    : null;
                if (wateredDay !== d) {
                  allConfirmed = false;
                  xpDelta += XP_MISSED_WATERING;
                }
              }
            }

            // Unharvested weekly (−2): food plant ready for 7+ days, then
            // again every 7 days until harvested. Ornamentals (null harvest
            // days) are skipped.
            const daysToHarvest = harvestDaysFor(species);
            if (daysToHarvest != null && daysToHarvest > 0) {
              const plantTs = g.unitPlantedAt[key] ?? g.plantedAt;
              const plantDay = Math.floor(plantTs / DAY_MS);
              const daysPastReady = d - (plantDay + daysToHarvest);
              if (daysPastReady >= 7 && daysPastReady % 7 === 0) {
                xpDelta += XP_UNHARVESTED_WEEKLY;
              }
            }
          }
        }
        if (anyDueToday) {
          if (allConfirmed) {
            streak += 1;
            const bonus = STREAK_BONUSES[streak];
            if (bonus) {
              xpDelta += bonus;
              celebrationCandidate = { kind: "streak", days: streak, bonus };
            }
          } else {
            streak = 0;
          }
        }
      }

      streakDaysRef.current = streak;
      setStreakDays(streak);
    }

    if (xpDelta !== 0) {
      setXp((x) => {
        const next = xpDelta >= 0 ? x + xpDelta : clampXpLoss(x, xpDelta);
        const prevLevel = levelForXp(x);
        const nextLevel = levelForXp(next);
        if (nextLevel.level > prevLevel.level) {
          setCelebration({ kind: "level", level: nextLevel });
        } else if (celebrationCandidate) {
          setCelebration(celebrationCandidate);
        }
        return next;
      });
    } else if (celebrationCandidate) {
      setCelebration(celebrationCandidate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, gardens]);

  const paintableKeys = useMemo(() => {
    if (!garden) return [];
    return garden.cells
 .filter((c) => c.state === "selected" || c.state === "obstacle_movable")
 .map((c) => cellKey(c.r, c.c));
  }, [garden]);

  function applyGarden(
    g: GardenGrid,
    diagnostics: ScanDiagnostics | null,
    overlay: ScanPhotoOverlay | null = null,
  ) {
    setGarden(g);
    setScanInfo(diagnostics);
    setScanOverlay(overlay);
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
    applyGarden(scanPhotoToGarden(photo), null, null);
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
    refreshByIdFromCatalog();
    const res = optimizeGarden({
      garden: requestGarden(),
      preferences: prefs,
      targets: targetsList.filter((t) => t.min > 0),
      carbonWeight,
      catalog: mergeCatalogWithSaved(CATALOG).filter((s) => !bannedList.includes(s.id)),
    });
    setResult(res);
  }

  /** Applying a swap = ban the old species AND promise its freed area to the
   *  new one (as a hard target): otherwise greedy refill may hand the space
   *  to something with worse carbon and the counter would drop on screen. */
  function applySwap(outId: string, inId: string) {
    if (!result) return;
    refreshByIdFromCatalog();
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

  /** After optimize: replace N units of one plant with as many of another as
   *  the freed cells allow (space conversion). Other plants stay locked. */
  function applySpaceReplace(outId: string, outUnits: number, inId: string) {
    if (!result || outId === inId) return;
    refreshByIdFromCatalog();
    const outS = byId.get(outId);
    const inS = byId.get(inId);
    if (!outS || !inS) return;

    const have = result.counts[outId] ?? 0;
    const replaceN = Math.max(1, Math.min(have, Math.floor(outUnits)));
    const outArea = outS.cellsPerPlant[0] * outS.cellsPerPlant[1];
    const inArea = inS.cellsPerPlant[0] * inS.cellsPerPlant[1];
    const freed = replaceN * outArea;
    const inGain = Math.floor(freed / inArea);
    if (inGain < 1) return;

    const nextOut = have - replaceN;
    const nextTargets: Target[] = [];
    for (const [id, count] of Object.entries(result.counts)) {
      if (id === outId || id === inId) continue;
      if ((count ?? 0) > 0) nextTargets.push({ speciesId: id, min: count });
    }
    if (nextOut > 0) nextTargets.push({ speciesId: outId, min: nextOut });
    nextTargets.push({
      speciesId: inId,
      min: (result.counts[inId] ?? 0) + inGain,
    });

    let nextBanned = banned.filter((b) => b !== inId);
    if (nextOut <= 0) nextBanned = [...nextBanned.filter((b) => b !== outId), outId];
    else nextBanned = nextBanned.filter((b) => b !== outId);

    setSwapHistory([...swapHistory, { targets, banned }]);
    setTargets(nextTargets);
    setBanned(nextBanned);
    run(nextBanned, nextTargets);
  }

  /** Loads a saved garden's data into the working copy: the shared core of
   *  switchGarden() and "delete the active garden, fall back to another".
   *  The Dashboard's garden dropdown only ever appears in plain view mode
   *  (never mid-edit, since editing keeps activeTab pinned to "planner"), so
   *  there's never an in-progress draft to lose here. */
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
    setHarvestedUnits(g.harvestedUnits ?? []);
    setUnitPlantedAt(g.unitPlantedAt ?? {});
    setLastWateredAt(g.lastWateredAt ?? {});
    setPhoto(null);
    setScanInfo(null);
    setStep("results");
    setEditingLayout(false);
    setClickMode(null);
  }

  /** Blanks the working copy with activeGardenId = null: the shared core of
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
    setHarvestedUnits([]);
    setUnitPlantedAt({});
    setLastWateredAt({});
    setPhoto(null);
    setScanInfo(null);
    setClickMode(null);
  }

  /** Applies an XP delta (positive or negative), clamping losses at the
   *  current level's floor, and arms the celebration popup on level-up.
   *  Reads `xp` from the render closure — fine for the single-call-per-click
   *  sites here, but callers that might award XP more than once per call
   *  (the daily tick) must total the delta themselves and call this once,
   *  not loop it, to avoid acting on a stale `xp`. */
  function addXp(delta: number) {
    const next = delta >= 0 ? xp + delta : clampXpLoss(xp, delta);
    const prevLevel = levelForXp(xp);
    const nextLevel = levelForXp(next);
    setXp(next);
    if (nextLevel.level > prevLevel.level) {
      setCelebration({ kind: "level", level: nextLevel });
    }
  }

  /** Harvest one specific planting unit (by its grid-origin key): leaves an
   *  empty, reseedable spot behind rather than just decrementing a count, so
   *  two same-species plants can be tracked (and shown) independently.
   *  Guarded on the current state (not just GridView's drag-dedup) so
   *  dragging back over an already-harvested unit mid-gesture can't double
   *  award XP. */
  function harvestUnit(unitKey: string) {
    if (harvestedUnits.includes(unitKey)) return;
    setHarvestedUnits((h) => [...h, unitKey]);
    addXp(XP_HARVEST);
  }

  /** Replant one empty unit: clears its harvested flag and restarts just
   *  that spot's progress clock from right now, independent of every other
   *  unit: including other plants of the same species. Same double-XP
   *  guard as harvestUnit. */
  function reseedUnit(unitKey: string) {
    if (!harvestedUnits.includes(unitKey)) return;
    setHarvestedUnits((h) => h.filter((k) => k !== unitKey));
    setUnitPlantedAt((r) => ({ ...r, [unitKey]: devNow() }));
    addXp(XP_RESEED);
  }

  /** Marks one specific planting unit as watered right now — the + button
   *  next to its bar in "Your plants". Always available (not gated behind
   *  the due-today check, so it's never invisible/confusing to find); stamps
   *  lastWateredAt, which becomes that unit's cadence anchor going forward,
   *  and awards XP for the single plant. */
  function waterUnit(unitKey: string) {
    setLastWateredAt((w) => ({ ...w, [unitKey]: devNow() }));
    addXp(XP_WATER_PER_PLANT);
  }

  /** Grid-click dispatch while a mode is armed: GridView already restricts
   *  which cells are clickable per mode (harvest = grown, reseed = empty),
   *  so this just routes to the matching action. */
  function handleUnitClick(unitKey: string) {
    if (clickMode === "harvest") harvestUnit(unitKey);
    else if (clickMode === "reseed") reseedUnit(unitKey);
  }

  /** The Dashboard's garden dropdown only ever appears in plain view mode
   *  (never mid-edit, since editing keeps activeTab pinned to "planner"), so
   *  there's never an in-progress draft to lose here. */
  function switchGarden(id: string) {
    const g = gardens.find((x) => x.id === id);
    if (g) loadGarden(g);
  }

  /** Starts a fresh onboarding flow for an additional garden, without
   *  touching any already-saved one. It only joins `gardens` at Confirm : 
   *  same rule as the very first garden ever onboarded. */
  function startNewGarden() {
    // No window.prompt() here on purpose: it's a blocking synchronous
    // dialog that embedded webviews (VS Code preview, some in-app browsers)
    // silently suppress, which made this button look broken. Auto-name
    // instead; the name is editable via the "Garden name" field on screen.
    newGardenReturnIdRef.current = activeGardenId;
    resetWorkingCopy();
    setDraftName(`Garden ${gardens.length + 1}`);
    setStep("scan");
    setEditingLayout(true);
    setActiveTab("planner");
  }

  /** Abort "+ New garden" and restore the garden that was active before. */
  function cancelNewGarden() {
    const returnId = newGardenReturnIdRef.current;
    newGardenReturnIdRef.current = null;
    const g =
      (returnId ? gardens.find((x) => x.id === returnId) : undefined) ?? gardens[0];
    if (!g) return;
    loadGarden(g);
    setActiveTab("garden");
  }

  function renameGarden(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGardens((gs) => gs.map((g) => (g.id === id ? { ...g, name: trimmed } : g)));
  }

  /** Deleting the active garden falls back to another saved one, or: if it
   *  was the last one: drops back to the pre-onboarding first-run flow. */
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
   *  to tweak: this is the dev-only full wipe instead. */
  function hardResetApp() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort: if storage is unavailable there's nothing to clear
    }
    resetDevClock();
    resetDevWeatherOverride();
    window.location.reload();
  }

  const showPlanner = !onboarded || activeTab === "planner";
  // Whichever garden the working copy currently reflects: an existing
  // one's saved name, or the in-progress name for a not-yet-confirmed one.
  // Shown on every screen (Dashboard + all Planner steps) so it's always
  // clear which garden is on screen.
  const currentGardenName = activeGardenId
 ? (gardens.find((g) => g.id === activeGardenId)?.name ?? draftName)
 : draftName;

  const weatherPlantIds = useMemo(() => {
    if (!result?.counts) return ["tomato"];
    const ids = Object.keys(result.counts).filter((id) => (result.counts[id] ?? 0) > 0);
    return ids.length ? ids.slice(0, 8) : ["tomato"];
  }, [result]);

  const impactFoodKg = result?.carbon.foodKgPerSeason ?? 0;
  const impactCo2e = result?.carbon.kgCo2eSeason ?? 0;
  const impactPlantCount = result
 ? Object.values(result.counts).reduce((a, n) => a + n, 0)
 : 0;

  const { now: clockNow } = useDevClock();
  const careTasks = useMemo(() => {
    if (!result?.counts) return [] as { id: string; name: string; detail: string }[];
    const daysSince = plantedAt
 ? Math.max(0, Math.floor((clockNow - plantedAt) / (24 * 60 * 60 * 1000)))
 : 0;
    const tasks: { id: string; name: string; detail: string }[] = [];
    for (const [id, n] of Object.entries(result.counts)) {
      if (n <= 0) continue;
      const s = byId.get(id);
      if (!s) continue;
      const due = daysSince > 0 && daysSince % s.waterEveryDays === 0;
      if (due || tasks.length < 3) {
        tasks.push({
          id,
          name: due ? `Water ${s.name}` : `Check ${s.name}`,
          detail: `Every ${s.waterEveryDays}d · ${n} in ${currentGardenName}`,
        });
      }
    }
    return tasks.filter((t) => t.name.startsWith("Water")).slice(0, 3);
  }, [result, plantedAt, clockNow, currentGardenName]);

  /** Base44-styled tabs hide the old flow chrome; Plan / first-run keep it. */
  const showFlowChrome = !onboarded || activeTab === "planner" || editingLayout;
  const showXpBadge =
    onboarded &&
    (activeTab === "dashboard" ||
      activeTab === "garden" ||
      activeTab === "planner");

  return (
    <WeatherProvider plantIds={weatherPlantIds}>
      <WeatherBackground />
      {/* Normal-flow header strip, not a floating overlay — reserves its own
          height above .app-scroll so it can never overlap HomePanel's
          greeting/icons or anything else in the scroll content below it.
          On Learn/Profile (no XP) it overlays so content can sit higher. */}
      <div className={`top-bar${showXpBadge ? "" : " top-bar--overlay"}`}>
        {showXpBadge ? <XpBadge xp={xp} /> : <span />}
        <DevTools onRestart={hardResetApp} />
      </div>
      {celebration && (
        <CelebrationPopup celebration={celebration} onDismiss={() => setCelebration(null)} />
      )}
      <div className="app-scroll">
        {showFlowChrome && (
          <>
            <div className="flow-header">
              <div className="flow-brand">
                <img
                  src="/logo.png"
                  alt=""
                  className="flow-logo"
                  width={56}
                  height={64}
                />
                <h1>PlotTwist</h1>
              </div>
              <p className="muted">Your garden, optimized. With a twist.</p>
            </div>
            {(onboarded || editingLayout) && (
              <p className="tiny">
                Garden: <b>{currentGardenName}</b>
              </p>
            )}
          </>
        )}

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
            {gardens.length > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={cancelNewGarden}
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {showPlanner && (
          <>
            {/* Keep Scan mounted when leaving the step so dragged corners aren't wiped. */}
            <div style={{ display: step === "scan" ? undefined : "none" }}>
              <ScanScreen
                active={step === "scan"}
                photo={photo}
                setPhoto={setPhoto}
                onMeasured={applyGarden}
                onDemo={doDemoScan}
                onSkip={editingLayout && garden ? () => setStep("review") : undefined}
              />
            </div>
            {step === "review" && garden && (
              <ReviewScreen
                garden={garden}
                scanInfo={scanInfo}
                scanOverlay={scanOverlay}
                setGarden={setGarden}
                selected={selected}
                setSelected={setSelected}
                onNext={() => setStep("prefs")}
                onBack={() => setStep("scan")}
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
                onBack={() => setStep("review")}
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
              <>
                <GardenSwitcher
                  gardens={gardens}
                  activeGardenId={activeGardenId}
                  onSwitchGarden={switchGarden}
                  onNewGarden={startNewGarden}
                  onRenameGarden={renameGarden}
                  onDeleteGarden={deleteGarden}
                />
                <div className="row">
                  <button
                    className={`small ${clickMode === "harvest" ? "" : "secondary"}`}
                    onClick={() => setClickMode((m) => (m === "harvest" ? null : "harvest"))}
                  >
                    Harvest
                  </button>
                  <button
                    className={`small ${clickMode === "reseed" ? "" : "secondary"}`}
                    onClick={() => setClickMode((m) => (m === "reseed" ? null : "reseed"))}
                  >
                    Reseed
                  </button>
                  {clickMode && (
                    <span className="tiny">
                      Tap {clickMode === "harvest" ? "a grown" : "an empty"} plant on the grid
                      below.
                    </span>
                  )}
                </div>
              </>
            )}
            {step === "results" && garden && result && (
              <ResultsScreen
                garden={requestGarden()}
                result={result}
                careAboutCarbon={carbonWeight > 0}
                onSwap={applySwap}
                onSpaceReplace={applySpaceReplace}
                onUndoSwap={swapHistory.length > 0 ? undoSwap : undefined}
                harvestedUnits={onboarded && !editingLayout ? new Set(harvestedUnits) : undefined}
                clickMode={onboarded && !editingLayout ? clickMode : null}
                onUnitClick={handleUnitClick}
                onEdit={
                  onboarded && !editingLayout
                    ? () => {
                        setEditingLayout(true);
                        setStep("scan");
                        setClickMode(null);
                      }
                    : undefined
                }
                onSeeProgress={
                  onboarded
                    ? () => {
                        setEditingLayout(false);
                        setActiveTab("garden");
                        setClickMode(null);
                      }
                    : undefined
                }
                onTweak={!onboarded || editingLayout ? () => setStep("select") : undefined}
                onConfirm={
                  !onboarded || editingLayout
                    ? () => {
                        const effectivePlantedAt = plantedAt ?? Date.now();
                        if (!activeGardenId) {
                          // Brand-new garden: joins the library now, not before.
                          newGardenReturnIdRef.current = null;
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
                              harvestedUnits: [],
                              unitPlantedAt: {},
                              lastWateredAt: {},
                            },
                          ]);
                          setActiveGardenId(id);
                        }
                        setPlantedAt(effectivePlantedAt);
                        setEditingLayout(false);
                        setActiveTab("dashboard");
                        // Cloud save is best-effort: the demo never blocks on it.
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

        {onboarded && activeTab === "dashboard" && (
          <HomePanel
            gardenName={currentGardenName}
            foodKg={impactFoodKg}
            kgCo2e={impactCo2e}
            plantCount={impactPlantCount}
            careTasks={careTasks}
            careAboutCarbon={carbonWeight > 0}
            onSearch={() => setSearchOpen(true)}
            onIdentify={() => setIdentifyOpen(true)}
            onOpenGarden={() => setActiveTab("garden")}
            onOpenPlan={() => setActiveTab("planner")}
          />
        )}

        {onboarded && activeTab === "garden" && result && (
          <DashboardScreen
            result={result}
            plantedAt={plantedAt}
            careAboutCarbon={carbonWeight > 0}
            cloudId={cloudId}
            gardens={gardens}
            activeGardenId={activeGardenId}
            onSwitchGarden={switchGarden}
            onNewGarden={startNewGarden}
            onRenameGarden={renameGarden}
            onDeleteGarden={deleteGarden}
            harvestedUnits={harvestedUnits}
            unitPlantedAt={unitPlantedAt}
            lastWateredAt={lastWateredAt}
            onWaterUnit={waterUnit}
          />
        )}

        {onboarded && activeTab === "learn" && <LearnPanel />}

        {onboarded && activeTab === "profile" && (
          <ProfilePanel
            foodKg={impactFoodKg}
            kgCo2e={impactCo2e}
            plantCount={impactPlantCount}
            showCarbon={carbonWeight > 0}
            xp={xp}
            streakDays={streakDays}
          />
        )}
      </div>

      {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
      {identifyOpen && <PlantIdentifyFlow onClose={() => setIdentifyOpen(false)} />}

      {onboarded && <BottomNav active={activeTab} onSelect={setActiveTab} />}
    </WeatherProvider>
  );
}

/** Dev-only corner widget: not part of the product flow. Lets us fast-forward
 *  the simulated clock (to watch carbon-saved and watering respond live) and
 *  wipe localStorage to test the first-time-use experience, without digging
 *  through browser devtools every time. */
function DevTools(props: { onRestart: () => void }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const { offsetDays } = useDevClock();
  const weatherOverride = useDevWeatherOverride();
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
        !
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
            Reset clock to real time
          </button>

          <p className="tiny" style={{ marginTop: 10 }}>
            Simulate weather:{" "}
            <b>
              {DEV_WEATHER_OPTIONS.find((o) => o.id === weatherOverride)?.label ?? "Live"}
            </b>
          </p>
          <div className="devtools-weather-grid">
            {DEV_WEATHER_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`small ${weatherOverride === opt.id ? "" : "secondary"}`}
                onClick={() => setDevWeatherOverride(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Two-step "arm then confirm" instead of window.confirm(): some
              embedded webviews (VS Code preview, in-app browsers) silently
              swallow blocking dialogs, which made a confirm()-gated button
              look broken. */}
          {armed ? (
            <button className="small" onClick={props.onRestart}>
              ! Click again to wipe everything
            </button>
          ) : (
            <button className="small secondary" onClick={() => setArmed(true)}>
              Restart app (first-time use)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Fixed corner XP/level readout. */
function XpBadge(props: { xp: number }) {
  const level = levelForXp(props.xp);
  const next = nextLevelForXp(props.xp);
  return (
    <div className="xp-badge" title={`${level.title} — ${props.xp} XP`}>
      Lvl {level.level} · {props.xp}
      {next ? ` / ${next.minXp} XP` : " XP (max)"}
    </div>
  );
}

/** Celebration overlay for a level-up or a streak-bonus milestone — either
 *  click dismisses it. Level-up takes priority over a same-tick streak
 *  bonus (see the combined XP-tick effect), so at most one shows at once. */
function CelebrationPopup(props: {
  celebration:
    | { kind: "level"; level: LevelInfo }
    | { kind: "streak"; days: number; bonus: number };
  onDismiss: () => void;
}) {
  const { celebration } = props;
  return (
    <div className="celebration-overlay" onClick={props.onDismiss}>
      <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
        {celebration.kind === "level" ? (
          <>
            <div className="celebration-emoji">{celebration.level.emoji}</div>
            <h2>Level up!</h2>
            <p className="muted">
              You're now a <b>{celebration.level.title}</b> — Level {celebration.level.level}.
            </p>
          </>
        ) : (
          <>
            <div className="celebration-emoji">🔥</div>
            <h2>{celebration.days}-Day Streak!</h2>
            <p className="muted">+{celebration.bonus} XP for watering on schedule.</p>
          </>
        )}
        <button onClick={props.onDismiss}>Nice!</button>
      </div>
    </div>
  );
}

/* ─────────────── 1. Scan (yard-scan: coin or custom reference) ─────────────── */

type SavedScanFrame = {
  id: string;
  photoUrl: string;
  imageWidthPx: number;
  imageHeightPx: number;
  referenceEdgeA: Point2;
  referenceEdgeB: Point2;
  bedCorners: Point2[];
};

function ScanScreen(props: {
  /** False when another step is showing — keep marks, stop the camera. */
  active?: boolean;
  photo: string | null;
  setPhoto: (p: string | null) => void;
  onMeasured: (
    g: GardenGrid,
    d: ScanDiagnostics,
    overlay: ScanPhotoOverlay | null,
  ) => void;
  onDemo: () => void;
  onSkip?: () => void;
}) {
  const [mode, setMode] = useState<ScaleReferenceMode>("coin");
  /** Typed width×length instead of photo measure (always a rectangle). */
  const [manualRect, setManualRect] = useState(false);
  const [manualWidthCm, setManualWidthCm] = useState(150);
  const [manualLengthCm, setManualLengthCm] = useState(60);
  /** Edge length of each planting cell (cm). Catalog spacing assumes 30. */
  const [cellSizeCm, setCellSizeCm] = useState(30);
  const [coinKind, setCoinKind] = useState<Exclude<ReferenceKind, "custom"> | "">("");
  const [customSizeCm, setCustomSizeCm] = useState(8.56); // credit-card width default
  const [customLabel, setCustomLabel] = useState("credit card");
  const [tapPhase, setTapPhase] = useState<"reference" | "bed">("reference");
  const [refTaps, setRefTaps] = useState<Point2[]>([]);
  const [bedCorners, setBedCorners] = useState<Point2[]>([]);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragMovedRef = useRef(false);
  const dragRef = useRef<{ kind: "ref" | "bed"; index: number } | null>(null);
  const bedCornersRef = useRef<Point2[]>([]);
  const refTapsRef = useRef<Point2[]>([]);
  bedCornersRef.current = bedCorners;
  refTapsRef.current = refTaps;
  const [stitchMode, setStitchMode] = useState(false);
  const [panDirection, setPanDirection] = useState<"right" | "left">("right");
  const [overlapFraction, setOverlapFraction] = useState(0.3);
  const [savedFrames, setSavedFrames] = useState<SavedScanFrame[]>([]);
  /** Extra photos picked via multi-select, loaded after each "Save frame". */
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [liveCamera, setLiveCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!liveCamera || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [liveCamera]);

  useEffect(() => {
    if (props.active === false && liveCamera) stopLiveCamera();
    // stopLiveCamera is stable enough for this screen-local helper
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.active, liveCamera]);

  /** Starting quad: inset rectangle the user drags to fit their real bed. */
  function autoCorners(w: number, h: number): Point2[] {
    const ix = w * 0.18;
    const iy = h * 0.22;
    return [
      { x: ix, y: iy },
      { x: w - ix, y: iy },
      { x: w - ix, y: h - iy },
      { x: ix, y: h - iy },
    ];
  }

  function resetMarks(size = imgSize) {
    setRefTaps([]);
    setBedCorners(size ? autoCorners(size.w, size.h) : []);
    setTapPhase("reference");
    setError(null);
    dragRef.current = null;
  }

  function clearPendingPhotos() {
    for (const url of pendingPhotos) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    setPendingPhotos([]);
  }

  function clearAllFrames() {
    for (const f of savedFrames) {
      if (f.photoUrl.startsWith("blob:") && f.photoUrl !== props.photo) {
        URL.revokeObjectURL(f.photoUrl);
      }
    }
    setSavedFrames([]);
    clearPendingPhotos();
  }

  function loadPhotoUrl(url: string) {
    if (props.photo?.startsWith("blob:") && !savedFrames.some((sf) => sf.photoUrl === props.photo)) {
      URL.revokeObjectURL(props.photo);
    }
    props.setPhoto(url);
    resetMarks(null);
    setImgSize(null);
    setError(null);
  }

  function stopLiveCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveCamera(false);
  }

  async function startLiveCamera() {
    setCameraError(null);
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setLiveCamera(true);
    } catch {
      setCameraError("Couldn’t open the live camera — using the phone camera picker instead.");
      cameraInputRef.current?.click();
    }
  }

  function captureFromLiveCamera() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Camera isn’t ready yet — wait a second and try Capture again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Capture failed — try again or upload a photo.");
          return;
        }
        stopLiveCamera();
        if (props.photo?.startsWith("blob:") && !savedFrames.some((sf) => sf.photoUrl === props.photo)) {
          URL.revokeObjectURL(props.photo);
        }
        props.setPhoto(URL.createObjectURL(blob));
        resetMarks(null);
        setImgSize({ w: canvas.width, h: canvas.height });
        setBedCorners(autoCorners(canvas.width, canvas.height));
        setError(null);
      },
      "image/jpeg",
      0.92,
    );
  }

  function applyPickedPhoto(f: File) {
    applyPickedPhotos([f]);
  }

  /** One photo now; if stitch is on and several were chosen, queue the rest. */
  function applyPickedPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (!images.length) {
      setError("Pick an image file (JPG/PNG/WebP).");
      return;
    }
    const [first, ...rest] = images;
    loadPhotoUrl(URL.createObjectURL(first!));
    if (/\.heic$|\.heif$/i.test(first!.name) || /heic|heif/i.test(first!.type)) {
      setError(
        "This looks like an iPhone HEIC photo — if it doesn't appear below, open it in Photos and export as JPEG, then re-upload.",
      );
    }
    if (stitchMode && rest.length) {
      clearPendingPhotos();
      setPendingPhotos(rest.map((f) => URL.createObjectURL(f)));
    } else if (!stitchMode && rest.length) {
      setError("Turn on Stitch wide yard first if you want to use more than one photo.");
    }
  }

  const coinGhost = useMemo(() => {
    if (!stitchMode || savedFrames.length === 0) return null;
    const prev = savedFrames[savedFrames.length - 1]!;
    const nextSize =
      imgSize ??
      (liveCamera
        ? { w: prev.imageWidthPx, h: prev.imageHeightPx }
        : null);
    if (!nextSize) return null;
    const prevCenter = {
      x: (prev.referenceEdgeA.x + prev.referenceEdgeB.x) / 2,
      y: (prev.referenceEdgeA.y + prev.referenceEdgeB.y) / 2,
    };
    const prevDiam = Math.hypot(
      prev.referenceEdgeB.x - prev.referenceEdgeA.x,
      prev.referenceEdgeB.y - prev.referenceEdgeA.y,
    );
    return coinGhostForNextFrame(
      prevCenter,
      prevDiam,
      { w: prev.imageWidthPx, h: prev.imageHeightPx },
      nextSize,
      panDirection,
      overlapFraction,
    );
  }, [stitchMode, imgSize, savedFrames, panDirection, overlapFraction, liveCamera]);

  function stagePoint(e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }): Point2 | null {
    if (!imgSize) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * imgSize.w;
    const y = ((e.clientY - rect.top) / rect.height) * imgSize.h;
    return {
      x: Math.min(Math.max(x, 0), imgSize.w),
      y: Math.min(Math.max(y, 0), imgSize.h),
    };
  }

  function onPhotoClick(e: MouseEvent<HTMLDivElement>) {
    if (dragMovedRef.current) {
      // this click is the tail end of a drag: don't add a new mark
      dragMovedRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest?.(".mark")) return;
    if (!props.photo || !imgSize) return;
    const pt = stagePoint(e);
    if (!pt) return;

    // Only coin-edge taps use empty clicks. Bed corners are drag-only —
    // use the "Add point" button so misses don't spawn random corners.
    if (tapPhase === "reference") {
      const next = [...refTaps, pt].slice(0, 2);
      setRefTaps(next);
      if (next.length === 2) setTapPhase("bed");
    }
  }

  /** Insert a new bed corner at the midpoint of the longest edge. */
  function addBedPoint() {
    if (!imgSize) return;
    setBedCorners((corners) => {
      if (corners.length < 2) {
        return [...corners, { x: imgSize.w * 0.5, y: imgSize.h * 0.5 }];
      }
      let bestI = 0;
      let bestLen = -1;
      for (let i = 0; i < corners.length; i++) {
        const a = corners[i]!;
        const b = corners[(i + 1) % corners.length]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > bestLen) {
          bestLen = len;
          bestI = i;
        }
      }
      const a = corners[bestI]!;
      const b = corners[(bestI + 1) % corners.length]!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = [...corners];
      next.splice(bestI + 1, 0, mid);
      return next;
    });
    setTapPhase("bed");
    setError(null);
  }

  function removeLastBedPoint() {
    setBedCorners((corners) => (corners.length > 3 ? corners.slice(0, -1) : corners));
  }

  function onStagePointerMove(e: PointerEvent<HTMLDivElement>) {
    const active = dragRef.current;
    if (!active) return;
    const pt = stagePoint(e);
    if (!pt) return;
    dragMovedRef.current = true;
    if (active.kind === "ref") {
      setRefTaps((taps) => taps.map((p, i) => (i === active.index ? pt : p)));
    } else {
      setBedCorners((c) => c.map((p, i) => (i === active.index ? pt : p)));
    }
  }

  function startDrag(kind: "ref" | "bed", index: number) {
    return (e: PointerEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragMovedRef.current = false;
      dragRef.current = { kind, index };
    };
  }

  function endDrag() {
    dragRef.current = null;
  }

  function currentFramePayload(): SavedScanFrame | null {
    const taps = refTapsRef.current;
    const corners = bedCornersRef.current;
    if (!props.photo || !imgSize || taps.length < 2 || corners.length < 3) return null;
    return {
      id: `frame-${savedFrames.length + 1}`,
      photoUrl: props.photo,
      imageWidthPx: imgSize.w,
      imageHeightPx: imgSize.h,
      referenceEdgeA: taps[0]!,
      referenceEdgeB: taps[1]!,
      bedCorners: corners.map((p) => ({ ...p })),
    };
  }

  function saveFrameAndAddNext() {
    setError(null);
    if (mode === "coin" && !coinKind) {
      setError("Choose which coin you used before saving a frame.");
      return;
    }
    const frame = currentFramePayload();
    if (!frame) {
      setError("Tap both coin edges and at least 3 bed corners before saving this frame.");
      return;
    }
    // Tip: put the coin toward the edge you'll pan into (right edge if panning right).
    setSavedFrames((prev) => [...prev, frame]);
    resetMarks(null);
    setImgSize(null);
    // Nudge the file picker so the same filename can be chosen again if needed.
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Auto-advance into the next queued photo (from multi-select), else clear for upload.
    if (pendingPhotos.length > 0) {
      const [next, ...rest] = pendingPhotos;
      setPendingPhotos(rest);
      props.setPhoto(next!);
      setError(null);
    } else {
      props.setPhoto(null);
      setError(null);
    }
  }

  function measureManualRect() {
    setError(null);
    try {
      const result = gardenFromRectangleCm(manualWidthCm, manualLengthCm, cellSizeCm);
      props.onMeasured(result.garden, result.diagnostics, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function measure() {
    setError(null);
    if (mode === "coin" && !coinKind) {
      setError("Choose which coin you used before measuring.");
      return;
    }

    try {
      const frames = [...savedFrames];
      const current = currentFramePayload();
      if (current) frames.push(current);

      if (!frames.length) {
        setError("Upload a photo and mark the coin + bed corners first.");
        return;
      }

      const chosenCoin = mode === "coin" && coinKind ? coinKind : undefined;
      const result =
        frames.length === 1
          ? measureYardFromTaps({
              imageWidthPx: frames[0]!.imageWidthPx,
              imageHeightPx: frames[0]!.imageHeightPx,
              referenceEdgeA: frames[0]!.referenceEdgeA,
              referenceEdgeB: frames[0]!.referenceEdgeB,
              bedCorners: frames[0]!.bedCorners,
              mode,
              coinKind: chosenCoin,
              customSizeCm,
              customLabel,
              cellSizeCm,
            })
          : measureYardFromFrames({
              frames: frames.map(({ photoUrl: _p, ...f }) => f),
              mode,
              coinKind: chosenCoin,
              customSizeCm,
              customLabel,
              stitchDirection: panDirection,
              overlapFraction,
              cellSizeCm,
            });
      const last = frames[frames.length - 1]!;
      const overlay: ScanPhotoOverlay | null = last
        ? {
            photoUrl: last.photoUrl,
            imageWidthPx: last.imageWidthPx,
            imageHeightPx: last.imageHeightPx,
            bedCorners: last.bedCorners,
          }
        : null;
      props.onMeasured(result.garden, result.diagnostics, overlay);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const coinOptions = Object.entries(COIN_LABELS) as [
    Exclude<ReferenceKind, "custom">,
    string,
  ][];
  const canSaveOrMeasure =
    !!props.photo && refTaps.length >= 2 && bedCorners.length >= 3;

  return (
    <div className="card">
      <h2>Scan your garden</h2>
      <p className="muted">
        Upload a photo, mark a scale reference, then tap the corners of your bed.
        We convert pixels → real size → a planting grid you choose below.
      </p>

      <div className="row">
        <label className="tiny" htmlFor="cell-size">
          Grid cell size
        </label>
        <select
          id="cell-size"
          value={cellSizeCm}
          onChange={(e) => setCellSizeCm(Number(e.target.value))}
        >
          <option value={15}>15 cm</option>
          <option value={20}>20 cm</option>
          <option value={30}>30 cm (recommended)</option>
          <option value={45}>45 cm</option>
          <option value={60}>60 cm</option>
        </select>
        <span className="tiny muted">
          How fine to split the bed · plant spacing is calibrated for 30 cm
        </span>
      </div>

      <div className="row">
        <span
          className={`chip ${!manualRect && mode === "coin" ? "on" : ""}`}
          onClick={() => {
            setManualRect(false);
            setMode("coin");
            resetMarks();
          }}
        >
          Coin
        </span>
        <span
          className={`chip ${!manualRect && mode === "custom_object" ? "on" : ""}`}
          onClick={() => {
            setManualRect(false);
            setMode("custom_object");
            if (stitchMode) {
              setStitchMode(false);
              clearAllFrames();
            }
            resetMarks();
          }}
        >
          Custom object
        </span>
        <span
          className={`chip ${manualRect ? "on" : ""}`}
          onClick={() => {
            setManualRect(true);
            if (stitchMode) {
              setStitchMode(false);
              clearAllFrames();
            }
            setError(null);
          }}
        >
          Enter dimensions
        </span>
      </div>

      {manualRect ? (
        <div className="manual-rect-panel">
          <p className="muted">
            Skip the photo — type your bed size. This assumes a flat <b>rectangle</b> (raised bed,
            patio slab, desk, etc.).
          </p>
          <div className="row">
            <label className="tiny" htmlFor="manual-width">
              Width (cm)
            </label>
            <input
              id="manual-width"
              type="number"
              min={5}
              step={1}
              value={manualWidthCm}
              onChange={(e) => setManualWidthCm(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <label className="tiny" htmlFor="manual-length">
              Length (cm)
            </label>
            <input
              id="manual-length"
              type="number"
              min={5}
              step={1}
              value={manualLengthCm}
              onChange={(e) => setManualLengthCm(Number(e.target.value))}
              style={{ width: 100 }}
            />
          </div>
          <p className="tiny muted">
            Preview: ~{(manualWidthCm / 100).toFixed(2)} × {(manualLengthCm / 100).toFixed(2)} m
            {" · "}
            {(Math.max(0, manualWidthCm) * Math.max(0, manualLengthCm) / 10_000).toFixed(2)} m²
            {" · "}
            ~{Math.max(1, Math.ceil(Math.max(0, manualWidthCm) / cellSizeCm))} ×{" "}
            {Math.max(1, Math.ceil(Math.max(0, manualLengthCm) / cellSizeCm))} cells
            {" @ "}
            {cellSizeCm} cm
          </p>
          <div className="row">
            <button type="button" onClick={measureManualRect}>
              Use these dimensions →
            </button>
          </div>
        </div>
      ) : mode === "coin" ? (
        <>
          <p className="muted">{SCAN_UX.placeCoin}</p>
          <div className="row">
            <label className="tiny">Coin type</label>
            <select
              value={coinKind}
              onChange={(e) =>
                setCoinKind(
                  e.target.value as Exclude<ReferenceKind, "custom"> | "",
                )
              }
            >
              <option value="" disabled>
                Choose coin type…
              </option>
              {coinOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="stitch-toggle">
            <span className="stitch-toggle-text">
              <span className="stitch-toggle-title">Stitch wide yard</span>
              <span className="tiny muted">Combine two or more overlapping photos</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={stitchMode}
              className={`toggle-switch rounded-full ${stitchMode ? "on" : ""}`}
              onClick={() => {
                if (stitchMode) {
                  setStitchMode(false);
                  clearAllFrames();
                } else {
                  setStitchMode(true);
                }
              }}
            >
              <span className="toggle-knob" />
            </button>
          </label>
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

      {!manualRect && stitchMode && (
        <div className="stitch-panel">
          <p className="muted">{SCAN_UX.multiFrame}</p>
          <ol className="stitch-steps">
            <li>
              Upload or capture a photo → mark green coin + blue corners
            </li>
            <li>
              Tap <b>Save frame &amp; add next</b>
            </li>
            <li>
              Repeat for each overlapping photo (2 or more total) — keep the same coin in the overlap
            </li>
            <li>
              When you’re done, tap <b>Measure … frame(s)</b>
            </li>
          </ol>
          <div className="row">
            <label className="tiny">Pan direction</label>
            <select
              value={panDirection}
              onChange={(e) => setPanDirection(e.target.value as "right" | "left")}
            >
              <option value="right">Left → right</option>
              <option value="left">Right → left</option>
            </select>
            <label className="tiny">Overlap</label>
            <select
              value={String(overlapFraction)}
              onChange={(e) => setOverlapFraction(Number(e.target.value))}
            >
              <option value="0.25">~25%</option>
              <option value="0.3">~30%</option>
              <option value="0.4">~40%</option>
            </select>
          </div>
          <p className="tiny muted">
            Tip: put the coin near the <b>{panDirection === "right" ? "right" : "left"}</b> edge
            of each frame (in the overlap). On the next photo, a dashed ghost shows where to line
            the coin up.
          </p>
          {(savedFrames.length > 0 || pendingPhotos.length > 0) && (
            <div className="frame-strip">
              {savedFrames.map((f, i) => (
                <div key={f.id} className="frame-thumb">
                  <img src={f.photoUrl} alt={`frame ${i + 1}`} />
                  <span className="tiny">Frame {i + 1}</span>
                </div>
              ))}
              <span className="tiny muted">
                {savedFrames.length} saved
                {pendingPhotos.length > 0
                  ? ` · ${pendingPhotos.length} queued`
                  : ""}
                {" · "}
                next is frame {savedFrames.length + 1}
              </span>
            </div>
          )}
        </div>
      )}

      {!manualRect && (
      <>
      <div className="row">
        <button type="button" className="secondary small" onClick={() => void startLiveCamera()}>
          Open camera
        </button>
        <button
          type="button"
          className="secondary small"
          onClick={() => fileInputRef.current?.click()}
        >
          {stitchMode
            ? savedFrames.length > 0
              ? `Upload photo ${savedFrames.length + 1}`
              : "Upload photo(s)"
            : "Upload photo"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          multiple={stitchMode}
          hidden
          onChange={(e) => {
            const list = e.target.files;
            e.target.value = "";
            if (!list?.length) return;
            applyPickedPhotos(Array.from(list));
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            applyPickedPhoto(f);
          }}
        />
      </div>
      {cameraError && <p className="tiny" style={{ color: "#c4a35a" }}>{cameraError}</p>}

      {stitchMode && !props.photo && !liveCamera && (
        <div className="stitch-awaiting">
          <p className="scan-phase">
            {savedFrames.length === 0
              ? "Stitch mode on — upload photo 1 (or pick several at once)"
              : `Frame ${savedFrames.length} saved — upload photo ${savedFrames.length + 1} (or Measure when you have 2+)`}
          </p>
          <p className="scan-phase-hint">
            Same coin must appear in each overlap. Mark coin edges + bed corners on every photo.
            Keep saving frames until you’ve added all shots (2 or more), then Measure.
          </p>
          <div className="row">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              {savedFrames.length === 0 ? "Upload photo(s)" : `Upload photo ${savedFrames.length + 1}`}
            </button>
            <button type="button" className="secondary" onClick={() => void startLiveCamera()}>
              Open camera
            </button>
            {savedFrames.length >= 2 && (
              <button type="button" className="secondary" onClick={measure}>
                Measure {savedFrames.length} frames →
              </button>
            )}
          </div>
        </div>
      )}

      {liveCamera && (
        <div className="live-camera">
          <p className="tiny">
            {savedFrames.length > 0
              ? "Line the real coin up with the dashed ghost, then Capture."
              : "Frame the bed, put the coin in view, then Capture."}
          </p>
          <div className="photo-stage live-stage">
            <video
              ref={videoRef}
              className="photo live-video"
              playsInline
              muted
              autoPlay
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setImgSize({ w: v.videoWidth, h: v.videoHeight });
              }}
            />
            {imgSize && coinGhost && (
              <span
                className="coin-ghost"
                style={{
                  left: `${(coinGhost.center.x / imgSize.w) * 100}%`,
                  top: `${(coinGhost.center.y / imgSize.h) * 100}%`,
                  width: `${(coinGhost.diameterPx / imgSize.w) * 100}%`,
                  paddingBottom: `${(coinGhost.diameterPx / imgSize.w) * 100}%`,
                }}
                title="Line up your coin here"
              />
            )}
          </div>
          <div className="row">
            <button type="button" onClick={captureFromLiveCamera}>
              Capture photo
            </button>
            <button type="button" className="secondary small" onClick={stopLiveCamera}>
              Close camera
            </button>
          </div>
        </div>
      )}

      {props.photo && !liveCamera && (
        <>
          <p className="scan-phase">
            {tapPhase === "reference"
              ? savedFrames.length > 0
                ? "Phase 1 — Line up the coin with the ghost, then tap both edges"
                : "Phase 1 — Tap both edges of the coin"
              : "Phase 2 — Drag the blue numbered corners onto your bed"}
          </p>
          <p className="scan-phase-meta">
            Green coin taps {refTaps.length}/2 · blue corners {bedCorners.length}
            {stitchMode ? ` · frames saved ${savedFrames.length}` : ""}
          </p>
          <p className="scan-phase-hint">
            <b>Green</b> = coin edges (scale). <b>Blue</b> = bed outline corners — drag them to
            fit. Misses won’t add points; use <b>Add point</b> only if you need an extra corner.
          </p>
          {tapPhase === "bed" && (
            <div className="row">
              <button
                type="button"
                className="secondary small"
                disabled={!imgSize}
                onClick={addBedPoint}
              >
                Add point
              </button>
              <button
                type="button"
                className="secondary small"
                disabled={bedCorners.length <= 3}
                onClick={removeLastBedPoint}
                title="Need at least 3 corners"
              >
                Remove last point
              </button>
            </div>
          )}
          {coinGhost && (
            <p className="tiny" style={{ color: "#c4a35a" }}>
              {SCAN_UX.coinGhost}
            </p>
          )}
          <div
            className="photo-stage"
            onClick={onPhotoClick}
            onPointerMove={onStagePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            <img
              className="photo"
              src={props.photo}
              alt="your yard"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                const size = { w: img.naturalWidth, h: img.naturalHeight };
                setImgSize(size);
                // Only seed the default quad once — never wipe corners the user already dragged.
                setBedCorners((prev) =>
                  prev.length >= 3 ? prev : autoCorners(size.w, size.h),
                );
                setError(null);
              }}
              onError={() => {
                setImgSize(null);
                setError(
                  "Couldn't display that photo in the browser. Re-save it as JPG/PNG (iPhone HEIC often fails on Windows) and try again.",
                );
              }}
            />
            {imgSize && coinGhost && (
              <span
                className="coin-ghost"
                style={{
                  left: `${(coinGhost.center.x / imgSize.w) * 100}%`,
                  top: `${(coinGhost.center.y / imgSize.h) * 100}%`,
                  width: `${(coinGhost.diameterPx / imgSize.w) * 100}%`,
                  paddingBottom: `${(coinGhost.diameterPx / imgSize.w) * 100}%`,
                }}
                title="Line up your coin here"
              />
            )}
            {imgSize &&
              refTaps.map((p, i) => (
                <span
                  key={`r${i}`}
                  className="mark ref draggable"
                  onPointerDown={startDrag("ref", i)}
                  style={{
                    left: `${(p.x / imgSize.w) * 100}%`,
                    top: `${(p.y / imgSize.h) * 100}%`,
                  }}
                />
              ))}
            {imgSize && (refTaps.length === 2 || bedCorners.length >= 3 || coinGhost) && (
              <svg className="mark-lines" viewBox={`0 0 ${imgSize.w} ${imgSize.h}`} preserveAspectRatio="none">
                {bedCorners.length >= 3 && (
                  <polygon
                    points={bedCorners.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="rgba(110, 168, 254, 0.15)"
                    stroke="#6ea8fe"
                    strokeWidth={Math.max(2, imgSize.w / 400)}
                    strokeDasharray={`${Math.max(6, imgSize.w / 150)}`}
                  />
                )}
                {refTaps.length === 2 && (
                  <line
                    x1={refTaps[0]!.x}
                    y1={refTaps[0]!.y}
                    x2={refTaps[1]!.x}
                    y2={refTaps[1]!.y}
                    stroke="#7fe89a"
                    strokeWidth={Math.max(2, imgSize.w / 400)}
                  />
                )}
              </svg>
            )}
            {imgSize &&
              bedCorners.map((p, i) => (
                <span
                  key={`b${i}`}
                  className="mark bed draggable"
                  onPointerDown={startDrag("bed", i)}
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

      <div className="row">
        {stitchMode && (
          <button type="button" className="secondary" disabled={!canSaveOrMeasure} onClick={saveFrameAndAddNext}>
            Save frame & add next →
          </button>
        )}
        <button
          type="button"
          disabled={!canSaveOrMeasure && savedFrames.length === 0}
          onClick={measure}
        >
          {stitchMode && (savedFrames.length > 0 || canSaveOrMeasure)
            ? `Measure ${savedFrames.length + (canSaveOrMeasure ? 1 : 0)} frame(s) →`
            : "Measure yard →"}
        </button>
        <button
          type="button"
          className="secondary small"
          onClick={() => resetMarks()}
          disabled={!props.photo}
        >
          Clear marks
        </button>
        {stitchMode && savedFrames.length > 0 && (
          <button type="button" className="secondary small" onClick={clearAllFrames}>
            Clear saved frames
          </button>
        )}
      </div>
      </>
      )}

      {error && <p className="tiny" style={{ color: "#f0b4b4" }}>{error}</p>}

      <div className="row">
        <button type="button" className="secondary" onClick={props.onDemo}>
          Skip: use demo yard →
        </button>
        {props.onSkip && (
          <button type="button" className="secondary" onClick={props.onSkip}>
            Skip → keep current yard
          </button>
        )}
      </div>
      <p className="tiny">
        {manualRect
          ? "Manual size assumes a rectangle. Switch to Coin if you want to measure from a photo."
          : "Coin path is recommended (known diameter). Stitched multi-photo yards are approximate — keep the coin in the overlap and use the ghost circle to align each shot."}
      </p>
    </div>
  );
}

/* ─────────────── 2. Review detected plants ─────────────── */

function ReviewScreen(props: {
  garden: GardenGrid;
  scanInfo: ScanDiagnostics | null;
  scanOverlay: ScanPhotoOverlay | null;
  setGarden: (g: GardenGrid) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onNext: () => void;
  onBack: () => void;
  skippable?: boolean;
}) {
  const { garden, scanInfo, scanOverlay } = props;
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
            Gray = path (can't plant). B = movable obstacle. P = plants we detected.
          </p>
        )}
        {scanOverlay && (
          <PhotoGridOverlay overlay={scanOverlay} garden={garden} />
        )}
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Abstract grid (same cells)
        </p>
        <GridView garden={garden} />
      </div>
      <div className="card">
        <h2>Detected plants: did we get it right?</h2>
        {existing.length === 0 && <p className="muted">Nothing detected (or all removed).</p>}
        {existing.map((e, i) => (
          <div className="row spread" key={`${e.cell[0]}-${e.cell[1]}`}>
            <span style={{ fontSize: 14 }}>
              Plant at row {e.cell[0] + 1}, col {e.cell[1] + 1}
              <span className="tiny"> {Math.round((e.confidence ?? 0) * 100)}% sure</span>
            </span>
            <span className="row">
              <select value={e.speciesId} onChange={(ev) => renameExisting(i, ev.target.value)}>
                <SpeciesSelectOptions catalog={CATALOG} />
              </select>
              <button className="small secondary" onClick={() => removeExisting(i)}>
                 not a plant
              </button>
            </span>
          </div>
 ))}
        <div className="row">
          <button className="secondary" onClick={props.onBack}>
            ← Back
          </button>
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
    // Some mobile browsers leave type empty for camera captures: allow those through.
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
      setError("No confident match: try a closer photo of a leaf or flower.");
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
      <h2>Identify a plant</h2>
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
          Tip: fill the frame with one leaf or flower: blurry wide shots confuse PlantNet.
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
                  ": "}
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
                    <b>Temp:</b> {care.tempMinC}-{care.tempMaxC} °C
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
 ? ` (range ${care.daysToHarvestMin}-${care.daysToHarvestMax})`
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
              Not in our curated catalog yet: PlantNet ID only. You can still rename a detected plant
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
  onBack: () => void;
  skippable?: boolean;
}) {
  const categories = [...new Set(CATALOG.map((s) => s.category))];
  const tiers: [SkillTier, string][] = [
    ["beginner", "Beginner: pick vibes, we pick plants"],
    ["intermediate", "Intermediate: I know my plants"],
    ["advanced", "Advanced: give me everything"],
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
            <p className="muted">Pick any: leave empty for "surprise me".</p>
            <div className="row">
              {categories.map((cat) => {
                const on = props.prefs.categories.includes(cat);
                const label = cat.charAt(0).toUpperCase() + cat.slice(1);
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
                    {label}
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
            <p className="muted">Hard minimums: the optimizer treats these as promises.</p>
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
                  <SpeciesSelectOptions catalog={CATALOG} />
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
            <p className="muted">
              PlotTwist can prefer climate-friendlier crops and suggest greener swaps. Turn this off if you don&apos;t care.
            </p>
            <label className="opt" style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={props.carbonWeight <= 0}
                onChange={(e) => {
                  const cares = !e.target.checked;
                  props.setCarbonWeight(cares ? 0.5 : 0);
                  syncGreenerSwapsFromCarbonInterest(cares);
                }}
              />
              Not interested: ignore carbon in layout & recommendations
            </label>
            {props.carbonWeight > 0 && (
              <div className="row">
                <span className="tiny">a little</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={Math.round(props.carbonWeight * 100)}
                  onChange={(e) =>
                    props.setCarbonWeight(Number(e.target.value) / 100)
                  }
                  style={{ flex: 1 }}
                />
                <span className="tiny">max climate</span>
              </div>
            )}
          </div>
        </>
 )}

      {isBeginner && (
        <div className="card">
          <h2>Carbon impact?</h2>
          <p className="muted">
            When on, we quietly prefer crops that displace more store-bought emissions.
            Greener-swap nudges follow this choice (you can change them later in Profile).
          </p>
          <label className="opt">
            <input
              type="radio"
              name="carbon-interest"
              checked={props.carbonWeight > 0}
              onChange={() => {
                props.setCarbonWeight(0.5);
                syncGreenerSwapsFromCarbonInterest(true);
              }}
            />
            Yes: factor it into plant picks
          </label>
          <label className="opt">
            <input
              type="radio"
              name="carbon-interest"
              checked={props.carbonWeight <= 0}
              onChange={() => {
                props.setCarbonWeight(0);
                syncGreenerSwapsFromCarbonInterest(false);
              }}
            />
            No interest: don&apos;t use carbon at all
          </label>
        </div>
      )}

      <div className="row">
        <button className="secondary" onClick={props.onBack}>
          ← Back
        </button>
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

/** Beginner goal cards: replaces the chip/must-have/carbon-slider UI with a
 *  single pick. Maps each vibe to categories the optimizer already understands.
 *  NOTE: "Low effort" is approximated via category (herbs/flowers tend to be
 *  lower-maintenance) since the catalog has no hardiness/effort field yet : 
 *  swap this mapping out once that field exists. */
function BeginnerVibes(props: {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
}) {
  const goals: { label: string; categories: string[] }[] = [
    { label: "Feed me (easy edibles)", categories: ["veggies", "fruit", "herbs"] },
    { label: "Make it pretty (flowers)", categories: ["flowers"] },
    { label: "Help the bees (pollinators)", categories: ["pollinator"] },
    { label: "Low effort (hardy stuff)", categories: ["herbs", "flowers"] },
  ];

  const current = props.prefs.categories;
  const isActive = (cats: string[]) =>
    cats.length === current.length && cats.every((c) => current.includes(c));

  return (
    <div className="card">
      <h2>What's the vibe?</h2>
      <p className="muted">Pick one: we'll handle the species picking.</p>
      <div className="row">
        {goals.map((g) => (
          <span
            key={g.label}
            className={`chip ${isActive(g.categories) ? "on" : ""}`}
            style={{ fontSize: 14, padding: "10px 14px" }}
            onClick={() => props.setPrefs({ ...props.prefs, categories: g.categories })}
          >
            {g.label}
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
  const [payload, setPayload] = useState<SuggestPayload | null | undefined>(undefined);
  const [placeLabel, setPlaceLabel] = useState("your area");

  useEffect(() => {
    let alive = true;
    setPayload(undefined);
    (async () => {
      // Prefer a typed-city override the user confirmed; else device GPS.
      let lat = 43.6532;
      let lon = -79.3832;
      try {
        const raw = localStorage.getItem("plottwist:manualPlace");
        if (raw) {
          const p = JSON.parse(raw) as { lat?: number; lon?: number; label?: string };
          if (typeof p.lat === "number" && typeof p.lon === "number") {
            lat = p.lat;
            lon = p.lon;
            if (p.label) setPlaceLabel(p.label.split(",")[0] ?? p.label);
          } else {
            const geo = await requestDeviceLocation();
            lat = geo.lat;
            lon = geo.lon;
            setPlaceLabel(geo.source === "default" ? "Toronto" : "your area");
          }
        } else {
          const geo = await requestDeviceLocation();
          lat = geo.lat;
          lon = geo.lon;
          setPlaceLabel(geo.source === "default" ? "Toronto" : "your area");
        }
      } catch {
        setPlaceLabel("Toronto");
      }
      const s = await fetchSuggestions(props.tier, props.carbonWeight, lat, lon);
      if (alive) setPayload(s);
    })();
    return () => {
      alive = false;
    };
  }, [props.tier, props.carbonWeight]);

  const city = placeLabel.split(",")[0] ?? placeLabel;

  if (payload === undefined) {
    return (
      <div className="card info">
        <p className="tiny">
          Ranking PlotTwist catalog plants for {city}&apos;s season + this week&apos;s
          Open-Meteo forecast…
        </p>
      </div>
    );
  }
  if (!payload) return null; // backend offline: the card simply doesn't exist

  const sugs = payload.suggestions;
  const temps =
    payload.tonightMinC != null && payload.todayMaxC != null
      ? `${Math.round(payload.tonightMinC)}-${Math.round(payload.todayMaxC)}°C tonight/today`
      : null;
  const usesCarbon = (payload.carbonWeight ?? props.carbonWeight) > 0;

  return (
    <div className="card info">
      <h2>Suggested for {city}, right now</h2>
      <p className="muted" style={{ marginBottom: 8 }}>
        From the PlotTwist plant catalog, ranked for your garden location.
      </p>
      <div
        className="tiny"
        style={{
          marginBottom: 10,
          padding: "8px 10px",
          border: "1px solid var(--border, #ddd)",
          background: "rgba(255,255,255,0.45)",
          lineHeight: 1.45,
        }}
      >
        <b>Based on</b>
        <ul className="clean" style={{ margin: "6px 0 0", paddingLeft: 16 }}>
          <li>
            {payload.seasonName
              ? `Current season (${payload.seasonName})`
              : "Current season for your latitude"}
          </li>
          <li>
            Live Open-Meteo forecast
            {temps ? ` · ${temps}` : " · this week’s highs/lows & rain"}
          </li>
          <li>Plant temp tolerance + watering needs from our catalog</li>
          <li>Native-region / climate fit for {city}</li>
          <li>Your skill tier ({props.tier})</li>
          <li>
            {usesCarbon
              ? "Carbon savings (food crops displace store-bought emissions)"
              : "Carbon ignored (you opted out)"}
          </li>
        </ul>
      </div>
      <div className="row">
        {sugs.map((s) => {
          const added = props.targets.some((t) => t.speciesId === s.species.id);
          const tip = (s.reasons ?? []).slice(0, 2).join(" · ");
          return (
            <span
              key={s.species.id}
              className={`chip ${added ? "on" : ""}`}
              title={tip || undefined}
              onClick={() => {
                if (added) return;
                props.setTargets([...props.targets, { speciesId: s.species.id, min: 1 }]);
              }}
            >
              {added ? "Added · " : "+ "}
              {s.species.name}
            </span>
          );
        })}
      </div>
      <p className="tiny">Tap to add as a must-have. Hover a chip for why it ranked.</p>
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
          Optimize my garden
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
  /** When false, carbon is ignored in picks: hide CO₂e stats & greener swaps. */
  careAboutCarbon?: boolean;
  onSwap: (out: string, inId: string) => void;
  /** Replace N units of one plant with another, using cell-area conversion. */
  onSpaceReplace?: (outId: string, outUnits: number, inId: string) => void;
  onUndoSwap?: () => void;
  onEdit?: () => void;
  onTweak?: () => void;
  onConfirm?: () => void;
  /** Jump to Garden tab (watering / harvest progress). */
  onSeeProgress?: () => void;
  harvestedUnits?: Set<string>;
  clickMode?: "harvest" | "reseed" | null;
  onUnitClick?: (unitKey: string) => void;
}) {
  const { result } = props;
  const careAboutCarbon = props.careAboutCarbon !== false;
  const { profile } = useUserProfile();
  const showGreenerSwaps = profile.greenerSwapsEnabled;
  const total = result.placements.length;
  const [reveal, setReveal] = useState(0);
  const [changing, setChanging] = useState(false);
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");
  const [outUnits, setOutUnits] = useState(1);
  const [legendOpen, setLegendOpen] = useState(false);

  // 80ms/bed reads nicely for small gardens, but scales past ~40 beds
  // (90 beds ≈ 7s): scale the interval down so the whole reveal caps at ~3s.
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

  // Reset the change form when the layout updates after a replace.
  useEffect(() => {
    setChanging(false);
    setOutId("");
    setInId("");
    setOutUnits(1);
  }, [result]);

  const frac = total === 0 ? 1 : Math.min(1, reveal / total);
  const speciesIds = result.beds.map((b) => b.speciesId);

  const outS = outId
    ? byId.get(outId) ?? mergeCatalogWithSaved(CATALOG).find((s) => s.id === outId)
    : undefined;
  const inS = inId
    ? byId.get(inId) ?? mergeCatalogWithSaved(CATALOG).find((s) => s.id === inId)
    : undefined;
  const outHave = outId ? result.counts[outId] ?? 0 : 0;
  const outArea = outS ? outS.cellsPerPlant[0] * outS.cellsPerPlant[1] : 0;
  const inArea = inS ? inS.cellsPerPlant[0] * inS.cellsPerPlant[1] : 0;
  const replaceN = Math.max(1, Math.min(outHave || 1, outUnits));
  const freed = replaceN * outArea;
  const inGain = inArea > 0 ? Math.floor(freed / inArea) : 0;
  const leftover = inArea > 0 ? freed % inArea : 0;
  // Simple conversion rate text: how many IN per 1 OUT
  const ratePerOne =
    outArea > 0 && inArea > 0 ? Math.floor(outArea / inArea) : 0;
  const canApply =
    !!props.onSpaceReplace &&
    !!outId &&
    !!inId &&
    outId !== inId &&
    outHave > 0 &&
    inGain >= 1;

  function footprintLabel(id: string): string {
    const s =
      byId.get(id) ?? mergeCatalogWithSaved(CATALOG).find((x) => x.id === id);
    if (!s) return "";
    const [w, h] = s.cellsPerPlant;
    return `${w}×${h} cells (${w * h} each)`;
  }

  return (
    <>
      {!result.feasible && (
        <div className="card warn">
          <h2>Plot twist</h2>
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
        <GridView
          garden={props.garden}
          placements={result.placements}
          reveal={reveal}
          harvestedUnits={props.harvestedUnits}
          clickMode={props.clickMode}
          onUnitClick={props.onUnitClick}
          showAxisLabels={!!props.harvestedUnits}
        />
        {props.clickMode && (
          <p className="tiny">
            {props.clickMode === "harvest"
              ? "Harvest mode: tap a grown plant to harvest it."
              : "Reseed mode: tap an empty (dashed) spot to replant it."}
          </p>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="secondary small"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((o) => !o)}
          >
            {legendOpen ? "Hide color legend" : "Show color legend"}
          </button>
        </div>
        {legendOpen && (
          <div className="legend">
            {speciesIds.map((id) => (
              <span className="item" key={id} title={footprintLabel(id)}>
                <span className="dot" style={{ background: speciesColor(id) }} />
                {nameOf(id)} ×{result.counts[id]}
                <span className="tiny" style={{ marginLeft: 4 }}>
                  · {footprintLabel(id)}
                </span>
              </span>
            ))}
            {result.existingBeds.map((b) => (
              <span className="item" key={b.speciesId}>
                {nameOf(b.speciesId)} ×{b.count} (already yours)
              </span>
            ))}
          </div>
        )}

        {props.onSpaceReplace && !changing && (
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="secondary small"
              onClick={() => {
                const first = speciesIds[0] ?? "";
                setOutId(first);
                setOutUnits(1);
                setInId("");
                setChanging(true);
              }}
            >
              I want to change something
            </button>
          </div>
        )}

        {props.onSpaceReplace && changing && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid var(--border, #ddd)",
              background: "rgba(255,255,255,0.5)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Replace by space</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Pick what to take out and what to put in. We convert by garden cells
              (footprint), not 1:1.
            </p>

            <label className="tiny" style={{ display: "block", marginBottom: 4 }}>
              Remove
            </label>
            <select
              value={outId}
              onChange={(e) => {
                setOutId(e.target.value);
                setOutUnits(1);
              }}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {speciesIds.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)} ×{result.counts[id]} · {footprintLabel(id)}
                </option>
              ))}
            </select>

            <label className="tiny" style={{ display: "block", marginBottom: 4 }}>
              How many to replace
            </label>
            <input
              type="number"
              min={1}
              max={Math.max(1, outHave)}
              value={replaceN}
              onChange={(e) => setOutUnits(Number(e.target.value) || 1)}
              style={{ width: 72, marginBottom: 8 }}
            />

            <label className="tiny" style={{ display: "block", marginBottom: 4 }}>
              Replace with
            </label>
            <select
              value={inId}
              onChange={(e) => setInId(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Choose a plant…</option>
              <SpeciesSelectOptions catalog={CATALOG} />
            </select>

            {outS && inS && outId !== inId && (
              <div
                className="tiny"
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  background: "rgba(0,0,0,0.04)",
                  lineHeight: 1.45,
                }}
              >
                <b>Space conversion</b>
                <ul className="clean" style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                  <li>
                    {nameOf(outId)}: {outS.cellsPerPlant[0]}×{outS.cellsPerPlant[1]} ={" "}
                    {outArea} cells each
                  </li>
                  <li>
                    {nameOf(inId)}: {inS.cellsPerPlant[0]}×{inS.cellsPerPlant[1]} ={" "}
                    {inArea} cells each
                  </li>
                  <li>
                    Rate: 1 {nameOf(outId)} ≈ {ratePerOne > 0 ? ratePerOne : "<1"}{" "}
                    {nameOf(inId)}
                    {outArea < inArea
                      ? ` (need ${Math.ceil(inArea / outArea)} ${nameOf(outId)} for 1 ${nameOf(inId)})`
                      : ""}
                  </li>
                  <li>
                    Swapping {replaceN} {nameOf(outId)} frees {freed} cells →{" "}
                    {inGain >= 1 ? (
                      <>
                        <b>
                          +{inGain} {nameOf(inId)}
                        </b>
                        {leftover > 0 ? ` (${leftover} cell leftover)` : ""}
                      </>
                    ) : (
                      <b>not enough space for even 1 {nameOf(inId)}</b>
                    )}
                  </li>
                </ul>
              </div>
            )}

            <div className="row">
              <button
                type="button"
                disabled={!canApply}
                onClick={() => {
                  if (!canApply) return;
                  props.onSpaceReplace!(outId, replaceN, inId);
                }}
              >
                Apply swap
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setChanging(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="row">
          {careAboutCarbon && (
            <>
              <div className="stat">
                <b>{(result.carbon.kgCo2eSeason * frac).toFixed(1)}</b>
                <span>kg CO₂e saved / season</span>
              </div>
              <div className="stat">
                <b>{(result.carbon.kmDrivingEquiv * frac).toFixed(0)}</b>
                <span>km of driving</span>
              </div>
            </>
          )}
          <div className="stat">
            <b>{(result.carbon.foodKgPerSeason * frac).toFixed(1)}</b>
            <span>kg food grown</span>
          </div>
        </div>
        <p className="tiny">
          {Math.round(result.stats.utilization * 100)}% of your space used · solved in{" "}
          {result.stats.solveMs} ms
          {!careAboutCarbon ? " · carbon ignored (your preference)" : ""}
        </p>
      </div>

      {props.onUndoSwap && (
        <div className="row">
          <button className="small secondary" onClick={props.onUndoSwap}>
            ↩ Undo last change
          </button>
        </div>
 )}

      {showGreenerSwaps && result.swaps.length > 0 && (
        <div className="card info">
          <h2>Greener swaps</h2>
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
              <li key={i}> {t.message}</li>
 ))}
          </ul>
        </div>
 )}

      <div className="row">
        {props.onEdit && (
          <button className="secondary" onClick={props.onEdit}>
            Edit my garden
          </button>
        )}
        {props.onSeeProgress && (
          <button className="secondary" onClick={props.onSeeProgress}>
            See plant progress
          </button>
        )}
        {props.onTweak && (
          <button className="secondary" onClick={props.onTweak}>
            ← Tweak space
          </button>
        )}
        {props.onConfirm && <button onClick={props.onConfirm}>Confirm my garden</button>}
      </div>
    </>
 );
}

/** Live Open-Meteo forecast + per-plant tolerance checks via backend /weather.
 *  Uses device GPS when allowed; falls back to Toronto / canned alert offline. */
function WeatherCard(props: { plantIds: string[] }) {
  const idsKey = props.plantIds.join(",");
  const [data, setData] = useState<WeatherData | null | undefined>(undefined);
  const [placeLabel, setPlaceLabel] = useState("your area");

  useEffect(() => {
    let alive = true;
    setData(undefined);
    (async () => {
      const geo = await requestDeviceLocation();
      const d = await fetchWeather(props.plantIds, geo.lat, geo.lon);
      if (!alive) return;
      setData(d);
      const label = d?.location?.resolved?.label;
      if (label) setPlaceLabel(label);
      else if (geo.source === "default") setPlaceLabel("Toronto");
      else setPlaceLabel("your area");
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (data === undefined) {
    return (
      <div className="card">
        <p className="tiny">Checking the sky over {placeLabel}…</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="card warn">
        <h2>{FAKE_WEATHER_ALERT.title}</h2>
        <p className="muted">{FAKE_WEATHER_ALERT.advice}</p>
        <p className="tiny">Offline: demo forecast (live Open-Meteo unavailable)</p>
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
      <h2>{notes.length > 0 ? "Weather guard: alerts" : "Weather guard: clear"}</h2>
      {notes.length === 0 && (
        <p className="muted">All clear in {placeLabel} for the next few days.</p>
      )}
      {notes.map((n, i) => (
        <p className="muted" key={i}>
          <b>
            {n.type === "frost_warning"
              ? "Frost: "
              : n.type === "skip_watering"
                ? "Watering: "
                : "Alert: "}
          </b>
          {n.message}
        </p>
      ))}
      {warnings.map((msg, i) => (
        <p className="muted" key={`p${i}`}>
          {msg}
        </p>
      ))}
      {week.length > 0 && (
        <p className="tiny">
          {week
 .map(
              (d) =>
                `${dayName(d.date)} ${Math.round(d.tempMinC ?? 0)}-${Math.round(d.tempMaxC ?? 0)}°${
                  d.storm ? " " : (d.precipMm ?? 0) >= 2 ? " " : ""
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
function FoodWasteCard(props: { foodKg: number; kgCo2e?: number }) {
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
      <h2>Toronto impact</h2>
      <p className="muted">
        Growing <b>{props.foodKg.toFixed(1)} kg</b> of food covers{" "}
        <b>{local.percentOfFruitVegWaste}%</b> of the average Toronto household's yearly
        fruit &amp; veg waste (45 kg): roughly <b>${local.dollarsSaved}</b> of groceries
        and <b>{local.greenBinKgAvoided} kg</b> kept out of the Green Bin.
      </p>
      <p className="tiny">
        City of Toronto single-family waste audits, 2017-2018
        {liveChecked ? " · verified against backend /impact/food-waste" : " · computed locally"}
      </p>
    </div>
 );
}

/* ─────────────── 6. Dashboard ─────────────── */

/** Switches, renames, creates, or deletes gardens. Shared by DashboardScreen
 *  and the Planner tab's plain view mode: both are "not mid-edit" contexts,
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
            Rename
          </button>
          {/* Two-step arm/confirm instead of window.confirm(): see DevTools. */}
          {deleteArmed ? (
            <button
              className="small"
              onClick={() => props.activeGardenId && props.onDeleteGarden(props.activeGardenId)}
            >
              ! Click again to delete "{activeGarden?.name}"
            </button>
          ) : (
            <button className="small secondary" onClick={() => setDeleteArmed(true)}>
              Delete garden
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
  careAboutCarbon?: boolean;
  cloudId?: string | null;
  gardens: { id: string; name: string }[];
  activeGardenId: string | null;
  onSwitchGarden: (id: string) => void;
  onNewGarden: () => void;
  onRenameGarden: (id: string, name: string) => void;
  onDeleteGarden: (id: string) => void;
  harvestedUnits: string[];
  unitPlantedAt: Record<string, number>;
  lastWateredAt: Record<string, number>;
  onWaterUnit: (unitKey: string) => void;
}) {
  const { result } = props;
  const planted = Object.entries(result.counts).filter(([, n]) => n > 0);
  const { now } = useDevClock();
  const harvestedSet = new Set(props.harvestedUnits);

  // Each cadence group tracks its *own* per-unit due-today check (a unit's
  // anchor shifts to lastWateredAt once it's ever been confirmed, and again
  // to unitPlantedAt on reseed), not one garden-wide day count — matches
  // "Your plants" below, which already tracks per-unit progress this way.
  const trips = new Map<number, { names: Set<string>; dueUnitKeys: string[] }>();
  for (const p of result.placements) {
    const key = cellKey(p.origin[0], p.origin[1]);
    if (harvestedSet.has(key)) continue;
    const s = byId.get(p.speciesId);
    if (!s) continue;
    const entry = trips.get(s.waterEveryDays) ?? { names: new Set<string>(), dueUnitKeys: [] };
    entry.names.add(s.name);
    const anchor = props.lastWateredAt[key] ?? props.unitPlantedAt[key] ?? props.plantedAt;
    if (isUnitDue(now, anchor, s.waterEveryDays)) entry.dueUnitKeys.push(key);
    trips.set(s.waterEveryDays, entry);
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
        kgCo2e={props.careAboutCarbon === false ? undefined : result.carbon.kgCo2eSeason}
      />

      {props.cloudId && (
        <p className="tiny">Layout saved to cloud · id {props.cloudId}</p>
 )}

      {props.careAboutCarbon !== false && props.plantedAt && (
        <CarbonChart plantedAt={props.plantedAt} totalKgCo2eSeason={result.carbon.kgCo2eSeason} />
 )}

      <div className="card">
        <h2>Watering trips</h2>
        <p className="muted">Beds that drink together sit together: one trip each.</p>
        <ul className="clean">
          {[...trips.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([days, { names, dueUnitKeys }]) => (
              <li key={days}>
                <b>Every {days} day{days > 1 ? "s" : ""}:</b> {[...names].join(", ")}
                {dueUnitKeys.length > 0 && <span className="tiny"> · needs water</span>}
              </li>
            ))}
        </ul>
      </div>

      <div className="card">
        <h2>Your plants</h2>
        <p className="muted">
          Each row is one planted spot — tap + to log watering it, or use Harvest /
          Reseed on the Garden Planner.
        </p>
        {planted.map(([id]) => {
          const s = byId.get(id);
          if (!s) return null;
          const units = result.placements.filter((p) => p.speciesId === id);
          if (units.length === 0) return null;
          const harvest = harvestDaysFor(s);
          const harvestRange = harvestRangeLabel(s);
          const growingCount = units.filter(
            (p) => !harvestedSet.has(cellKey(p.origin[0], p.origin[1])),
          ).length;

          return (
            <div key={id} style={{ margin: "14px 0" }}>
              <div className="row spread">
                <span>
                  <span className="dot" style={{ background: speciesColor(id), marginRight: 6 }} />
                  <b>{s.name}</b>{" "}
                  <span className="tiny">
                    ({growingCount}/{units.length} growing)
                  </span>
                </span>
                <span className="tiny">
                  water every {s.waterEveryDays}d ·{" "}
                  {harvest != null
                    ? `~${harvest}d to harvest${harvestRange}`
                    : "ornamental"}
                </span>
              </div>

              <div className="unit-stack">
                {units.map((p) => {
                  const key = cellKey(p.origin[0], p.origin[1]);
                  const isEmpty = harvestedSet.has(key);
                  const effectivePlantedAt = props.unitPlantedAt[key] ?? props.plantedAt;
                  const unitDays = effectivePlantedAt
                    ? Math.max(0, Math.floor((now - effectivePlantedAt) / (24 * 60 * 60 * 1000)))
                    : 0;
                  const denom = harvest ?? 60;
                  const progress = Math.min(1, unitDays / denom);
                  const pct = Math.round(progress * 100);
                  // Watering has its own anchor/clock, separate from the
                  // harvest-progress one above: it shifts to lastWateredAt
                  // once ever confirmed. Once due it STAYS due/clickable
                  // (doesn't grey back out) until actually watered — missing
                  // a day shouldn't hide the button, see isUnitDue().
                  const wateringAnchor =
                    props.lastWateredAt[key] ?? props.unitPlantedAt[key] ?? props.plantedAt;
                  const needsWater =
                    !isEmpty && isUnitDue(now, wateringAnchor, s.waterEveryDays);

                  return (
                    <div
                      key={key}
                      className="unit-row"
                      title={
                        isEmpty
                          ? `Empty: row ${p.origin[0] + 1}, col ${p.origin[1] + 1}`
                          : `Row ${p.origin[0] + 1}, col ${p.origin[1] + 1}: day ${unitDays} of ~${denom} (${pct}%)`
                      }
                    >
                      <span className="unit-label">
                        R{p.origin[0] + 1}C{p.origin[1] + 1}
                      </span>
                      <div className={`unit-bar${isEmpty ? " empty" : ""}`}>
                        {!isEmpty && <div style={{ width: `${Math.max(4, pct)}%` }} />}
                      </div>
                      {!isEmpty && (
                        <button
                          type="button"
                          className={`unit-water-btn${needsWater ? " due" : ""}`}
                          disabled={!needsWater}
                          title={
                            needsWater
                              ? "Log watering this plant (+2 XP)"
                              : `Not due yet — waters every ${s.waterEveryDays}d`
                          }
                          onClick={() => props.onWaterUnit(key)}
                        >
                          +
                        </button>
                      )}
                    </div>
 );
                })}
              </div>
            </div>
 );
        })}
      </div>
    </>
 );
}
