import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { AUTH0_CONFIGURED } from "../lib/auth0Config";

export const GUEST_STARTED_KEY = "plottwist:guestStarted";

export function loadGuestStarted(): boolean {
  try {
    return localStorage.getItem(GUEST_STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveGuestStarted(): void {
  try {
    localStorage.setItem(GUEST_STARTED_KEY, "1");
  } catch {
    /* best-effort */
  }
}

export function clearGuestStarted(): void {
  try {
    localStorage.removeItem(GUEST_STARTED_KEY);
  } catch {
    /* best-effort */
  }
}

/** First-open gate: log in (returning) or start local setup as a guest. */
export function WelcomeGate(props: { onStart: () => void }) {
  if (!AUTH0_CONFIGURED) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 px-2 text-center">
        <div>
          <img
            src="/logo.png"
            alt=""
            className="mx-auto mb-3 h-16 w-14 object-contain"
            width={56}
            height={64}
          />
          <h1 className="font-heading text-5xl font-semibold">PlotTwist</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your garden, optimized. With a twist.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onStart}
          className="w-full max-w-xs bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          Start from beginning
        </button>
      </div>
    );
  }
  return <WelcomeGateAuth onStart={props.onStart} />;
}

function WelcomeGateAuth(props: { onStart: () => void }) {
  const { loginWithRedirect, isAuthenticated, isLoading, error } = useAuth0();

  // Returning Auth0 users skip the choice screen and enter setup.
  useEffect(() => {
    if (isAuthenticated) props.onStart();
  }, [isAuthenticated, props.onStart]);

  if (isAuthenticated) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Welcome back — loading your setup…
      </p>
    );
  }

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 px-2 text-center">
      <div>
        <img
          src="/logo.png"
          alt=""
          className="mx-auto mb-3 h-16 w-14 object-contain"
          width={56}
          height={64}
        />
        <h1 className="font-heading text-5xl font-semibold">PlotTwist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your garden, optimized. With a twist.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Checking login…</p>
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-3">
          {error && (
            <p className="text-xs text-destructive">Login error: {error.message}</p>
          )}
          <button
            type="button"
            onClick={() => loginWithRedirect()}
            className="w-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={props.onStart}
            className="w-full border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:border-primary"
          >
            Start from beginning
          </button>
          <p className="text-[11px] text-muted-foreground">
            New here? Start fresh, then create an account from Profile when you&apos;re
            ready.
          </p>
        </div>
      )}
    </div>
  );
}
