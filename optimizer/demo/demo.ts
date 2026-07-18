import {
  BALCONY,
  L_SHAPE,
  MOCK_CATALOG,
  SUBURBAN,
  optimizeGarden,
  renderAscii,
  type OptimizerRequest,
} from "../src/index";

function show(title: string, req: OptimizerRequest) {
  const res = optimizeGarden(req);
  const line = "═".repeat(64);
  console.log(`\n${line}\n  ${title}\n${line}`);
  console.log(renderAscii(req.garden, res, req.catalog ?? MOCK_CATALOG));
  console.log(`\n  feasible: ${res.feasible}   solved in ${res.stats.solveMs} ms`);
  console.log(
    `  space: ${res.stats.usedCells}/${res.stats.usableCells} cells (${Math.round(res.stats.utilization * 100)}% used)`,
  );
  console.log(
    `  carbon: ${res.carbon.kgCo2eSeason} kg CO₂e saved/season ≈ ${res.carbon.kmDrivingEquiv} km of driving | ${res.carbon.foodKgPerSeason} kg food grown`,
  );
  for (const c of res.conflicts) console.log(`  ⚠ ${c.message}`);
  if (res.compromise) {
    console.log(
      `  compromise: ${Object.entries(res.compromise.original)
        .map(([id, n]) => `${id} ${n}→${res.compromise!.applied[id] ?? 0}`)
        .join(", ")}`,
    );
  }
  for (const s of res.swaps) {
    console.log(`  ↔ swap ${s.out} → ${s.in} (+${s.deltaKgCo2e} kg CO₂e): ${s.reason}`);
  }
  for (const t of res.tasks) console.log(`  ☐ ${t.message}`);
}

show("1. Suburban backyard — balanced (carbonWeight 0.5)", {
  garden: SUBURBAN,
  preferences: { tier: "intermediate", categories: ["veggies", "herbs", "flowers", "pollinator"] },
  targets: [
    { speciesId: "tomato_cherry", min: 2 },
    { speciesId: "watermelon", min: 1 },
  ],
  carbonWeight: 0.5,
});

show("2. Tiny balcony, big dreams — infeasible targets → compromise", {
  garden: BALCONY,
  preferences: { tier: "intermediate", categories: ["veggies", "fruit"] },
  targets: [
    { speciesId: "watermelon", min: 1 },
    { speciesId: "tomato_cherry", min: 5 },
  ],
  carbonWeight: 0.5,
});

show("3. L-shaped yard — area says yes, geometry says no", {
  garden: L_SHAPE,
  preferences: { tier: "intermediate", categories: ["veggies", "fruit"] },
  targets: [{ speciesId: "watermelon", min: 1 }],
  carbonWeight: 0.5,
});

show("4. Same suburban yard, carbonWeight 1.0 — maximum climate mode", {
  garden: SUBURBAN,
  preferences: { tier: "intermediate", categories: ["veggies", "herbs", "flowers", "pollinator"] },
  carbonWeight: 1.0,
});
