import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LAT, DEFAULT_LON, fetchWeather, type WeatherData } from "../api";
import { requestDeviceLocation, type GeoCoords } from "../lib/geo";
import {
  mapWeatherCondition,
  weatherMeta,
  type WeatherCondition,
} from "../lib/weather";

interface WeatherContextValue {
  condition: WeatherCondition;
  temp: number;
  label: string;
  location: string;
  data: WeatherData | null;
  loading: boolean;
  /** Where the forecast is for (device GPS when allowed). */
  coords: GeoCoords | null;
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
  const [loading, setLoading] = useState(true);
  const idsKey = plantIds.join(",");

  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      const geo = await requestDeviceLocation();
      if (!alive) return;
      setCoords(geo);

      const ids = plantIds.length ? plantIds : ["tomato"];
      const d = await fetchWeather(ids, geo.lat, geo.lon);
      if (!alive) return;
      setData(d);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const condition = useMemo(() => mapWeatherCondition(data), [data]);
  const meta = useMemo(() => weatherMeta(data, condition), [data, condition]);

  const value = useMemo<WeatherContextValue>(
    () => ({
      condition,
      temp: meta.temp,
      label: meta.label,
      location: meta.location,
      data,
      loading,
      coords,
    }),
    [condition, meta, data, loading, coords],
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
