import { useSyncExternalStore } from "react";

/**
 * Dev-only simulated clock. Everything time-based in the app (CarbonChart's
 * ramp, the Watering trips "due today" state, harvest progress bars) reads
 * "now" through here instead of calling Date.now() directly, so the DevTools
 * panel can fast-forward days and watch it respond live — without waiting
 * for real seasons to pass. Offset persists across reloads so a simulated
 * date sticks around; "Restart app" clears it back to 0 along with everything else.
 */
const OFFSET_KEY = "plottwist:devClockOffsetMs";
const DAY_MS = 24 * 60 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();

function loadOffset(): number {
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

let offsetMs = loadOffset();

function saveOffset() {
  try {
    localStorage.setItem(OFFSET_KEY, String(offsetMs));
  } catch {
    // best-effort — quota errors or disabled storage shouldn't break the app
  }
}

function notify() {
  for (const l of listeners) l();
}

/** Simulated "now" — real time plus whatever the dev clock has advanced. */
export function devNow(): number {
  return Date.now() + offsetMs;
}

export function getDevClockOffsetDays(): number {
  return Math.round(offsetMs / DAY_MS);
}

export function advanceDevClock(days: number) {
  offsetMs += days * DAY_MS;
  saveOffset();
  notify();
}

export function resetDevClock() {
  offsetMs = 0;
  saveOffset();
  notify();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the calling component whenever the dev clock is advanced/reset. */
export function useDevClock(): { now: number; offsetDays: number } {
  const offsetDays = useSyncExternalStore(subscribe, getDevClockOffsetDays, getDevClockOffsetDays);
  return { now: devNow(), offsetDays };
}
