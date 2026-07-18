import { BookOpen, Home, LayoutGrid, Sprout, User } from "lucide-react";

export type AppTab = "dashboard" | "garden" | "planner" | "learn" | "profile";

const ITEMS: { id: AppTab; icon: typeof Home; label: string }[] = [
  { id: "dashboard", icon: Home, label: "Home" },
  { id: "garden", icon: Sprout, label: "Garden" },
  { id: "planner", icon: LayoutGrid, label: "Plan" },
  { id: "learn", icon: BookOpen, label: "Learn" },
  { id: "profile", icon: User, label: "Profile" },
];

export function BottomNav(props: {
  active: AppTab;
  onSelect: (t: AppTab) => void;
}) {
  return (
    <nav
      className="z-30 w-full shrink-0 px-3 pt-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center justify-around border border-border bg-white/95 px-1 py-2 shadow-lg shadow-black/10">
        {ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = props.active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => props.onSelect(id)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 transition-all ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
