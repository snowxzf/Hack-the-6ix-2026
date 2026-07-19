import { allocate } from "./allocate";
import { carbonReport, suggestSwaps } from "./carbon";
import { MOCK_CATALOG } from "./catalog.mock";
import { place } from "./place";
import type { Conflict, OptimizerRequest, OptimizerResponse } from "./types";

export * from "./types";
export { MOCK_CATALOG } from "./catalog.mock";
export { SUBURBAN, BALCONY, L_SHAPE, NARROW_STRIP } from "./gardens.mock";
export { renderAscii } from "./ascii";
/** Recompute carbon totals from a counts map — reused by the UI for manual
 *  (non-solver) layout edits like clicking a specific cell to add/remove. */
export { carbonReport } from "./carbon";

/**
 * PlotTwist optimizer: pure, synchronous, deterministic black box.
 * No I/O, no network, no randomness: same request in, same layout out.
 * Runs identically in React Native, the browser, or Node.
 */
export function optimizeGarden(req: OptimizerRequest): OptimizerResponse {
  const t0 = performance.now();
  const catalog = req.catalog ?? MOCK_CATALOG;
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const targetIds = new Set((req.targets ?? []).map((t) => t.speciesId));

  // Stage A: how many of each species.
  const alloc = allocate(req, catalog);

  // Stage B: where they go. Hard targets get placement priority.
  const placed = place(req.garden, alloc.plan, catalog, targetIds);

  // Post-placement truth: counts reflect what actually fit the geometry.
  const counts = new Map<string, number>();
  for (const p of placed.placements) {
    counts.set(p.speciesId, (counts.get(p.speciesId) ?? 0) + 1);
  }

  // Geometry shortfalls on hard targets flip feasibility.
  let feasible = alloc.feasible;
  const conflicts: Conflict[] = [...alloc.conflicts];
  for (const [id, applied] of alloc.appliedTargets) {
    const got = counts.get(id) ?? 0;
    if (got < applied) {
      feasible = false;
      const name = byId.get(id)?.name ?? id;
      conflicts.push({
        speciesId: id,
        message: `Only ${got} of ${applied} ${name} fit this garden's shape: the space is too fragmented. Try selecting a wider area.`,
      });
    }
  }

  // Stage C: carbon math + advisory swaps (skipped when user opted out).
  const cw = Math.min(1, Math.max(0, req.carbonWeight ?? 0.5));
  const carbon = carbonReport(counts, catalog);
  const swaps = cw <= 0 ? [] : suggestSwaps(counts, alloc.candidates, targetIds);

  return {
    feasible,
    conflicts,
    compromise: alloc.compromise,
    counts: Object.fromEntries(counts),
    placements: placed.placements,
    beds: placed.beds,
    existingBeds: placed.existingBeds,
    carbon,
    swaps,
    tasks: placed.tasks,
    stats: {
      usableCells: alloc.usableCells,
      usedCells: placed.usedCells,
      utilization:
        alloc.usableCells === 0
          ? 0
          : Math.round((placed.usedCells / alloc.usableCells) * 1000) / 1000,
      solveMs: Math.round((performance.now() - t0) * 100) / 100,
    },
  };
}
