/**
 * Thin client for the PlotTwist FastAPI backend.
 *
 * Design rule: every call returns `null` on ANY failure (backend down, venue
 * wifi dead, timeout) — callers always have a local fallback, so the demo can
 * never be taken down by the network. Timeouts are short on purpose.
 */
import type { Species } from "../../optimizer/src/index";

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

/** Toronto City Hall — demo default until device GPS is wired. */
export const DEFAULT_LAT = 43.6532;
export const DEFAULT_LON = -79.3832;

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 4500,
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // offline / timeout / CORS — caller falls back
  } finally {
    clearTimeout(timer);
  }
}

/* ── Catalog ─────────────────────────────────────────────── */

export async function fetchLiveCatalog(): Promise<Species[] | null> {
  const j = await request<{ plants: Species[] }>("/plants?optimizer=true");
  return j?.plants?.length ? j.plants : null;
}

/* ── Weather ─────────────────────────────────────────────── */

export interface WeatherDay {
  date: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  precipMm: number | null;
  precipProbabilityPct: number | null;
  weather: string | null;
  storm: boolean;
}
export interface WeatherNotification {
  type: string;
  message: string;
}
export interface PlantCheck {
  plantId: string;
  name?: string;
  ok: boolean;
  /** Present on unknown-plant entries only. */
  type?: string;
  message?: string;
  /** Tolerance problems live here: [{type, message, ...}]. */
  issues?: { type: string; message: string }[];
}
export interface WeatherData {
  sky?: {
    now?: { tempC: number | null; weather: string | null };
    week?: WeatherDay[];
  };
  notifications?: WeatherNotification[];
  plantChecks?: PlantCheck[];
}

export function fetchWeather(plantIds: string[]): Promise<WeatherData | null> {
  const ids = encodeURIComponent(plantIds.join(","));
  return request<WeatherData>(
    `/weather?lat=${DEFAULT_LAT}&lon=${DEFAULT_LON}&plantIds=${ids}`,
    undefined,
    8000, // Open-Meteo upstream can be slow-ish; still bounded
  );
}

/* ── Location-aware suggestions ──────────────────────────── */

export interface Suggestion {
  score: number;
  reasons?: string[];
  species: Species;
}

export async function fetchSuggestions(
  tier: string,
  carbonWeight: number,
): Promise<Suggestion[] | null> {
  const j = await request<{ suggestions: Suggestion[] }>(
    `/plants/suggest?lat=${DEFAULT_LAT}&lon=${DEFAULT_LON}&tier=${tier}&carbonWeight=${carbonWeight}&limit=6`,
    undefined,
    8000,
  );
  return j?.suggestions?.length ? j.suggestions : null;
}

/* ── PlantNet identify ───────────────────────────────────── */

export interface IdentifyCandidate {
  scientificName?: string;
  commonNames?: string[];
  score?: number;
  catalogMatch?: Species | null;
}
export interface IdentifyResult {
  bestMatch?: { catalogMatch?: Species | null } | null;
  candidates?: IdentifyCandidate[];
}

export function identifyPlant(file: File): Promise<IdentifyResult | null> {
  const form = new FormData();
  form.append("image", file);
  return request<IdentifyResult>("/identify", { method: "POST", body: form }, 15000);
}

/* ── Gardens (cloud save) ────────────────────────────────── */

export async function saveGardenToCloud(payload: unknown): Promise<string | null> {
  const j = await request<{ id: string; ok: boolean }>("/gardens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return j?.ok ? j.id : null;
}

/* ── Toronto food-waste impact ───────────────────────────── */

export interface FoodWasteImpact {
  [k: string]: unknown;
  percentOfFruitVegWaste?: number;
  percentOfAvoidableWaste?: number;
  percentOfTotalWaste?: number;
  greenBinKgAvoided?: number;
  dollarsSaved?: number;
}

export function fetchFoodWasteImpact(
  foodKg: number,
  kgCo2e?: number,
): Promise<FoodWasteImpact | null> {
  const q = kgCo2e != null ? `&kgCo2e=${kgCo2e}` : "";
  return request<FoodWasteImpact>(`/impact/food-waste?foodKg=${foodKg}${q}`);
}

/**
 * Same math as backend/food_waste_stats.py, run locally when offline —
 * City of Toronto 2017–2018 audit baselines (see repo README).
 */
export function localFoodWasteImpact(foodKg: number): FoodWasteImpact {
  return {
    percentOfFruitVegWaste: Math.round((foodKg / 45) * 100),
    percentOfAvoidableWaste: Math.round((foodKg / 100) * 100),
    percentOfTotalWaste: Math.round((foodKg / 200) * 100),
    greenBinKgAvoided: Math.round(foodKg * 0.8 * 10) / 10,
    dollarsSaved: Math.round((foodKg / 100) * 1300),
  };
}
