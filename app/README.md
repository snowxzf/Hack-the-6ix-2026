# `@plottwist/app` — web demo

Vite + React + Tailwind UI for PlotTwist. Talks to `optimizer/` on-device and
`backend/` for catalog, weather, identify, search, and optional Auth0 users.

```bash
cd app
cp .env.example .env.local   # VITE_API_URL, VITE_AUTH0_*
npm install
npm run dev                  # http://localhost:5173 (strictPort)
```

## Tabs (after onboarding)

| Tab | Primary UI | Notes |
|---|---|---|
| Home | `HomePanel` | Weather, care tasks, impact |
| Garden | garden view in `App.tsx` | Water / harvest / reseed |
| Plan | planner steps in `App.tsx` | Scan → prefs → select → results; multi-garden |
| Learn | `LearnPanel` | Posts + YouTube / web / Wikipedia search |
| Profile | `ProfilePanel` + `LeaderboardPanel` | Avatar, XP, Sign up / friends |

## First open

`WelcomeGate` — **Log in** (Auth0) or **Start from beginning** (guest flag
`plottwist:guestStarted`). After the first garden is confirmed, Profile shows
**Sign up** instead of Log in for guests.

## Auth

- Provider: `src/main.tsx` (`@auth0/auth0-react`) when domain + client id are set
- No API `audience` — ID tokens; backend `AUTH0_AUDIENCE` = SPA client id
- Redirect URI normalized so `127.0.0.1` → `localhost` for Auth0 allow-lists

## State

- Gardens + XP: `localStorage` `plottwist:v3`
- DevTools (`!` in the corner): advance clock, override weather, hard reset

## Key files

| Path | Role |
|---|---|
| `src/App.tsx` | App shell, XP engine, multi-garden |
| `src/components/*` | Panels listed in root README |
| `src/api.ts` | HTTP client |
| `src/xp.ts` | Level / streak rules |
| `src/lib/auth0Config.ts` | Env gating |

See the [root README](../README.md) for XP tables, Auth0 env, and pitch notes.
