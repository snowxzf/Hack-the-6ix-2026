import { useAuth0 } from "@auth0/auth0-react";
import { Trophy, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addFriend,
  fetchLeaderboard,
  fetchMyProfile,
  removeFriend,
  syncMyStats,
  type LeaderboardEntry,
  type LeaderboardUser,
} from "../api";
import { AUTH0_CONFIGURED } from "../lib/auth0Config";

function useAccessToken(isAuthenticated: boolean): string | null {
  const { getAccessTokenSilently } = useAuth0();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setToken(null);
      return;
    }
    let cancelled = false;
    getAccessTokenSilently()
      .then((t) => {
        if (!cancelled) setToken(t);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently]);

  return token;
}

function AuthedLeaderboard(props: { token: string; xp: number; streakDays: number }) {
  const { logout } = useAuth0();
  const { token, xp, streakDays } = props;

  const [profile, setProfile] = useState<LeaderboardUser | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [friendDraft, setFriendDraft] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingProfile(true);
    fetchMyProfile(token).then((res) => {
      if (cancelled) return;
      setLoadingProfile(false);
      if (res.ok) setProfile(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadLeaderboard = useCallback(() => {
    fetchLeaderboard(token).then((res) => {
      if (res.ok) setEntries(res.data.entries);
    });
  }, [token]);

  useEffect(() => {
    if (profile?.username) loadLeaderboard();
  }, [profile?.username, loadLeaderboard]);

  // Keep the backend's copy of xp/streak fresh so friends see current standing.
  useEffect(() => {
    if (!profile?.username) return;
    syncMyStats(token, xp, streakDays).then((res) => {
      if (!res.ok) return;
      setEntries((prev) =>
        prev
          ? prev
              .map((e) => (e.isMe ? { ...e, xp: res.data.xp, streakDays: res.data.streakDays } : e))
              .sort((a, b) => b.xp - a.xp)
              .map((e, i) => ({ ...e, rank: i + 1 }))
          : prev,
      );
    });
  }, [token, profile?.username, xp, streakDays]);

  async function submitFriend(e: FormEvent) {
    e.preventDefault();
    setFriendError(null);
    const name = friendDraft.trim();
    if (!name) return;
    const res = await addFriend(token, name);
    if (res.ok) {
      setFriendDraft("");
      loadLeaderboard();
    } else {
      setFriendError(res.error);
    }
  }

  async function handleRemove(username: string | null) {
    if (!username) return;
    const res = await removeFriend(token, username);
    if (res.ok) loadLeaderboard();
  }

  if (loadingProfile) {
    return <p className="text-sm text-muted-foreground">Loading your profile…</p>;
  }

  if (!profile?.username) {
    // Should only be reachable if the sign-up onboarding prompt was skipped.
    return (
      <p className="text-sm text-muted-foreground">
        Pick a username from the welcome prompt to unlock friends and the leaderboard.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          Playing as <span className="font-semibold">@{profile.username}</span>
        </p>
        <button
          type="button"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Log out
        </button>
      </div>

      <form onSubmit={submitFriend} className="flex gap-2">
        <input
          type="text"
          value={friendDraft}
          onChange={(e) => setFriendDraft(e.target.value)}
          placeholder="friend's username"
          maxLength={20}
          className="h-10 min-w-0 flex-1 border border-input bg-card px-3 text-sm outline-none ring-ring focus:ring-2"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1 border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary hover:text-primary"
        >
          <UserPlus className="h-4 w-4" />
          Add
        </button>
      </form>
      {friendError && <p className="text-xs text-destructive">{friendError}</p>}

      <div className="divide-y divide-border border border-border bg-card/85 backdrop-blur">
        {entries === null && (
          <p className="p-3 text-sm text-muted-foreground">Loading leaderboard…</p>
        )}
        {entries?.length === 1 && (
          <p className="p-3 text-sm text-muted-foreground">No friends yet — add one above!</p>
        )}
        {entries?.map((e) => (
          <div
            key={e.authId}
            className={`flex items-center justify-between gap-2 p-3 ${e.isMe ? "bg-primary/10" : ""}`}
          >
            <span className="min-w-0 truncate text-sm font-medium">
              #{e.rank} {e.username}
              {e.isMe ? " (you)" : ""}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {e.xp} XP · 🔥 {e.streakDays}
              </span>
              {!e.isMe && (
                <button
                  type="button"
                  aria-label={`Remove ${e.username}`}
                  onClick={() => handleRemove(e.username)}
                  className="p-1 text-muted-foreground hover:text-destructive"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Friends + leaderboard. Local XP/streak tracking works with no account at
 *  all; this section unlocks add/remove-friend + leaderboard once signed in.
 *  Username claiming itself happens once, right after first sign-in, via
 *  <UsernameOnboardingModal> — not here. */
export function LeaderboardPanel(props: { xp: number; streakDays: number }) {
  const { isAuthenticated, isLoading, loginWithRedirect, error } = useAuth0();
  const token = useAccessToken(AUTH0_CONFIGURED && isAuthenticated);

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
      <h3 className="mb-3 flex items-center gap-2 font-heading text-2xl font-semibold">
        <Trophy className="h-4 w-4" /> Friends & leaderboard
      </h3>
      <div className="border border-border bg-card/85 p-4 backdrop-blur">
        {!AUTH0_CONFIGURED ? (
          <p className="text-sm text-muted-foreground">
            Not set up yet — an admin needs to add Auth0 keys. Your XP and streak keep
            tracking locally either way.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !isAuthenticated ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Log in to add friends and compare XP.
            </p>
            {error && <p className="text-xs text-destructive">Login error: {error.message}</p>}
            <button
              type="button"
              onClick={() => loginWithRedirect()}
              className="bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Log in
            </button>
          </div>
        ) : !token ? (
          <p className="text-sm text-muted-foreground">Signing in…</p>
        ) : (
          <AuthedLeaderboard token={token} xp={props.xp} streakDays={props.streakDays} />
        )}
      </div>
    </section>
  );
}
