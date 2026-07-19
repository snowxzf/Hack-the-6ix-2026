import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, type FormEvent } from "react";
import { claimUsername, fetchMyProfile } from "../api";
import { AUTH0_CONFIGURED } from "../lib/auth0Config";

/** Shown once right after a first login, so username-claiming happens up
 *  front instead of being discovered later inside Profile's leaderboard card. */
export function UsernameOnboardingModal() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!AUTH0_CONFIGURED || !isAuthenticated) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((t) => {
        if (cancelled) return null;
        setToken(t);
        return fetchMyProfile(t);
      })
      .then((res) => {
        if (cancelled || !res) return;
        setChecked(true);
        if (res.ok && !res.data.username) setNeedsUsername(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    const res = await claimUsername(token, draft.trim());
    setSubmitting(false);
    if (res.ok) setNeedsUsername(false);
    else setError(res.error);
  }

  if (!checked || !needsUsername || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-md"
      role="dialog"
      aria-label="Choose a username"
    >
      <div className="w-full max-w-sm space-y-3 border border-border bg-card p-5">
        <h2 className="font-heading text-2xl font-semibold">Welcome to PlotTwist!</h2>
        <p className="text-sm text-muted-foreground">
          Pick a username so friends can find and add you on the leaderboard.
        </p>
        <form onSubmit={submit} className="space-y-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="username"
            maxLength={20}
            autoFocus
            className="h-10 w-full border border-input bg-card px-3 text-sm outline-none ring-ring focus:ring-2"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={draft.trim().length < 3 || submitting}
              className="bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-45"
            >
              {submitting ? "Saving…" : "Claim username"}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="border border-border bg-card px-4 py-2 text-sm font-medium"
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
