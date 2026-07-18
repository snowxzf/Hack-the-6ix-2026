import { Leaf, Recycle, Sprout } from "lucide-react";
import { localFoodWasteImpact } from "../api";

export interface ImpactStatsProps {
  foodKg: number;
  kgCo2e: number;
  plantCount: number;
  compact?: boolean;
}

export function ImpactStats({ foodKg, kgCo2e, plantCount, compact }: ImpactStatsProps) {
  const waste = localFoodWasteImpact(foodKg);

  const stats = [
    {
      icon: Recycle,
      label: "Waste saved",
      value: `${foodKg.toFixed(1)} kg`,
      sub: `${waste.percentOfFruitVegWaste ?? 0}% of avg fruit & veg waste`,
      tint: "bg-accent/15 text-accent",
    },
    {
      icon: Leaf,
      label: "CO₂ reduced",
      value: `${kgCo2e.toFixed(1)} kg`,
      sub: "vs. store-bought / season",
      tint: "bg-primary/10 text-primary",
    },
    {
      icon: Sprout,
      label: compact ? "Plants" : "Plants growing",
      value: String(plantCount),
      sub: compact ? "in your layout" : "species in your garden",
      tint: "bg-emerald-100 text-emerald-700",
    },
  ];

  if (compact) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="border border-border bg-card/85 p-3 text-center backdrop-blur"
          >
            <div
              className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center ${s.tint}`}
            >
              <s.icon className="h-5 w-5" />
            </div>
            <p className="font-heading text-lg font-semibold leading-none">{s.value}</p>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card/85 p-3 backdrop-blur"
        >
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tint}`}>
            <s.icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
          <p className="font-heading text-lg font-semibold">{s.value}</p>
        </div>
      ))}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Toronto households waste ~45 kg of fruit & veg yearly — home-grown food helps change
        that.
      </p>
    </div>
  );
}
