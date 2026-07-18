import { Cloud, CloudRain, CloudSnow, CloudSun, Moon, Sun, Zap } from "lucide-react";
import { useWeather } from "./WeatherProvider";
import type { WeatherCondition } from "../lib/weather";

const ICONS: Record<WeatherCondition, typeof Sun> = {
  sunny: Sun,
  partly_cloudy: CloudSun,
  rainy: CloudRain,
  cloudy: Cloud,
  snowy: CloudSnow,
  thunder: Zap,
  clear_night: Moon,
};

const TINTS: Record<WeatherCondition, string> = {
  sunny: "text-[hsl(var(--palette-apricot))] bg-[hsl(var(--palette-cream))]",
  partly_cloudy: "text-[hsl(var(--palette-leaf))] bg-[hsl(var(--palette-seafoam)/0.35)]",
  rainy: "text-[hsl(var(--palette-forest))] bg-[hsl(var(--palette-seafoam)/0.45)]",
  cloudy: "text-[hsl(var(--palette-olive))] bg-[hsl(var(--muted))]",
  snowy: "text-[hsl(var(--palette-seafoam))] bg-[hsl(var(--palette-cream))]",
  thunder: "text-[hsl(var(--palette-apricot))] bg-[hsl(var(--secondary))]",
  clear_night: "text-[hsl(var(--palette-forest))] bg-[hsl(var(--secondary))]",
};

export function WeatherChip() {
  const { condition, temp, location, loading } = useWeather();
  const Icon = ICONS[condition];
  const tint = TINTS[condition];

  return (
    <div className="flex max-w-[9.5rem] shrink-0 items-center gap-2 border border-border bg-card/85 py-1 pl-2 pr-2.5 backdrop-blur">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold">{loading ? "…" : `${temp}°C`}</p>
        <p className="truncate text-[10px] text-muted-foreground" title={location}>
          {location}
        </p>
      </div>
    </div>
  );
}
