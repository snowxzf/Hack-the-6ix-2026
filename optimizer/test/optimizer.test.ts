import { describe, expect, it } from "vitest";
import {
  BALCONY,
  L_SHAPE,
  MOCK_CATALOG,
  NARROW_STRIP,
  SUBURBAN,
  optimizeGarden,
  type GardenGrid,
  type OptimizerRequest,
  type OptimizerResponse,
} from "../src/index";

const openGarden = (rows: number, cols: number): GardenGrid => ({
  cellSizeCm: 30,
  rows,
  cols,
  cells: Array.from({ length: rows * cols }, (_, i) => ({
    r: Math.floor(i / cols),
    c: i % cols,
    state: "selected" as const,
  })),
});

const allTiers = { tier: "advanced" as const, categories: [] };

function usableStates(garden: GardenGrid): Map<string, string> {
  return new Map(garden.cells.map((c) => [`${c.r},${c.c}`, c.state]));
}

function assertPlacementsValid(garden: GardenGrid, res: OptimizerResponse) {
  const states = usableStates(garden);
  const seen = new Set<string>();
  for (const p of res.placements) {
    for (const [r, c] of p.cells) {
      const key = `${r},${c}`;
      expect(seen.has(key), `overlap at ${key}`).toBe(false);
      seen.add(key);
      const state = states.get(key);
      expect(
        state === "selected" || state === "obstacle_movable",
        `planted on ${state ?? "outside"} at ${key}`,
      ).toBe(true);
    }
  }
}

describe("hard targets", () => {
  it("meets feasible targets exactly or better", () => {
    const res = optimizeGarden({
      garden: SUBURBAN,
      preferences: allTiers,
      targets: [
        { speciesId: "tomato_cherry", min: 2 },
        { speciesId: "lavender", min: 1 },
      ],
    });
    expect(res.feasible).toBe(true);
    expect(res.counts["tomato_cherry"]).toBeGreaterThanOrEqual(2);
    expect(res.counts["lavender"]).toBeGreaterThanOrEqual(1);
  });

  it("flags infeasible targets, compromises, and still returns a layout", () => {
    const res = optimizeGarden({
      garden: BALCONY, // 12 cells
      preferences: allTiers,
      targets: [{ speciesId: "tomato_cherry", min: 5 }], // needs 20 cells
    });
    expect(res.feasible).toBe(false);
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.compromise).toBeDefined();
    expect(res.compromise!.original["tomato_cherry"]).toBe(5);
    expect(res.compromise!.applied["tomato_cherry"]).toBeLessThan(5);
    // Area math says 3 fit in 12 cells; geometry says only two 2×2 beds
    // tile a 3-row balcony. Placement truth wins and gets its own conflict.
    expect(res.counts["tomato_cherry"]).toBe(2);
    expect(res.conflicts.some((c) => c.message.includes("fragmented"))).toBe(true);
    expect(res.placements.length).toBeGreaterThan(0);
  });

  it("rejects footprints that cannot fit the grid dimensions at all", () => {
    const res = optimizeGarden({
      garden: BALCONY, // 4×3 — a 6×6 watermelon can never fit
      preferences: allTiers,
      targets: [{ speciesId: "watermelon", min: 1 }],
    });
    expect(res.counts["watermelon"] ?? 0).toBe(0);
    expect(res.conflicts.some((c) => c.speciesId === "watermelon")).toBe(true);
  });

  it("detects geometric infeasibility the area math misses (L-shape)", () => {
    const res = optimizeGarden({
      garden: L_SHAPE, // 68 usable cells but no 6×6 region
      preferences: allTiers,
      targets: [{ speciesId: "watermelon", min: 1 }],
    });
    expect(res.feasible).toBe(false);
    expect(res.counts["watermelon"] ?? 0).toBe(0);
    expect(res.conflicts.some((c) => c.speciesId === "watermelon")).toBe(true);
  });
});

describe("placement validity", () => {
  it("never overlaps, never plants outside usable cells", () => {
    const res = optimizeGarden({
      garden: SUBURBAN,
      preferences: allTiers,
      targets: [{ speciesId: "watermelon", min: 2 }],
    });
    assertPlacementsValid(SUBURBAN, res);
    expect(res.counts["watermelon"]).toBe(2); // fits: one per path-side
  });

  it("preserves existing plants and reports them as beds", () => {
    const res = optimizeGarden({ garden: SUBURBAN, preferences: allTiers });
    const lilies = res.existingBeds.find((b) => b.speciesId === "lily");
    expect(lilies?.count).toBe(3);
    const lilyCells = new Set(lilies!.cells.map(([r, c]) => `${r},${c}`));
    for (const p of res.placements) {
      for (const [r, c] of p.cells) {
        expect(lilyCells.has(`${r},${c}`)).toBe(false);
      }
    }
  });

  it("uses movable-obstacle cells only with a matching task", () => {
    const res = optimizeGarden({
      garden: STRIP_WITH_BIKE, // 2×6 strip; bike occupies the left column
      preferences: allTiers,
      targets: [{ speciesId: "tomato_cherry", min: 3 }], // three 2×2 = all 12 cells
    });
    expect(res.feasible).toBe(true);
    expect(res.counts["tomato_cherry"]).toBe(3);
    expect(res.tasks.length).toBe(2); // both bike cells got planted over
  });

  it("rotates non-square footprints to fit narrow spaces", () => {
    const res = optimizeGarden({
      garden: NARROW_STRIP, // 2 cols × 4 rows; pumpkin is 4×2
      preferences: allTiers,
      targets: [{ speciesId: "pumpkin", min: 1 }],
    });
    expect(res.feasible).toBe(true);
    expect(res.counts["pumpkin"]).toBe(1);
    expect(res.placements[0].w).toBe(2);
    expect(res.placements[0].h).toBe(4);
  });
});

describe("horticultural placement rules", () => {
  it("places tall species north of short ones", () => {
    const res = optimizeGarden({
      garden: openGarden(10, 10),
      preferences: allTiers,
      targets: [
        { speciesId: "sunflower", min: 4 }, // 250 cm
        { speciesId: "lettuce", min: 4 }, // 25 cm
      ],
      carbonWeight: 0,
    });
    const meanRow = (id: string) => {
      const cells = res.beds.find((b) => b.speciesId === id)!.cells;
      return cells.reduce((s, [r]) => s + r, 0) / cells.length;
    };
    expect(meanRow("sunflower")).toBeLessThan(meanRow("lettuce"));
  });

  it("keeps species beds contiguous", () => {
    const res = optimizeGarden({
      garden: openGarden(10, 10),
      preferences: allTiers,
      targets: [{ speciesId: "tomato_cherry", min: 4 }],
    });
    const cells = res.beds.find((b) => b.speciesId === "tomato_cherry")!.cells;
    const set = new Set(cells.map(([r, c]) => `${r},${c}`));
    const stack = [cells[0]];
    const visited = new Set([`${cells[0][0]},${cells[0][1]}`]);
    while (stack.length) {
      const [r, c] = stack.pop()!;
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        const key = `${nr},${nc}`;
        if (set.has(key) && !visited.has(key)) {
          visited.add(key);
          stack.push([nr, nc]);
        }
      }
    }
    expect(visited.size).toBe(cells.length); // one connected bed
  });
});

describe("diversity and carbon", () => {
  it("plants a diverse garden, not a monoculture", () => {
    const res = optimizeGarden({
      garden: openGarden(8, 8),
      preferences: { tier: "beginner", categories: [] },
      carbonWeight: 0.5,
    });
    expect(Object.keys(res.counts).length).toBeGreaterThanOrEqual(3);
  });

  it("carbonWeight 1 saves at least as much CO2e as carbonWeight 0", () => {
    const base: Omit<OptimizerRequest, "carbonWeight"> = {
      garden: openGarden(8, 8),
      preferences: { tier: "intermediate", categories: ["veggies", "pollinator"] },
    };
    const low = optimizeGarden({ ...base, carbonWeight: 0 });
    const high = optimizeGarden({ ...base, carbonWeight: 1 });
    expect(high.carbon.kgCo2eSeason).toBeGreaterThanOrEqual(low.carbon.kgCo2eSeason);
  });

  it("carbon totals equal the hand-computed sum", () => {
    const res = optimizeGarden({
      garden: openGarden(4, 4),
      preferences: allTiers,
      targets: [{ speciesId: "tomato_cherry", min: 2 }],
      carbonWeight: 0,
      catalog: MOCK_CATALOG.filter((s) => s.id === "tomato_cherry"),
    });
    expect(res.counts["tomato_cherry"]).toBe(4); // fills all 16 cells
    expect(res.carbon.kgCo2eSeason).toBeCloseTo(4 * 3.0 * 1.4, 1);
  });

  it("suggests positive-delta swaps and never touches hard targets", () => {
    const res = optimizeGarden({
      garden: openGarden(4, 4),
      preferences: { tier: "intermediate", categories: ["veggies"] },
      targets: [{ speciesId: "lettuce", min: 2 }],
      carbonWeight: 0,
    });
    for (const s of res.swaps) {
      expect(s.deltaKgCo2e).toBeGreaterThan(0);
      expect(s.out).not.toBe("lettuce");
    }
  });
});

describe("engineering guarantees", () => {
  it("is deterministic — same request, same layout", () => {
    const req: OptimizerRequest = {
      garden: SUBURBAN,
      preferences: { tier: "intermediate", categories: ["veggies", "herbs", "flowers"] },
      targets: [{ speciesId: "tomato_cherry", min: 2 }],
      carbonWeight: 0.5,
    };
    const a = optimizeGarden(req);
    const b = optimizeGarden(req);
    expect(JSON.stringify({ ...a, stats: null })).toBe(JSON.stringify({ ...b, stats: null }));
  });

  it("solves a full backyard in under 250 ms", () => {
    const res = optimizeGarden({
      garden: openGarden(20, 20),
      preferences: allTiers,
      carbonWeight: 0.5,
    });
    expect(res.stats.solveMs).toBeLessThan(250);
  });
});

const STRIP_WITH_BIKE: GardenGrid = {
  cellSizeCm: 30,
  cols: 6,
  rows: 2,
  cells: Array.from({ length: 12 }, (_, i) => {
    const r = Math.floor(i / 6);
    const c = i % 6;
    return {
      r,
      c,
      state: c === 0 ? ("obstacle_movable" as const) : ("selected" as const),
    };
  }),
};
