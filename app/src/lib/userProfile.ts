import { useEffect, useState } from "react";

const PROFILE_KEY = "plottwist:userProfile";
const PROFILE_EVENT = "plottwist:userProfile";

export interface UserProfile {
  name: string;
  age: string;
  bio: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: "PlotTwist Gardener",
  age: "",
  bio: "",
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
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(PROFILE_EVENT));
  } catch {
    /* best-effort */
  }
  return next;
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
