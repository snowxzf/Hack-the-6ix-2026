import {
  AlertTriangle,
  ChevronRight,
  CloudRain,
  Droplets,
  Search,
} from "lucide-react";
import { ImpactStats } from "./ImpactStats";
import { LocationPicker } from "./LocationPicker";
import { WeatherChip } from "./WeatherChip";
import { WeatherScene } from "./WeatherScene";
import { useWeather } from "./WeatherProvider";

const WEATHER_ALERTS = {
  rainy: {
    text: "Rain expected today — skip watering, nature has it covered.",
    icon: CloudRain,
  },
  snowy: {
    text: "Frost risk tonight — cover tender plants and bring potted ones inside.",
    icon: AlertTriangle,
  },
  sunny: {
    text: "Sunny and warm — give your garden a deep watering this evening.",
    icon: Droplets,
  },
  cloudy: {
    text: "Overcast today — a perfect day to transplant seedlings.",
    icon: CloudRain,
  },
  partly_cloudy: {
    text: "Mixed skies — a great time to check soil moisture levels.",
    icon: CloudRain,
  },
  clear_night: {
    text: "Clear and cool tonight — protect sensitive seedlings from chill.",
    icon: AlertTriangle,
  },
} as const;

export function HomePanel(props: {
  gardenName: string;
  foodKg: number;
  kgCo2e: number;
  plantCount: number;
  careTasks: { id: string; name: string; detail: string }[];
  onSearch: () => void;
  onOpenGarden: () => void;
  onOpenPlan: () => void;
}) {
  const { condition, data, location } = useWeather();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Prefer live Open-Meteo / plant-check messages when the backend answered.
  const liveNotes = (data?.notifications ?? []).slice(0, 2);
  const livePlantIssues = (data?.plantChecks ?? [])
    .filter((c) => !c.ok && c.type !== "unknown_plant")
    .flatMap((c) => (c.issues ?? []).map((i) => i.message))
    .filter(Boolean)
    .slice(0, 2);
  const fallback = WEATHER_ALERTS[condition] ?? WEATHER_ALERTS.partly_cloudy;
  const AlertIcon =
    liveNotes.some((n) => n.type === "frost_warning") || livePlantIssues.length
      ? AlertTriangle
      : liveNotes.some((n) => n.type === "skip_watering")
        ? Droplets
        : fallback.icon;

  return (
    <div className="space-y-5 py-2">
      <header className="flex animate-fade-in-up items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="font-heading text-5xl font-semibold">Gardener</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{props.gardenName}</p>
        </div>
        <WeatherChip />
      </header>

      <div className="animate-fade-in-up" style={{ animationDelay: "0.01s" }}>
        <LocationPicker />
      </div>

      <button
        type="button"
        onClick={props.onSearch}
        className="flex h-11 w-full animate-fade-in-up items-center gap-2 border border-border bg-card/85 px-3 text-left backdrop-blur"
        style={{ animationDelay: "0.02s" }}
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Search videos, plants & guides…
        </span>
      </button>

      <div
        className="animate-fade-in-up bg-gradient-to-br from-primary to-[hsl(var(--palette-olive))] p-5 text-primary-foreground"
        style={{ animationDelay: "0.03s" }}
      >
        <p className="font-heading text-lg font-medium leading-snug">
          Helping plants and people grow.
        </p>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Every home crop replaces greenhouse produce and cuts avoidable food waste.
        </p>
      </div>

      <WeatherScene />

      <div
        className="flex animate-fade-in-up items-start gap-3 border border-border bg-card/85 p-4 backdrop-blur"
        style={{ animationDelay: "0.06s" }}
      >
        <div className="shrink-0 bg-accent/15 p-2">
          <AlertIcon className="h-5 w-5 text-accent" />
        </div>
        <div className="space-y-1.5 text-sm leading-relaxed">
          {liveNotes.length === 0 && livePlantIssues.length === 0 ? (
            <p>{fallback.text}</p>
          ) : (
            <>
              {liveNotes.map((n, i) => (
                <p key={`n${i}`}>{n.message}</p>
              ))}
              {livePlantIssues.map((msg, i) => (
                <p key={`p${i}`}>{msg}</p>
              ))}
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            Live sky over {location.split(",")[0] ?? location}
            {data ? " · Open-Meteo" : ""}
          </p>
        </div>
      </div>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-2xl font-semibold">Today&apos;s care</h2>
          <button
            type="button"
            onClick={props.onOpenGarden}
            className="flex items-center gap-0.5 bg-transparent p-0 text-xs font-medium text-primary"
          >
            View all <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {props.careTasks.length === 0 ? (
          <div className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No plants yet.{" "}
            <button
              type="button"
              onClick={props.onOpenPlan}
              className="bg-transparent p-0 font-medium text-primary"
            >
              Plan your garden
            </button>{" "}
            to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {props.careTasks.slice(0, 3).map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 border border-border bg-card/85 p-3 backdrop-blur"
              >
                <div className="bg-primary/10 p-2">
                  <Droplets className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.detail}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">due today</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-3 font-heading text-2xl font-semibold">Your impact</h2>
        <ImpactStats
          foodKg={props.foodKg}
          kgCo2e={props.kgCo2e}
          plantCount={props.plantCount}
          compact
        />
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          The average Canadian household wastes $1,300 of edible food yearly. Home-grown
          produce helps change that.
        </p>
      </section>
    </div>
  );
}
