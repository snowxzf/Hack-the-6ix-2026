import { useEffect, useState } from "react";

const PROFILE_KEY = "plottwist:userProfile";
const PROFILE_EVENT = "plottwist:userProfile";

export interface UserProfile {
  name: string;
  age: string;
  bio: string;
  /** SavedPlant.id used as the profile photo, if any. */
  avatarPlantId: string | null;
  /** Show "Greener swaps" suggestions on the layout. Off by default;
   *  seeded from the onboarding carbon yes/no choice. */
  greenerSwapsEnabled: boolean;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: "PlotTwist Gardener",
  age: "",
  bio: "",
  avatarPlantId: null,
  greenerSwapsEnabled: false,
};

export function loadUserProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      name: (parsed.name?.trim() || DEFAULT_PROFILE.name).slice(0, 60),
      age: String(parsed.age ?? "").replace(/[^\d]/g, "").slice(0, 3),
      bio: String(parsed.bio ?? "").slice(0, 280),
      avatarPlantId:
        typeof parsed.avatarPlantId === "string" && parsed.avatarPlantId
          ? parsed.avatarPlantId
          : null,
      greenerSwapsEnabled:
        typeof parsed.greenerSwapsEnabled === "boolean"
          ? parsed.greenerSwapsEnabled
          : DEFAULT_PROFILE.greenerSwapsEnabled,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveUserProfile(profile: UserProfile): UserProfile {
  const next: UserProfile = {
    name: (profile.name.trim() || DEFAULT_PROFILE.name).slice(0, 60),
    age: String(profile.age ?? "").replace(/[^\d]/g, "").slice(0, 3),
    bio: String(profile.bio ?? "").slice(0, 280),
    avatarPlantId:
      typeof profile.avatarPlantId === "string" && profile.avatarPlantId
        ? profile.avatarPlantId
        : null,
    greenerSwapsEnabled: !!profile.greenerSwapsEnabled,
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(PROFILE_EVENT));
  } catch {
    /* best-effort */
  }
  return next;
}

/** Seed the greener-swaps profile toggle from the onboarding carbon choice.
 *  Opting in turns suggestions on; opting out turns them off. Slider tweaks
 *  should not call this — only the yes/no interest controls. */
export function syncGreenerSwapsFromCarbonInterest(caresAboutCarbon: boolean): void {
  const cur = loadUserProfile();
  if (cur.greenerSwapsEnabled === caresAboutCarbon) return;
  saveUserProfile({ ...cur, greenerSwapsEnabled: caresAboutCarbon });
}

/** First word for big greetings: "PlotTwist Gardener" → "PlotTwist". */
export function profileFirstName(profile: UserProfile): string {
  const part = profile.name.trim().split(/\s+/)[0];
  return part || DEFAULT_PROFILE.name;
}

export function profileInitial(profile: UserProfile): string {
  const ch = profile.name.trim().charAt(0);
  return (ch || "P").toUpperCase();
}

/** Live profile from localStorage: updates across tabs/panels. */
export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => loadUserProfile());

  useEffect(() => {
    const refresh = () => setProfile(loadUserProfile());
    window.addEventListener(PROFILE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PROFILE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function update(patch: Partial<UserProfile>) {
    setProfile((prev) => saveUserProfile({ ...prev, ...patch }));
  }

  return { profile, update, setProfile: (p: UserProfile) => setProfile(saveUserProfile(p)) };
}
