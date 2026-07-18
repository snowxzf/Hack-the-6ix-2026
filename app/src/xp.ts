/**
 * XP/level/streak rules — single source of truth matching the README's
 * "🎮 XP system" section. Pure constants/functions only, no React, so
 * App.tsx's tick logic and the corner XP badge can both use them.
 */

export const XP_WATER_PER_PLANT = 2;
export const XP_HARVEST = 5;
export const XP_RESEED = 3;
export const XP_CARBON_MILESTONE = 20;
export const CARBON_MILESTONE_KG = 5;
export const XP_MISSED_WATERING = -4;
export const XP_UNHARVESTED_WEEKLY = -2;

export const STREAK_BONUSES: Record<number, number> = { 3: 10, 7: 25, 30: 150 };

export interface LevelInfo {
  level: number;
  title: string;
  emoji: string;
  minXp: number;
}

// Matches the README's Levels table exactly.
export const LEVELS: LevelInfo[] = [
  { level: 1, title: "Seedling", emoji: "🌱", minXp: 0 },
  { level: 2, title: "Dirt Enthusiast", emoji: "🪴", minXp: 150 },
  { level: 3, title: "Master Grower", emoji: "🌻", minXp: 400 },
  { level: 4, title: "Legendary Gardener", emoji: "👑", minXp: 800 },
];

export function levelForXp(xp: number): LevelInfo {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.minXp) current = l;
  }
  return current;
}

export function nextLevelForXp(xp: number): LevelInfo | null {
  const current = levelForXp(xp);
  return LEVELS.find((l) => l.level === current.level + 1) ?? null;
}

/** XP can never drop below the floor of the level you're currently at —
 * losses slow the climb to the next level, never demote you. */
export function clampXpLoss(currentXp: number, delta: number): number {
  if (delta >= 0) return currentXp + delta;
  const floor = levelForXp(currentXp).minXp;
  return Math.max(floor, currentXp + delta);
}
