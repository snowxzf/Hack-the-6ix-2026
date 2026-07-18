import { BookOpen, ChevronRight, FlaskConical, Sprout, TrendingUp } from "lucide-react";
import { useState } from "react";

const TIERS = [
  {
    id: "beginner",
    label: "Beginner",
    icon: Sprout,
    tint: "bg-[hsl(var(--palette-sage)/0.4)] text-[hsl(var(--palette-forest))]",
  },
  {
    id: "intermediate",
    label: "Intermediate",
    icon: TrendingUp,
    tint: "bg-[hsl(var(--palette-apricot)/0.3)] text-[hsl(var(--palette-brown))]",
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: FlaskConical,
    tint: "bg-[hsl(var(--palette-leaf)/0.3)] text-[hsl(var(--palette-olive))]",
  },
] as const;

const GUIDES: Record<(typeof TIERS)[number]["id"], { title: string; blurb: string; mins: number }[]> =
  {
    beginner: [
      {
        title: "Starting your first tomato",
        blurb: "From seed to first fruit in a sunny spot.",
        mins: 4,
      },
      {
        title: "How often should I water?",
        blurb: "Read the soil, not the calendar.",
        mins: 3,
      },
      {
        title: "5 herbs for a windowsill",
        blurb: "Basil, mint, chives and more — no garden needed.",
        mins: 5,
      },
      {
        title: "Understanding sunlight",
        blurb: "Full sun, partial shade, and what it means.",
        mins: 4,
      },
    ],
    intermediate: [
      {
        title: "Companion planting basics",
        blurb: "Pair crops that help each other thrive.",
        mins: 6,
      },
      {
        title: "Composting to cut food waste",
        blurb: "Turn kitchen scraps into garden gold.",
        mins: 7,
      },
      {
        title: "Building healthy soil",
        blurb: "Crop rotation and organic matter.",
        mins: 8,
      },
      {
        title: "Pest control without chemicals",
        blurb: "Natural defenses for a healthier garden.",
        mins: 6,
      },
    ],
    advanced: [
      {
        title: "Year-round growing with season extension",
        blurb: "Cold frames, row covers, and microclimates.",
        mins: 10,
      },
      {
        title: "Saving your own seeds",
        blurb: "Build a resilient, self-sustaining garden.",
        mins: 12,
      },
      {
        title: "Designing a permaculture guild",
        blurb: "Multi-layer planting for maximum yield.",
        mins: 14,
      },
      {
        title: "Water-wise drip irrigation",
        blurb: "Precision watering that saves resources.",
        mins: 9,
      },
    ],
  };

export function LearnPanel() {
  const [tier, setTier] = useState<(typeof TIERS)[number]["id"]>("beginner");
  const guides = GUIDES[tier];

  return (
    <div className="space-y-5 py-2">
      <div className="animate-fade-in-up">
        <h2 className="font-heading text-5xl font-semibold">Learn</h2>
        <p className="text-sm text-muted-foreground">Bite-sized guides for every gardener.</p>
      </div>

      <div
        className="grid animate-fade-in-up grid-cols-3 gap-2"
        style={{ animationDelay: "0.05s" }}
      >
        {TIERS.map(({ id, label, icon: Icon, tint }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTier(id)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all ${
              tier === id ? "border-primary bg-primary/5" : "border-border bg-card/70"
            }`}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
              <Icon className="h-5 w-5" />
            </div>
            <span
              className={`text-xs font-medium ${
                tier === id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </button>
 ))}
      </div>

      <div className="space-y-3">
        {guides.map((g, i) => (
          <div
            key={g.title}
            className="flex animate-fade-in-up items-center gap-3 rounded-2xl border border-border bg-card/85 p-4 backdrop-blur"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">{g.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{g.blurb}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/80">{g.mins} min read</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
 ))}
      </div>
    </div>
 );
}
