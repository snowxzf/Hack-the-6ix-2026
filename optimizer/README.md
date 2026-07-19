# @plottwist/optimizer

The PlotTwist garden brain: a **pure, synchronous, deterministic black box** that turns
a scanned garden + user preferences into an optimal planting layout with carbon math.

No I/O, no network, no randomness. Runs identically in React Native, the browser, or Node.

```
npm install     # once
npm test        # 16 tests
npm run demo    # ASCII gardens in your terminal
```

## Integration (UI)

```ts
import { optimizeGarden, MOCK_CATALOG } from "../optimizer/src/index";

const res = optimizeGarden({
  garden,                                   // GardenGrid from the scan screen
  preferences: { tier: "beginner", categories: ["veggies", "pollinator"] },
  targets: [{ speciesId: "tomato_cherry", min: 2 }],  // user's must-haves
  carbonWeight: 0.5,                        // slider: 0 = ignore CO2, 1 = max savings
  // catalog: jessicasCatalog,              // omit → bundled mock catalog
});

res.placements   // [{ speciesId, origin: [r,c], w, h, cells }] → draw rects
res.beds         // per-species merged cells → coloring + legend
res.feasible     // false → show the compromise dialog
res.compromise   // { original: {watermelon: 4}, applied: {watermelon: 1} }
res.conflicts    // human-readable strings, show them verbatim
res.carbon       // { kgCo2eSeason, foodKgPerSeason, kmDrivingEquiv }
res.swaps        // "swap X → Y, save Z kg CO2e" cards
res.tasks        // "move the bike at row 1, col 2" checklist items
res.stats.solveMs  // brag number for the pitch (~2–20 ms)
```

Replace `MOCK_CATALOG` by passing `catalog:` with real curated species.
The shape is `Species` in [src/types.ts](src/types.ts) — **`cellsPerPlant` must
already be converted to grid cells** (1 cell = 30 cm; one "plant" = one planting
unit at recommended density, square-foot-gardening style).

## How the algorithm works

The honest problem is 2D bin packing with side constraints: NP-hard. We decompose
into three fast stages (total: milliseconds, runs on-device):

**Stage A — Allocation** (`allocate.ts`): *how many of each species?*
Bounded knapsack over total usable area, solved greedily with diminishing
returns (each extra unit of a species is worth 0.8× the previous one).
Diminishing returns make the objective submodular → greedy is provably
near-optimal *and* naturally plants a diverse garden instead of 40 tomatoes.
Utility blends user preference with carbon savings via `carbonWeight`.
Hard targets are seeded first; if they don't fit, we flag infeasibility and
compromise by scaling targets proportionally (keeping the user's ratios).

**Stage B — Placement** (`place.ts`): *where does everything go?*
Grid-based First-Fit Decreasing with north-west scanline and rotation.
The sort order encodes the horticulture:
1. **hard targets first** — the user's must-haves claim geometry before filler;
2. **tall species first** → they land on the north edge and don't shade neighbours;
3. **big footprints first** → classic FFD, big blocks before fragmentation;
4. **similar watering needs adjacent** → beds that drink together sit together,
   which is what lets the app batch watering into one trip.

Position scoring: strong bonus for touching your own species (contiguous beds —
"a square of lilies beside a square of petunias"), perimeter-contact bonus for
hugging walls/edges (tight packing, no dead gutters), mild bonus for companion
adjacency (basil next to tomatoes), mild penalty for movable obstacles (only
make the user move the bike when it's worth it — then emit a task).

**Stage C — Carbon** (`carbon.ts`): savings = Σ count × yield × CO₂e-per-kg
displaced vs store-bought, plus advisory same-category swap suggestions.

Placement truth wins: if geometry can't fit what area math promised (L-shaped
yards!), counts reflect reality and a conflict explains why.

## References (for the slides)

| Work | What we use it for |
|---|---|
| Bartholomew, *Square Foot Gardening* (1981) | The grid model: gardens as ~30 cm cells, one planting unit per block at recommended density |
| Johnson, Demers, Ullman, Garey & Graham (1974), *SIAM J. Computing* | First-Fit Decreasing: place biggest footprints first |
| Baker, Coffman & Rivest (1980), *SIAM J. Computing* | Bottom-Left–style 2D packing heuristic (our north-west scanline) |
| Nemhauser, Wolsey & Fisher (1978), *Mathematical Programming* | Greedy on diminishing-returns (submodular) objectives is near-optimal — why our allocation is principled, not a hack |
| Sviridenko (2004), *Operations Research Letters* | Submodular maximization under a knapsack constraint — our exact allocation setting |
| Jylänki, "A Thousand Ways to Pack the Bin" (2010) | Survey of rectangle-packing heuristics; inspired the perimeter-contact (edge-fitting) bonus |
| Poore & Nemecek (2018), *Science* | Per-food CO₂e factors (via Our World in Data) — basis for `co2eSavedPerKg` |
| Cleveland et al. (2017), *Landscape and Urban Planning* | Evidence household vegetable gardens can reduce GHG emissions — pitch framing (verify exact numbers before quoting) |

## Placeholders we need to replace before judging

- `MOCK_CATALOG` numbers (yields, CO₂e factors, spacing) → live catalog via
  `GET /plants?optimizer=true` (seeded from `database/plants_curated.json`)
- `KG_CO2E_PER_KM_DRIVEN = 0.2` in `carbon.ts` → research team verifies
- Mock gardens in `gardens.mock.ts` → real scan output from `yard-scan` / `app`

See the [root README](../README.md) for how the app wires this engine in.
