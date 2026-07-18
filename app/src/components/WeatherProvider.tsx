import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LAT, DEFAULT_LON, fetchWeather, type WeatherData } from "../api";
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
  const [loading, setLoading] = useState(true);
  const idsKey = plantIds.join(",");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchWeather(plantIds.length ? plantIds : ["tomato"]).then((d) => {
      if (!alive) return;
      setData(d);
      setLoading(false);
    });
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
    }),
    [condition, meta, data, loading],
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
    };
  }
  return ctx;
}

/** Standalone fetch for pages that don't sit under the provider tree yet. */
export async function loadSkySnapshot(): Promise<WeatherData | null> {
  return fetchWeather(["tomato"]);
}

export { DEFAULT_LAT, DEFAULT_LON };
