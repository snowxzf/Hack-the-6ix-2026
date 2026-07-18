/**
 * Thin client for the PlotTwist FastAPI backend.
 *
 * Design rule: every call returns `null` on ANY failure (backend down, venue
 * wifi dead, timeout): callers always have a local fallback, so the demo can
 * never be taken down by the network. Timeouts are short on purpose.
 */
import type { Species } from "../../optimizer/src/index";

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

/** Toronto City Hall: fallback when GPS is denied / unavailable. */
export const DEFAULT_LAT = 43.6532;
export const DEFAULT_LON = -79.3832;

/** A resolved location the whole app can share (weather, suggestions, harvest). */
export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export const DEFAULT_PLACE: Place = {
  label: "Toronto, Ontario, Canada",
  lat: DEFAULT_LAT,
  lon: DEFAULT_LON,
};

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
    return null; // offline / timeout / CORS: caller falls back
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
    now?: {
      tempC: number | null;
      weather: string | null;
      weatherCode?: number | null;
      precipMm?: number | null;
    };
    week?: WeatherDay[];
  };
  location?: {
    lat: number;
    lon: number;
    timezone?: string;
    resolved?: {
      label?: string;
      name?: string;
      admin1?: string;
      country?: string;
    } | null;
  };
  notifications?: WeatherNotification[];
  plantChecks?: PlantCheck[];
}

export function fetchWeather(
  plantIds: string[],
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
): Promise<WeatherData | null> {
  const ids = encodeURIComponent(plantIds.join(","));
  return request<WeatherData>(
    `/weather?lat=${lat}&lon=${lon}&plantIds=${ids}`,
    undefined,
    10000, // Open-Meteo + reverse geocode; still bounded
  );
}

/* ── Geocoding (typed city/address → candidates) ─────────── */

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/** GET /geocode: returns candidates so the UI can confirm ambiguous names. */
export async function geocodeCity(q: string): Promise<GeocodeResult[] | null> {
  const j = await request<{ results: GeocodeResult[] }>(
    `/geocode?q=${encodeURIComponent(q)}&count=5`,
    undefined,
    8000,
  );
  return j?.results?.length ? j.results : null;
}

/* ── Location-aware suggestions ──────────────────────────── */

export interface Suggestion {
  score: number;
  reasons?: string[];
  species: Species;
}

export interface SuggestPayload {
  suggestions: Suggestion[];
  /** Human-readable season label from the backend (e.g. "late summer"). */
  seasonName?: string;
  tonightMinC?: number | null;
  todayMaxC?: number | null;
  carbonWeight?: number;
  note?: string;
}

export async function fetchSuggestions(
  tier: string,
  carbonWeight: number,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
): Promise<SuggestPayload | null> {
  const j = await request<{
    suggestions: Suggestion[];
    context?: {
      season?: { name?: string };
      sky?: { tonightMinC?: number; todayMaxC?: number };
      carbonWeight?: number;
    };
    note?: string;
  }>(
    `/plants/suggest?lat=${lat}&lon=${lon}&tier=${tier}&carbonWeight=${carbonWeight}&limit=6`,
    undefined,
    8000,
  );
  if (!j?.suggestions?.length) return null;
  return {
    suggestions: j.suggestions,
    seasonName: j.context?.season?.name,
    tonightMinC: j.context?.sky?.tonightMinC ?? null,
    todayMaxC: j.context?.sky?.todayMaxC ?? null,
    carbonWeight: j.context?.carbonWeight ?? carbonWeight,
    note: j.note,
  };
}

/* ── Search (plants + videos + suggestion chips) ─────────── */

export interface SearchVideo {
  video_id: string;
  title: string;
  channel?: string;
  duration?: string;
  thumbnail?: string;
}

export interface SearchWebResult {
  title: string;
  url: string;
  snippet: string;
  displayUrl?: string;
  image?: string;
}

/** GET /plants/search/by-name: substring match over the curated catalog. */
export async function searchPlantsByName(
  q: string,
): Promise<{ plants: Species[] } | null> {
  const j = await request<{
    plants: Array<Partial<Species> & { id: string; name: string }>;
    count: number;
  }>(`/plants/search/by-name?q=${encodeURIComponent(q)}&limit=12`);
  if (!j?.plants?.length) return { plants: [] };
  // Search returns full docs; coerce to optimizer Species shape for the UI.
  const plants: Species[] = j.plants.map((p) => ({
    id: p.id,
    name: p.name,
    tier: (p.tier as Species["tier"]) ?? "beginner",
    category: p.category ?? "veggies",
    cellsPerPlant: (p.cellsPerPlant as [number, number]) ?? [1, 1],
    sun: (p.sun as Species["sun"]) ?? "full",
    waterEveryDays: p.waterEveryDays ?? 3,
    heightCm: p.heightCm ?? 30,
    yieldKgPerSeason: p.yieldKgPerSeason ?? 0,
    co2eSavedPerKg: p.co2eSavedPerKg ?? 0,
    companions: p.companions ?? [],
  }));
  return { plants };
}

/** Curated demos when the live YouTube scrape is unreachable. */
const DEMO_VIDEOS: SearchVideo[] = [
  {
    title: "How to Grow Tomatoes: Complete Guide for Beginners",
    video_id: "ECibnV1_3jM",
    channel: "Epic Gardening",
    duration: "12:04",
  },
  {
    title: "Vegetable Garden for Beginners",
    video_id: "qNtEgeCDVZU",
    channel: "GrowVeg",
    duration: "10:18",
  },
  {
    title: "Composting for Beginners",
    video_id: "FxYw0XPYoqg",
    channel: "California Academy of Sciences",
    duration: "5:32",
  },
];

/** GET /search/videos: keyless YouTube scrape; falls back to curated demos. */
export async function searchVideos(
  q: string,
): Promise<{ videos: SearchVideo[] } | null> {
  const live = await request<{ videos: SearchVideo[] }>(
    `/search/videos?q=${encodeURIComponent(q)}`,
    undefined,
    12000,
  );
  if (live?.videos?.length) return live;
  const term = q.toLowerCase();
  const filtered = DEMO_VIDEOS.filter(
    (v) =>
      term.includes("tomato")
        ? v.title.toLowerCase().includes("tomato")
        : term.includes("compost")
          ? v.title.toLowerCase().includes("compost")
          : true,
  );
  return { videos: filtered.length ? filtered : DEMO_VIDEOS };
}

/** GET /search/web: Google Custom Search guides (needs GOOGLE_API_KEY + GOOGLE_CSE_ID). */
export async function searchWebGuides(
  q: string,
): Promise<{ results: SearchWebResult[] } | null> {
  return request<{ results: SearchWebResult[] }>(
    `/search/web?q=${encodeURIComponent(q)}&limit=5`,
    undefined,
    12000,
  );
}

const FALLBACK_SEARCH_SUGGESTIONS = [
  "Tomato growing tips",
  "Beginner vegetable garden",
  "Composting at home",
  "Container gardening",
  "Organic pest control",
];

/** Seasonal "try searching for" chips: live picks when the backend is up. */
export async function fetchSearchSuggestions(
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
): Promise<string[]> {
  const payload = await fetchSuggestions("beginner", 0.5, lat, lon);
  if (!payload?.suggestions?.length) return FALLBACK_SEARCH_SUGGESTIONS;
  const picks = payload.suggestions
    .slice(0, 4)
    .map((s) => `How to grow ${s.species.name.toLowerCase()}`);
  return [...picks, "Composting at home"];
}

/* ── PlantNet identify ───────────────────────────────────── */

/** Nested PlantNet hit fields from POST /identify. */
export interface IdentifyPlantnetHit {
  scientificName?: string;
  scientificNameWithoutAuthor?: string;
  commonNames?: string[];
  genus?: string;
  family?: string;
  gbifId?: string;
  powoId?: string;
  images?: string[];
}

/** Curated Mongo plant doc when PlantNet matched our catalog. */
export interface IdentifyCatalogMatch {
  id?: string;
  name?: string;
  scientificName?: string;
  category?: string;
  tier?: string;
  sun?: string;
  waterEveryDays?: number;
  heightCm?: number;
  tempMinC?: number;
  tempMaxC?: number;
  spacingCm?: number;
  yieldKgPerSeason?: number;
  daysToHarvest?: number;
  daysToHarvestMin?: number;
  daysToHarvestMax?: number;
  harvest?: {
    plantSeasons?: string[];
    plantMonthsNorth?: number[];
    seasonClass?: string;
    frostSensitive?: boolean;
    slowsBelowC?: number;
    stressAboveC?: number;
    boltsAboveC?: number | null;
    weatherNotes?: string;
  };
}

export interface IdentifyCandidate {
  score?: number;
  plantnet?: IdentifyPlantnetHit;
  catalogMatch?: IdentifyCatalogMatch | null;
  /** Optimizer-shaped subset when catalogMatch exists. */
  species?: Species | null;
}

export interface IdentifyWikipedia {
  title?: string;
  description?: string;
  extract?: string;
  image?: string;
  thumbnail?: string;
  url?: string;
}

export interface IdentifyResult {
  detected?: boolean;
  bestMatch?: IdentifyCandidate | null;
  candidates?: IdentifyCandidate[];
  wikipedia?: IdentifyWikipedia | null;
  plantnetBestMatch?: string;
  remainingIdentificationRequests?: number;
  attribution?: string;
}

/** Discriminated result so the Identify card can show specific errors. */
export type IdentifyOutcome =
  | { ok: true; data: IdentifyResult }
  | { ok: false; error: string };

function identifyErrorMessage(status: number, body: string): string {
  if (status === 503) {
    return "PlantNet isn’t configured on the backend: set PLANTNET_API_KEY in the repo .env.";
  }
  if (status === 400) {
    return "That file looks empty or unreadable: try another photo.";
  }
  if (status === 413) {
    return "Photo is too large: try a smaller image.";
  }
  if (status === 502) {
    return "PlantNet rejected the photo or is briefly unavailable: try a clearer close-up (leaf or flower).";
  }
  if (status >= 500) {
    return "Identify server error: check the backend terminal for details.";
  }
  try {
    const j = JSON.parse(body) as { detail?: unknown };
    if (typeof j.detail === "string" && j.detail.trim()) return j.detail;
  } catch {
    /* ignore */
  }
  return `Identification failed (HTTP ${status}).`;
}

/**
 * POST /identify with multipart image. Returns a typed outcome (not null) so
 * the UI can distinguish offline vs PlantNet-not-configured vs empty match.
 */
export async function identifyPlant(file: File): Promise<IdentifyOutcome> {
  const form = new FormData();
  form.append("image", file);
  form.append("organ", "auto");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${API_URL}/identify`, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: identifyErrorMessage(res.status, body) };
    }
    const data = (await res.json()) as IdentifyResult;
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        error: "Identification timed out: check wifi, then try again.",
      };
    }
    return {
      ok: false,
      error: `Cannot reach the API at ${API_URL}: start the backend on port 8000.`,
    };
  } finally {
    clearTimeout(timer);
  }
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
 * Same math as backend/food_waste_stats.py, run locally when offline :
 * City of Toronto 2017-2018 audit baselines (see repo README).
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

/* ── Friends & leaderboard (needs an Auth0 access token) ────── */

export interface LeaderboardUser {
  authId: string;
  username: string | null;
  xp: number;
  streakDays: number;
}

export interface LeaderboardEntry extends LeaderboardUser {
  rank: number;
  isMe: boolean;
}

/** Discriminated result: distinguishes "not logged in / offline" from real API errors. */
export type AuthedOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

async function authedRequest<T>(
  path: string,
  token: string,
  init?: RequestInit,
  timeoutMs = 6000,
): Promise<AuthedOutcome<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const error =
        (body && typeof body === "object" && "detail" in body && String(body.detail)) ||
        `Request failed (HTTP ${res.status}).`;
      return { ok: false, status: res.status, error };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, error: "Cannot reach the API — check the backend is running." };
  } finally {
    clearTimeout(timer);
  }
}

export function fetchMyProfile(token: string): Promise<AuthedOutcome<LeaderboardUser>> {
  return authedRequest<LeaderboardUser>("/users/me", token);
}

export function claimUsername(
  token: string,
  username: string,
): Promise<AuthedOutcome<LeaderboardUser>> {
  return authedRequest<LeaderboardUser>("/users/me/username", token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export function syncMyStats(
  token: string,
  xp: number,
  streakDays: number,
): Promise<AuthedOutcome<LeaderboardUser>> {
  return authedRequest<LeaderboardUser>("/users/me/stats", token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xp, streakDays }),
  });
}

export function addFriend(
  token: string,
  username: string,
): Promise<AuthedOutcome<{ ok: boolean; friend: LeaderboardUser }>> {
  return authedRequest<{ ok: boolean; friend: LeaderboardUser }>("/friends/add", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export function fetchLeaderboard(
  token: string,
): Promise<AuthedOutcome<{ entries: LeaderboardEntry[] }>> {
  return authedRequest<{ entries: LeaderboardEntry[] }>("/leaderboard", token);
}
