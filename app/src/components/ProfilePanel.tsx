import {
  Bell,
  Bookmark,
  Camera,
  CloudRain,
  Droplets,
  ExternalLink,
  Leaf,
  Moon,
  Pencil,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ImpactStats, type ImpactStatsProps } from "./ImpactStats";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { LocationPicker } from "./LocationPicker";
import {
  DEFAULT_PROFILE,
  profileInitial,
  useUserProfile,
  type UserProfile,
} from "../lib/userProfile";
import { useSavedPlants, type SavedPlant } from "../lib/savedPlants";
import { levelForXp, nextLevelForXp } from "../xp";

const SAVED_PREVIEW_COUNT = 3;

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

function SavedPlantThumb({
  plant,
  compact,
}: {
  plant: SavedPlant;
  compact?: boolean;
}) {
  const size = compact ? "h-20 w-full" : "aspect-[4/5] w-full";
  if (plant.image) {
    return (
      <img
        src={plant.image}
        alt=""
        className={`${size} object-cover`}
      />
    );
  }
  return (
    <div
      className={`flex ${size} items-center justify-center bg-secondary text-xs text-muted-foreground`}
    >
      No photo
    </div>
  );
}

function SavedPlantsGallery(props: {
  plants: SavedPlant[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [props.onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
      role="dialog"
      aria-label="Saved plants gallery"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-heading text-lg font-semibold">Saved plants</p>
          <p className="text-xs text-muted-foreground">
            {props.plants.length} {props.plants.length === 1 ? "plant" : "plants"}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close gallery"
          className="border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {props.plants.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No saved plants yet.
          </p>
        ) : (
          <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
            {props.plants.map((p) => (
              <article
                key={p.id}
                className="overflow-hidden border border-border bg-card/90"
              >
                <SavedPlantThumb plant={p} />
                <div className="space-y-1.5 p-2.5">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight">
                        {p.commonName}
                      </p>
                      <p className="truncate text-[11px] italic text-muted-foreground">
                        {p.scientificName}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${p.commonName}`}
                      onClick={() => props.onRemove(p.id)}
                      className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {(p.genus || p.family) && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {[p.genus && `Genus ${p.genus}`, p.family && `Family ${p.family}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {p.wikipediaUrl && (
                    <a
                      href={p.wikipediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Wikipedia
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AvatarPlantPicker(props: {
  plants: SavedPlant[];
  selectedId: string | null;
  onSelect: (plantId: string | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [props.onClose]);

  const withPhotos = props.plants.filter((p) => !!p.image);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
      role="dialog"
      aria-label="Choose profile photo"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-heading text-lg font-semibold">Profile photo</p>
          <p className="text-xs text-muted-foreground">
            Pick a plant you&apos;ve identified
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close"
          className="border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <button
          type="button"
          onClick={() => props.onSelect(null)}
          className={`mb-4 flex w-full items-center gap-3 border px-3 py-3 text-left ${
            !props.selectedId
              ? "border-primary bg-primary/5"
              : "border-border bg-card/85 hover:border-primary/40"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center bg-primary font-heading text-lg font-semibold text-primary-foreground">
            Aa
          </span>
          <span>
            <span className="block text-sm font-medium">Use initials</span>
            <span className="block text-xs text-muted-foreground">
              Default letter avatar
            </span>
          </span>
        </button>

        {withPhotos.length === 0 ? (
          <div className="border border-dashed border-border bg-card/60 px-4 py-8 text-center">
            <Camera className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No plant photos yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Identify plants from Home (camera) and save them — then pick one as
              your profile picture.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {withPhotos.map((p) => {
              const selected = props.selectedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => props.onSelect(p.id)}
                  className={`overflow-hidden border text-left ${
                    selected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <img
                    src={p.image}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                  <p className="truncate px-1.5 py-1 text-[10px] font-medium leading-tight">
                    {p.commonName}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProfilePanel(props: ImpactStatsProps & { xp: number; streakDays: number }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadNotifPrefs);
  const { profile, setProfile } = useUserProfile();
  const { plants: savedPlants, remove: removeSaved } = useSavedPlants();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const level = levelForXp(props.xp);
  const nextLevel = nextLevelForXp(props.xp);
  const xpIntoLevel = props.xp - level.minXp;
  const xpSpan = nextLevel ? nextLevel.minXp - level.minXp : 0;
  const xpToNext = nextLevel ? Math.max(0, nextLevel.minXp - props.xp) : 0;
  const xpProgressPct = nextLevel
    ? Math.min(100, Math.max(0, (xpIntoLevel / Math.max(1, xpSpan)) * 100))
    : 100;

  useEffect(() => {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
    } catch {
      /* best-effort */
    }
  }, [prefs]);

  useEffect(() => {
    if (!editing) setDraft(profile);
  }, [profile, editing]);

  function startEdit() {
    setDraft(profile);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(profile);
    setEditing(false);
  }

  function saveEdit() {
    setProfile({
      name: draft.name.trim() || DEFAULT_PROFILE.name,
      age: draft.age,
      bio: draft.bio.trim(),
      avatarPlantId: profile.avatarPlantId,
      greenerSwapsEnabled: profile.greenerSwapsEnabled,
    });
    setEditing(false);
  }

  const initial = profileInitial(profile);
  const ageLabel = profile.age ? `${profile.age} yrs` : null;
  const sortedSaved = [...savedPlants].sort((a, b) => b.savedAt - a.savedAt);
  const previewPlants = sortedSaved.slice(0, SAVED_PREVIEW_COUNT);
  const hasMoreSaved = sortedSaved.length > SAVED_PREVIEW_COUNT;
  const avatarPlant = useMemo(
    () => sortedSaved.find((p) => p.id === profile.avatarPlantId) ?? null,
    [sortedSaved, profile.avatarPlantId],
  );

  function chooseAvatar(plantId: string | null) {
    setProfile({ ...profile, avatarPlantId: plantId });
    setAvatarPickerOpen(false);
  }

  return (
    <div className="space-y-5 py-2">
      <div className="flex animate-fade-in-up items-start gap-4">
        <button
          type="button"
          onClick={() => setAvatarPickerOpen(true)}
          className="group relative h-16 w-16 shrink-0 overflow-hidden border border-border bg-primary"
          title="Choose a saved plant as your photo"
          aria-label="Edit profile photo"
        >
          {avatarPlant?.image ? (
            <img
              src={avatarPlant.image}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-heading text-2xl font-semibold text-primary-foreground">
              {initial}
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-foreground/65 py-0.5 text-[9px] font-medium text-primary-foreground opacity-90 group-hover:opacity-100">
            <Camera className="h-2.5 w-2.5" />
            Edit
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-heading text-4xl font-semibold leading-tight">
                {profile.name}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {ageLabel ? `${ageLabel} · ` : ""}
                Your garden, optimized.
              </p>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="flex shrink-0 items-center gap-1 border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
          </div>
          {profile.bio && !editing && (
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">{profile.bio}</p>
          )}
        </div>
      </div>

      <section
        className="animate-fade-in-up space-y-3 border border-border bg-card/85 p-4 backdrop-blur"
        style={{ animationDelay: "0.02s" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 font-heading text-xl font-semibold leading-snug">
            Planter progress: {level.title}
          </p>
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {nextLevel ? (
              <>next milestone: {nextLevel.title}</>
            ) : (
              <>max level</>
            )}
          </p>
        </div>
        <div
          className="h-2 w-full border border-border bg-secondary"
          role="progressbar"
          aria-valuenow={Math.round(xpProgressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="XP progress to next level"
        >
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${xpProgressPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {nextLevel
            ? `${props.xp} / ${nextLevel.minXp} XP · ${xpToNext} XP to go`
            : `${props.xp} XP`}
        </p>
      </section>

      {editing && (
        <section
          className="animate-fade-in-up space-y-3 border border-border bg-card/85 p-4 backdrop-blur"
          style={{ animationDelay: "0.02s" }}
        >
          <h3 className="font-heading text-2xl font-semibold">Edit profile</h3>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Display name</span>
            <input
              type="text"
              value={draft.name}
              maxLength={60}
              placeholder={DEFAULT_PROFILE.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="h-10 w-full border border-input bg-card px-3 text-sm outline-none ring-ring focus:ring-2"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Age</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={draft.age}
              placeholder="Optional"
              onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))}
              className="h-10 w-full border border-input bg-card px-3 text-sm outline-none ring-ring focus:ring-2"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Bio</span>
            <textarea
              value={draft.bio}
              maxLength={280}
              rows={3}
              placeholder="A short note about you and your garden…"
              onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
              className="w-full resize-none border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
            <span className="text-[10px] text-muted-foreground">{draft.bio.length}/280</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={saveEdit}
              className="bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="border border-border bg-card px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="animate-fade-in-up" style={{ animationDelay: "0.03s" }}>
        <div className="mb-3 flex items-end justify-between gap-2">
          <h3 className="flex items-center gap-2 font-heading text-2xl font-semibold">
            <Bookmark className="h-4 w-4" />
            Saved plants
          </h3>
          {sortedSaved.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {sortedSaved.length} total
            </span>
          )}
        </div>
        {sortedSaved.length === 0 ? (
          <p className="border border-dashed border-border bg-card/60 px-4 py-5 text-sm text-muted-foreground">
            Plants you identify with the Home camera show up here, and in garden dropdowns when you add must-haves.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="group w-full border border-border bg-card/85 p-3 text-left backdrop-blur transition-colors hover:border-primary/40 hover:bg-card"
            aria-label={`Open saved plants gallery (${sortedSaved.length})`}
          >
            <div
              className={`grid gap-2 ${
                previewPlants.length === 1
                  ? "grid-cols-1"
                  : previewPlants.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
            >
              {previewPlants.map((p) => (
                <div key={p.id} className="overflow-hidden bg-secondary">
                  <SavedPlantThumb plant={p} compact />
                  <p className="truncate px-1.5 py-1 text-[11px] font-medium leading-tight">
                    {p.commonName}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs font-medium text-primary group-hover:underline">
              {hasMoreSaved
                ? `View all ${sortedSaved.length} plants`
                : "Open gallery"}
            </p>
          </button>
        )}
      </section>

      {galleryOpen && (
        <SavedPlantsGallery
          plants={sortedSaved}
          onClose={() => setGalleryOpen(false)}
          onRemove={(id) => {
            if (profile.avatarPlantId === id) {
              setProfile({ ...profile, avatarPlantId: null });
            }
            removeSaved(id);
          }}
        />
      )}

      {avatarPickerOpen && (
        <AvatarPlantPicker
          plants={sortedSaved}
          selectedId={profile.avatarPlantId}
          onSelect={chooseAvatar}
          onClose={() => setAvatarPickerOpen(false)}
        />
      )}

      <section className="animate-fade-in-up" style={{ animationDelay: "0.04s" }}>
        <h3 className="mb-3 font-heading text-2xl font-semibold">Garden location</h3>
        <LocationPicker />
      </section>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
        <h3 className="mb-3 font-heading text-2xl font-semibold">Sustainability impact</h3>
        <ImpactStats {...props} />
      </section>

      <LeaderboardPanel xp={props.xp} streakDays={props.streakDays} />

      <section className="animate-fade-in-up" style={{ animationDelay: "0.07s" }}>
        <h3 className="mb-3 font-heading text-2xl font-semibold">Suggestions</h3>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card/85 backdrop-blur">
          <NotifToggle
            icon={Leaf}
            label="Greener swap suggestions"
            desc="CO₂-friendlier plant swaps on your layout"
            on={profile.greenerSwapsEnabled}
            onChange={(v) => setProfile({ ...profile, greenerSwapsEnabled: v })}
          />
        </div>
      </section>

      <section className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
        <h3 className="mb-3 flex items-center gap-2 font-heading text-2xl font-semibold">
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
        PlotTwist · helping plants and people grow
      </p>
    </div>
  );
}
