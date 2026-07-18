import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LAT,
  DEFAULT_LON,
  fetchWeather,
  type Place,
  type WeatherData,
} from "../api";
import { requestDeviceLocation, type GeoCoords } from "../lib/geo";
import {
  mapWeatherCondition,
  weatherMeta,
  type WeatherCondition,
} from "../lib/weather";
import { useDevWeatherOverride } from "../devWeather";

const MANUAL_PLACE_KEY = "plottwist:manualPlace";

function readManualPlace(): Place | null {
  try {
    const raw = localStorage.getItem(MANUAL_PLACE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Place;
    if (
      typeof j.lat !== "number" ||
      typeof j.lon !== "number" ||
      typeof j.label !== "string"
    ) {
      return null;
    }
    return j;
  } catch {
    return null;
  }
}

interface WeatherContextValue {
  condition: WeatherCondition;
  temp: number;
  label: string;
  location: string;
  data: WeatherData | null;
  loading: boolean;
  /** Where the forecast is for (device GPS when allowed). */
  coords: GeoCoords | null;
  /** Typed-city override, if the user confirmed a place instead of GPS. */
  manualPlace: Place | null;
  setManualPlace: (place: Place | null) => void;
  refresh: () => void;
}

const WeatherContext = createContext<WeatherContextValue | null>(null);

export function WeatherProvider({
  children,
  plantIds = [],
}: {
  children: ReactNode;
  plantIds?: string[];
}) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [manualPlace, setManualPlaceState] = useState<Place | null>(() =>
    readManualPlace(),
  );
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const idsKey = plantIds.join(",");
  const forced = useDevWeatherOverride();

  const setManualPlace = useCallback((place: Place | null) => {
    setManualPlaceState(place);
    try {
      if (place) localStorage.setItem(MANUAL_PLACE_KEY, JSON.stringify(place));
      else localStorage.removeItem(MANUAL_PLACE_KEY);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      let lat = DEFAULT_LAT;
      let lon = DEFAULT_LON;
      let geo: GeoCoords | null = null;

      if (manualPlace) {
        lat = manualPlace.lat;
        lon = manualPlace.lon;
        geo = { lat, lon, source: "default" };
      } else {
        geo = await requestDeviceLocation();
        if (!alive) return;
        lat = geo.lat;
        lon = geo.lon;
      }
      if (!alive) return;
      setCoords(geo);

      const ids = plantIds.length ? plantIds : ["tomato"];
      const d = await fetchWeather(ids, lat, lon);
      if (!alive) return;
      setData(d);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, manualPlace?.lat, manualPlace?.lon, manualPlace?.label, tick]);

  const condition = useMemo(() => {
    if (forced) return forced;
    return mapWeatherCondition(data);
  }, [forced, data]);
  const meta = useMemo(() => {
    const base = weatherMeta(data, condition, manualPlace?.label);
    if (!forced) return base;
    // Prefer the simulated condition name over whatever live Open-Meteo said.
    const labels: Record<WeatherCondition, string> = {
      sunny: "Sunny",
      partly_cloudy: "Partly cloudy",
      rainy: "Light rain",
      cloudy: "Overcast",
      snowy: "Snowing",
      thunder: "Thunderstorm",
      clear_night: "Clear night",
    };
    return { ...base, label: labels[forced] };
  }, [data, condition, manualPlace?.label, forced]);

  const value = useMemo<WeatherContextValue>(
    () => ({
      condition,
      temp: meta.temp,
      label: meta.label,
      location: meta.location,
      data,
      loading,
      coords,
      manualPlace,
      setManualPlace,
      refresh: () => setTick((t) => t + 1),
    }),
    [condition, meta, data, loading, coords, manualPlace, setManualPlace],
  );

  return (
    <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
  );
}

export function useWeather(): WeatherContextValue {
  const ctx = useContext(WeatherContext);
  if (!ctx) {
    return {
      condition: "partly_cloudy",
      temp: 22,
      label: "Partly cloudy",
      location: "Toronto, ON",
      data: null,
      loading: false,
      coords: { lat: DEFAULT_LAT, lon: DEFAULT_LON, source: "default" },
      manualPlace: null,
      setManualPlace: () => {},
      refresh: () => {},
    };
  }
  return ctx;
}

/** Standalone fetch for pages that don't sit under the provider tree yet. */
export async function loadSkySnapshot(): Promise<WeatherData | null> {
  const geo = await requestDeviceLocation();
  return fetchWeather(["tomato"], geo.lat, geo.lon);
}

export { DEFAULT_LAT, DEFAULT_LON };
