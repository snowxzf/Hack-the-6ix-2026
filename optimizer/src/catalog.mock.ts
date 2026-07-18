import type { Species } from "./types";

/**
 * MOCK CATALOG — 14 species with plausible-but-placeholder numbers.
 * Jessica replaces this with the curated catalog (MongoDB / plants.json).
 *
 * Harvest days for veggies match database/plants_curated.json (OpenPlantDB-
 * verified baselines). Fruit/herb first-harvest values are seed-packet
 * typicals until those records get the same treatment.
 *
 * PLACEHOLDER numbers to verify before the pitch:
 *  - yieldKgPerSeason: rough home-garden yields per planting unit.
 *  - co2eSavedPerKg: derive from Poore & Nemecek (2018) via Our World in Data.
 *  - cellsPerPlant: from seed-packet spacing at 30 cm cells (square-foot method).
 */
export const MOCK_CATALOG: Species[] = [
  {
    id: "tomato_cherry", name: "Cherry tomato", tier: "beginner", category: "veggies",
    cellsPerPlant: [2, 2], sun: "full", waterEveryDays: 2, heightCm: 150,
    yieldKgPerSeason: 3.0, co2eSavedPerKg: 1.4, companions: ["basil", "marigold", "carrot"],
    daysToHarvest: 65, daysToHarvestMin: 55, daysToHarvestMax: 80,
  },
  {
    id: "lettuce", name: "Lettuce", tier: "beginner", category: "veggies",
    cellsPerPlant: [1, 1], sun: "partial", waterEveryDays: 2, heightCm: 25,
    yieldKgPerSeason: 0.8, co2eSavedPerKg: 0.9, companions: [],
    daysToHarvest: 50, daysToHarvestMin: 35, daysToHarvestMax: 60,
  },
  {
    id: "carrot", name: "Carrot", tier: "beginner", category: "veggies",
    cellsPerPlant: [1, 1], sun: "full", waterEveryDays: 3, heightCm: 30,
    yieldKgPerSeason: 1.6, co2eSavedPerKg: 0.4, companions: ["tomato_cherry"],
    daysToHarvest: 75, daysToHarvestMin: 60, daysToHarvestMax: 90,
  },
  {
    id: "zucchini", name: "Zucchini", tier: "intermediate", category: "veggies",
    cellsPerPlant: [3, 3], sun: "full", waterEveryDays: 2, heightCm: 90,
    yieldKgPerSeason: 4.5, co2eSavedPerKg: 0.9, companions: [],
    daysToHarvest: 50, daysToHarvestMin: 40, daysToHarvestMax: 60,
  },
  {
    id: "basil", name: "Basil", tier: "beginner", category: "herbs",
    cellsPerPlant: [1, 1], sun: "full", waterEveryDays: 2, heightCm: 45,
    yieldKgPerSeason: 0.5, co2eSavedPerKg: 1.0, companions: ["tomato_cherry"],
    daysToHarvest: 35, daysToHarvestMin: 25, daysToHarvestMax: 45,
  },
  {
    id: "mint", name: "Mint", tier: "beginner", category: "herbs",
    cellsPerPlant: [1, 1], sun: "partial", waterEveryDays: 2, heightCm: 40,
    yieldKgPerSeason: 0.4, co2eSavedPerKg: 1.0, companions: [],
    daysToHarvest: 40, daysToHarvestMin: 30, daysToHarvestMax: 55,
  },
  {
    id: "watermelon", name: "Watermelon", tier: "intermediate", category: "fruit",
    cellsPerPlant: [6, 6], sun: "full", waterEveryDays: 2, heightCm: 40,
    yieldKgPerSeason: 9.0, co2eSavedPerKg: 0.9, companions: [],
    daysToHarvest: 85, daysToHarvestMin: 70, daysToHarvestMax: 100,
  },
  {
    id: "pumpkin", name: "Pumpkin", tier: "advanced", category: "fruit",
    cellsPerPlant: [4, 2], sun: "full", waterEveryDays: 3, heightCm: 45,
    yieldKgPerSeason: 6.0, co2eSavedPerKg: 0.9, companions: [],
    daysToHarvest: 100, daysToHarvestMin: 90, daysToHarvestMax: 120,
  },
  {
    id: "strawberry", name: "Strawberry", tier: "beginner", category: "fruit",
    cellsPerPlant: [1, 1], sun: "full", waterEveryDays: 2, heightCm: 20,
    yieldKgPerSeason: 0.7, co2eSavedPerKg: 1.2, companions: [],
    daysToHarvest: 90, daysToHarvestMin: 60, daysToHarvestMax: 120,
  },
  {
    id: "sunflower", name: "Sunflower", tier: "beginner", category: "flowers",
    cellsPerPlant: [1, 1], sun: "full", waterEveryDays: 3, heightCm: 250,
    yieldKgPerSeason: 0, co2eSavedPerKg: 0, companions: [],
  },
  {
    id: "marigold", name: "Marigold", tier: "beginner", category: "flowers",
    cellsPerPlant: [1, 1], sun: "full", waterEveryDays: 3, heightCm: 30,
    yieldKgPerSeason: 0, co2eSavedPerKg: 0, companions: ["tomato_cherry"],
  },
  {
    id: "lily", name: "Lily", tier: "beginner", category: "flowers",
    cellsPerPlant: [1, 1], sun: "partial", waterEveryDays: 4, heightCm: 80,
    yieldKgPerSeason: 0, co2eSavedPerKg: 0, companions: [],
  },
  {
    id: "lavender", name: "Lavender", tier: "beginner", category: "pollinator",
    cellsPerPlant: [2, 2], sun: "full", waterEveryDays: 7, heightCm: 60,
    yieldKgPerSeason: 0, co2eSavedPerKg: 0, companions: [],
  },
  {
    id: "coneflower", name: "Coneflower", tier: "intermediate", category: "pollinator",
    cellsPerPlant: [2, 2], sun: "full", waterEveryDays: 5, heightCm: 100,
    yieldKgPerSeason: 0, co2eSavedPerKg: 0, companions: [],
  },
];
