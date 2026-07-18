import { Bell, CloudRain, Droplets, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { ImpactStats, type ImpactStatsProps } from "./ImpactStats";

const NOTIF_KEY = "plottwist:notifications";

interface NotifPrefs {
  watering: boolean;
  weather: boolean;
  harvest: boolean;
  seasonal: boolean;
}

const DEFAULT_NOTIF: NotifPrefs = {
  watering: true,
  weather: true,
  harvest: true,
  seasonal: false,
};

function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    return raw ? { ...DEFAULT_NOTIF, ...(JSON.parse(raw) as NotifPrefs) } : DEFAULT_NOTIF;
  } catch {
    return DEFAULT_NOTIF;
  }
}

function NotifToggle({
  icon: Icon,
  label,
  desc,
  on,
  onChange,
}: {
  icon: typeof Droplets;
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          on ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

export function ProfilePanel(props: ImpactStatsProps) {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadNotifPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
    } catch {
      /* best-effort */
    }
  }, [prefs]);

  return (
    <div className="space-y-5 py-2">
      <div className="flex animate-fade-in-up items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary font-heading text-2xl font-semibold text-primary-foreground">
          P
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold">PlotTwist Gardener</h2>
          <p className="text-sm text-muted-foreground">Your garden, optimized.</p>
        </div>
      </div>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
        <h3 className="mb-3 font-heading text-lg font-semibold">Sustainability impact</h3>
        <ImpactStats {...props} />
      </section>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
        <h3 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
          <Bell className="h-4 w-4" /> Notifications
        </h3>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card/85 backdrop-blur">
          <NotifToggle
            icon={Droplets}
            label="Watering reminders"
            desc="Based on plant type & weather"
            on={prefs.watering}
            onChange={(v) => setPrefs((p) => ({ ...p, watering: v }))}
          />
          <NotifToggle
            icon={CloudRain}
            label="Weather alerts"
            desc="Rain, frost & heat warnings"
            on={prefs.weather}
            onChange={(v) => setPrefs((p) => ({ ...p, weather: v }))}
          />
          <NotifToggle
            icon={Sun}
            label="Harvest timing"
            desc="When crops are ready"
            on={prefs.harvest}
            onChange={(v) => setPrefs((p) => ({ ...p, harvest: v }))}
          />
          <NotifToggle
            icon={Moon}
            label="Seasonal tips"
            desc="Monthly growing advice"
            on={prefs.seasonal}
            onChange={(v) => setPrefs((p) => ({ ...p, seasonal: v }))}
          />
        </div>
      </section>

      <p className="pt-2 text-center text-[11px] text-muted-foreground/70">
        PlotTwist — helping plants and people grow 🌱
      </p>
    </div>
  );
}
