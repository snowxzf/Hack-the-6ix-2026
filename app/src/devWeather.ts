import { useSyncExternalStore } from "react";
import type { WeatherCondition } from "./lib/weather";

/**
 * Dev-only weather override. When set, WeatherProvider serves this condition
 * instead of the live Open-Meteo mapping — so DevTools can demo every sky
 * animation without waiting for real weather.
 */
const OVERRIDE_KEY = "plottwist:devWeatherOverride";

export const DEV_WEATHER_OPTIONS: {
  id: WeatherCondition | null;
  label: string;
}[] = [
  { id: null, label: "Live" },
  { id: "sunny", label: "Sunny" },
  { id: "partly_cloudy", label: "Partly cloudy" },
  { id: "cloudy", label: "Cloudy" },
  { id: "rainy", label: "Rain" },
  { id: "snowy", label: "Snow" },
  { id: "thunder", label: "Thunder" },
  { id: "clear_night", label: "Night (moon)" },
];

type Listener = () => void;
const listeners = new Set<Listener>();

function loadOverride(): WeatherCondition | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw || raw === "live") return null;
    const valid = DEV_WEATHER_OPTIONS.some((o) => o.id === raw);
    return valid ? (raw as WeatherCondition) : null;
  } catch {
    return null;
  }
}

let override: WeatherCondition | null = loadOverride();

function saveOverride() {
  try {
    if (override == null) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, override);
  } catch {
    /* best-effort */
  }
}

function notify() {
  for (const l of listeners) l();
}

export function getDevWeatherOverride(): WeatherCondition | null {
  return override;
}

export function setDevWeatherOverride(next: WeatherCondition | null) {
  override = next;
  saveOverride();
  notify();
}

export function resetDevWeatherOverride() {
  setDevWeatherOverride(null);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when the forced weather condition changes. */
export function useDevWeatherOverride(): WeatherCondition | null {
  return useSyncExternalStore(subscribe, getDevWeatherOverride, getDevWeatherOverride);
}
