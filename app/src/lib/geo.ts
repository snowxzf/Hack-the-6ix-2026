/** Device GPS helpers — weather uses these; Toronto is the offline fallback. */

import { DEFAULT_LAT, DEFAULT_LON } from "../api";

const GEO_KEY = "plottwist.geo";

export interface GeoCoords {
  lat: number;
  lon: number;
  /** How we got these coords. */
  source: "device" | "cached" | "default";
}

function readCached(): GeoCoords | null {
  try {
    const raw = localStorage.getItem(GEO_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { lat?: number; lon?: number };
    if (typeof j.lat !== "number" || typeof j.lon !== "number") return null;
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lon)) return null;
    return { lat: j.lat, lon: j.lon, source: "cached" };
  } catch {
    return null;
  }
}

function writeCached(lat: number, lon: number) {
  try {
    localStorage.setItem(GEO_KEY, JSON.stringify({ lat, lon, savedAt: Date.now() }));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Prompt the browser for location (or reuse a cached grant). */
export function requestDeviceLocation(): Promise<GeoCoords> {
  const cached = readCached();

  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(
        cached ?? { lat: DEFAULT_LAT, lon: DEFAULT_LON, source: "default" },
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: GeoCoords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: "device",
        };
        writeCached(coords.lat, coords.lon);
        resolve(coords);
      },
      () => {
        // Denied / timed out — prefer last known over hard-coded Toronto
        resolve(
          cached ?? { lat: DEFAULT_LAT, lon: DEFAULT_LON, source: "default" },
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30 * 60 * 1000,
      },
    );
  });
}
