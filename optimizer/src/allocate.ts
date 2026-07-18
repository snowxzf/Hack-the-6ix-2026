import type {
  CompromiseInfo,
  Conflict,
  GardenGrid,
  OptimizerRequest,
  Species,
  Target,
} from "./types";

/**
 * Stage A: allocation: decide HOW MANY of each species to plant.
 *
 * Modeled as a bounded knapsack over total usable area, solved greedily with
 * diminishing returns (each extra unit of a species is worth DECAY× the last).
 * Diminishing returns make the objective submodular, where greedy is provably
 * near-optimal (Nemhauser-Wolsey-Fisher 1978; knapsack variant Sviridenko 2004)
 *: and it naturally produces a diverse garden instead of a monoculture.
 *
 * Hard targets are seeded first. If they can't all fit, we flag infeasibility
 * and compromise by scaling targets down proportionally (keeping the user's
 * ratios), then topping back up round-robin while space remains.
 */

const DECAY = 0.8;

export interface AllocationOutcome {
  candidates: Species[];
  plan: Map<string, number>;
  appliedTargets: Map<string, number>;
  feasible: boolean;
  conflicts: Conflict[];
  compromise?: CompromiseInfo;
  usableCells: number;
}

const TIER_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

export function areaOf(s: Species): number {
  return s.cellsPerPlant[0] * s.cellsPerPlant[1];
}

export function fitsGridDims(s: Species, g: GardenGrid): boolean {
  const [w, h] = s.cellsPerPlant;
  return (w <= g.cols && h <= g.rows) || (h <= g.cols && w <= g.rows);
}

export function carbonPerUnit(s: Species): number {
  return s.yieldKgPerSeason * s.co2eSavedPerKg;
}

export function allocate(req: OptimizerRequest, catalog: Species[]): AllocationOutcome {
  const garden = req.garden;
  const cw = Math.min(1, Math.max(0, req.carbonWeight ?? 0.5));
  const targets: Target[] = req.targets ?? [];
  const targetIds = new Set(targets.map((t) => t.speciesId));
  const categories = req.preferences?.categories ?? [];
  const userRank = TIER_RANK[req.preferences?.tier ?? "advanced"];
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const conflicts: Conflict[] = [];

  const usableCells = garden.cells.filter(
    (c) => c.state === "selected" || c.state === "obstacle_movable",
  ).length;

  // Candidate pool: user's tier + categories; hard targets always included.
  const candidates = catalog.filter(
    (s) =>
      targetIds.has(s.id) ||
      (TIER_RANK[s.tier] <= userRank &&
        (categories.length === 0 || categories.includes(s.category))),
  );

  // Validate targets before doing math with them.
  const validTargets: { s: Species; min: number }[] = [];
  for (const t of targets) {
    const s = byId.get(t.speciesId);
    if (!s) {
      conflicts.push({
        speciesId: t.speciesId,
        message: `Unknown species "${t.speciesId}": not in the catalog.`,
      });
      continue;
    }
    if (!fitsGridDims(s, garden)) {
      conflicts.push({
        speciesId: s.id,
        message: `${s.name} needs a ${s.cellsPerPlant[0]}×${s.cellsPerPlant[1]}-cell bed and cannot fit this garden, even rotated.`,
      });
      continue;
    }
    if (t.min > 0) validTargets.push({ s, min: t.min });
  }

  // Feasibility gate: do the hard targets even fit by raw area?
  const requiredArea = validTargets.reduce((sum, t) => sum + areaOf(t.s) * t.min, 0);
  let feasible = requiredArea <= usableCells;
  let compromise: CompromiseInfo | undefined;
  const appliedTargets = new Map<string, number>();

  if (feasible) {
    for (const t of validTargets) appliedTargets.set(t.s.id, t.min);
  } else {
    // Compromise: scale everyone down proportionally, then top up round-robin.
    const scale = usableCells / requiredArea;
    let used = 0;
    for (const t of validTargets) {
      const applied = Math.floor(t.min * scale);
      appliedTargets.set(t.s.id, applied);
      used += applied * areaOf(t.s);
    }
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const t of validTargets) {
        const current = appliedTargets.get(t.s.id) ?? 0;
        if (current < t.min && used + areaOf(t.s) <= usableCells) {
          appliedTargets.set(t.s.id, current + 1);
          used += areaOf(t.s);
          progressed = true;
        }
      }
    }
    conflicts.push({
      message: `Your must-haves need ${requiredArea} cells but only ${usableCells} are selected: scaled them down proportionally to fit.`,
    });
    for (const t of validTargets) {
      if ((appliedTargets.get(t.s.id) ?? 0) === 0) {
        conflicts.push({
          speciesId: t.s.id,
          message: `No room for any ${t.s.name} (needs ${areaOf(t.s)} cells per plant). Try selecting more space.`,
        });
      }
    }
    compromise = {
      strategy: "scaled_targets",
      original: Object.fromEntries(validTargets.map((t) => [t.s.id, t.min])),
      applied: Object.fromEntries(appliedTargets),
    };
  }

  // Seed the plan with (possibly compromised) targets.
  const plan = new Map<string, number>();
  let remaining = usableCells;
  for (const [id, n] of appliedTargets) {
    plan.set(id, n);
    remaining -= areaOf(byId.get(id)!) * n;
  }

  // Greedy fill by marginal utility per cell, with diminishing returns.
  const maxCarbon = Math.max(1e-9, ...candidates.map(carbonPerUnit));
  const utility = (s: Species) => (1 - cw) * 1 + cw * (carbonPerUnit(s) / maxCarbon);

  let guard = 100_000;
  while (remaining > 0 && guard-- > 0) {
    let best: Species | null = null;
    let bestMarginal = -1;
    for (const s of candidates) {
      const area = areaOf(s);
      if (area > remaining || !fitsGridDims(s, garden)) continue;
      const count = plan.get(s.id) ?? 0;
      const marginal = (utility(s) * Math.pow(DECAY, count)) / area;
      if (
        marginal > bestMarginal + 1e-12 ||
        (Math.abs(marginal - bestMarginal) <= 1e-12 &&
          best !== null &&
          (area < areaOf(best) || (area === areaOf(best) && s.id < best.id)))
      ) {
        best = s;
        bestMarginal = marginal;
      }
    }
    if (!best) break;
    plan.set(best.id, (plan.get(best.id) ?? 0) + 1);
    remaining -= areaOf(best);
  }

  return { candidates, plan, appliedTargets, feasible, conflicts, compromise, usableCells };
}
