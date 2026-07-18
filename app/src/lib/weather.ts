import type { WeatherData } from "../api";

export type WeatherCondition =
  | "sunny"
  | "partly_cloudy"
  | "rainy"
  | "cloudy"
  | "snowy"
  | "thunder"
  | "clear_night";

const RAIN_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82,
]);
const THUNDER_CODES = new Set([95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export function mapWeatherCondition(data: WeatherData | null): WeatherCondition {
  const now = data?.sky?.now;
  const code = now?.weatherCode ?? null;
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 20;

  if (code == null) return isNight ? "clear_night" : "partly_cloudy";

  // Precip / storm win over day/night sky dressing.
  if (SNOW_CODES.has(code)) return "snowy";
  if (THUNDER_CODES.has(code)) return "thunder";
  if (RAIN_CODES.has(code) || (now?.precipMm ?? 0) >= 0.5) return "rainy";

  // Night → moon scene when the sky is otherwise clear / soft.
  if (isNight && (code === 0 || code === 1 || code === 2)) return "clear_night";

  if (code === 0 || code === 1) return "sunny";
  if (code === 2) return "partly_cloudy";
  if (code === 3 || code === 45 || code === 48) return "cloudy";

  return isNight ? "clear_night" : "partly_cloudy";
}

export function weatherMeta(
  data: WeatherData | null,
  condition: WeatherCondition,
  /** Typed-city override when the user confirmed a place instead of GPS. */
  manualLabel?: string,
) {
  const now = data?.sky?.now;
  const temp = now?.tempC != null ? Math.round(now.tempC) : null;
  const label =
    now?.weather ??
    ({
      sunny: "Sunny",
      partly_cloudy: "Partly cloudy",
      rainy: "Light rain",
      cloudy: "Overcast",
      snowy: "Snowing",
      thunder: "Thunderstorm",
      clear_night: "Clear night",
    }[condition] as string);

  const resolved = data?.location?.resolved;
  const fromApi =
    resolved?.label ||
    [resolved?.name, resolved?.admin1, resolved?.country].filter(Boolean).join(", ");
  // Compact: "Toronto, Ontario, Canada" → "Toronto, Ontario"
  const compact = (s: string) =>
    s
      .split(",")
      .map((p) => p.trim())
      .slice(0, 2)
      .join(", ");
  const location = compact(manualLabel || fromApi || "Toronto, ON");

  return {
    temp: temp ?? 22,
    label,
    location,
  };
}
