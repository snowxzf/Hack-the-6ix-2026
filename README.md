# PlotTwist 🌱 — Hack the 6ix 2026

**Helping plants and people grow.** Scan your backyard, tell us what you dream of
growing, and PlotTwist computes the optimal planting layout — space, sunlight,
watering logistics, and carbon footprint included.

### Key features

* **Smart camera yard scanning** — Measure awkwardly shaped beds with a phone photo next to a coin or other reference object.
* **Smart garden layouts** — On-device optimizer balances sunlight, watering, spacing, companions, and carbon.
* **Track environmental impact** — Food-plant CO₂e savings from published lifecycle factors; Toronto food-waste context.
* **Care, XP & weather** — Water/harvest loops, streaks, live sky conditions, and a Learn hub (guides + videos).
* **Optional accounts** — Log in or start as a guest; Sign up later from Profile. Friends & leaderboard sync to MongoDB.

---

## Repo layout

| Package | What | Notes |
|---|---|---|
| `app/` | Vite + React web app (primary demo UI) | Tabs: Home, Garden, Plan, Learn, Profile |
| `optimizer/` | Layout + carbon engine (pure TS, tested, on-device) | No I/O |
| `yard-scan/` | Camera yard measure → `GardenGrid` | Coin or custom reference |
| `database/` | Curated plant JSON + Mongo seed | Source of truth: `plants_curated.json` |
| `backend/` | FastAPI: catalog, PlantNet, weather, search, Auth0 users | Mongo `plants`, `gardens`, `clients` |

---

## Packages installed

### Node

| Folder | Install | Notable packages |
|---|---|---|
| `app/` | `npm install` | `react`, `vite`, `tailwindcss`, `lucide-react`, `@auth0/auth0-react` |
| `optimizer/` | `npm install` | `typescript`, `vitest`, `tsx` |
| `yard-scan/` | `npm install` | `typescript`, `vitest`, `tsx` |

### Python

| Folder | Install | Notable packages |
|---|---|---|
| `database/` | `pip install -r requirements.txt` | `pymongo`, `dnspython`, `python-dotenv` |
| `backend/` | `pip install -r requirements.txt` | `fastapi`, `uvicorn`, `pymongo`, `httpx`, `python-jose`, `python-multipart`, `python-dotenv` |

Secrets stay in repo-root `.env` and `app/.env.local` (gitignored). Templates: `.env.example`, `app/.env.example`.

---

## Quickstart

**1. Env**

```bash
cp .env.example .env
cp app/.env.example app/.env.local
# fill MONGODB_URI, Auth0, optional PlantNet / Google keys
```

**2. Frontend** (always on port **5173** — Auth0 callbacks are locked to this)

```bash
cd app && npm install && npm run dev
```

Open **http://localhost:5173** (not `127.0.0.1` if Auth0 is configured).

**3. Backend** (from repo root)

```bash
cd database && pip install -r requirements.txt && python seed.py
cd ..
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

- API docs: http://localhost:8000/docs  
- Contracts: `optimizer/src/types.ts`  
- Catalog: `database/plants_curated.json`

**4. First open**

1. **Log in** (Auth0) or **Start from beginning** (guest)
2. Scan → preferences → select → confirm layout
3. Use bottom nav: **Home · Garden · Plan · Learn · Profile**
4. After setup, Profile shows **Sign up** (if still a guest) for friends/leaderboard

**Optimizer / yard-scan alone**

```bash
cd optimizer && npm install && npm test && npm run demo
cd yard-scan && npm install && npm test && npm run demo
```

**Carbon honesty:** food plants only — `yieldKgPerSeason × co2eSavedPerKg` (Poore & Nemecek / OWID). Ornamentals get no invented CO₂e.

---

## App architecture (`app/`)

Entry: `main.tsx` (optional `Auth0Provider`) → `App.tsx` (state, XP engine, multi-garden, routing).

### User flow

```
WelcomeGate ──Log in──► Auth0 ──► setup (scan…)
           └──Start──► setup (scan → prefs → select → results)
                              │
                              ▼
                    onboarded (gardens.length > 0)
                              │
         ┌────────┬───────────┼───────────┬────────┐
         ▼        ▼           ▼           ▼        ▼
       Home    Garden       Plan        Learn   Profile
```

Local persistence: `localStorage` key `plottwist:v3` (+ `plottwist:guestStarted`).

### UI components (`app/src/components/`)

| Component | Role |
|---|---|
| `WelcomeGate` | First open: **Log in** or **Start from beginning** |
| `BottomNav` | Home / Garden / Plan / Learn / Profile |
| `HomePanel` | Greeting, weather chip, care tasks, impact summary |
| `WeatherProvider` / `WeatherChip` / `WeatherBackground` / `WeatherScene` | Live (or simulated) sky + plant-aware checks |
| `LocationPicker` | City / GPS for weather |
| `ProfilePanel` | Avatar, planter progress, greener-swaps toggle, impact |
| `LeaderboardPanel` | Auth0 Sign up / account, username, friends, XP board |
| `LearnPanel` | Tips + blog posts + search (YouTube / web / Wikipedia) |
| `SearchPanel` | Full-screen plant + guide search overlay |
| `VideoModal` | In-app YouTube (`youtube-nocookie`) |
| `PlantIdentifyFlow` | Camera/photo → PlantNet identify |
| `ImpactStats` | Food kg + CO₂e summary |
| `SpeciesSelectOptions` | Preference / species pickers |

### Other important `app/src/` modules

| Module | Role |
|---|---|
| `App.tsx` | Gardens library, planner steps, XP tick, DevTools |
| `GridView.tsx` / `PhotoGridOverlay.tsx` | Layout grid + scan overlay |
| `CarbonChart.tsx` | Seasonal CO₂e ramp |
| `xp.ts` | Levels, earn/lose amounts, streak bonuses |
| `api.ts` | Backend client (catalog, weather, search, `/users/*`) |
| `lib/auth0Config.ts` | `VITE_AUTH0_*` gating |
| `lib/userProfile.ts` / `lib/savedPlants.ts` | Local profile + saved IDs |
| `devClock.ts` / `devWeather.ts` | Demo time/weather overrides |

Package details: see [`app/README.md`](app/README.md).

---

## Auth0 + MongoDB `clients`

Optional. XP/streaks work fully offline.

1. Auth0 → create a **Single Page Application**  
   Callback / Logout / Web Origins: `http://localhost:5173`
2. Root `.env`:
   - `AUTH0_DOMAIN`
   - `AUTH0_CLIENT_ID` = SPA client id  
   - `AUTH0_AUDIENCE` = **same** client id (ID-token audience)
3. `app/.env.local`: `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` (leave audience unset)

No Auth0 API grant is required. The SPA sends an **ID token**; `backend/auth.py` verifies it (JWKS/RS256).

User docs land in MongoDB collection **`clients`** (`authId`, email, username, xp, streakDays, friends). Without `MONGODB_URI`, the API keeps the same shape in memory.

| Endpoint | Purpose |
|---|---|
| `GET /users/me` | Fetch or create profile |
| `PUT /users/me/username` | Claim unique username |
| `PUT /users/me/stats` | Sync local xp / streak |
| `POST /friends/add` | Add friend by username |
| `GET /friends` | List friends |
| `GET /leaderboard` | You + friends by XP |

---

## Backend highlights

Full table: [`backend/README.md`](backend/README.md).

| Area | Paths |
|---|---|
| Catalog | `/plants`, `/plants/{id}`, `/plants/search/by-name`, `/plants/suggest` |
| Identify | `POST /identify` (PlantNet) |
| Weather | `/geocode`, `/weather` (Open-Meteo) |
| Learn search | `/search`, `/search/videos`, `/search/web`, `/search/wikipedia` |
| Impact | `/stats/toronto-food-waste`, `/impact/food-waste` |
| Gardens | `POST /gardens`, `GET /gardens/{id}` |
| Accounts | `/users/*`, `/friends`, `/leaderboard` |

---

## 🎮 XP system

Implemented in `app/src/xp.ts` + `App.tsx`. Local-first; synced to `clients` when logged in.

### Earn

| Action | XP |
|---|---|
| Water a due plant | +2 |
| Harvest a ready plant | +5 |
| Reseed an empty spot | +3 |
| Every 5 kg CO₂e saved (milestone) | +20 |
| Streak bonuses | see below |

### Lose

| Action | XP |
|---|---|
| Miss a scheduled watering | −4 / plant |
| Ready plant unharvested 7+ days | −2 / week until harvested |

XP never drops below the current level floor.

### Streaks

Confirm every due watering each day; miss a day → streak resets to 0.

| Streak | Bonus |
|---|---|
| 3 days | +10 |
| 7 days | +25 |
| 30 days | +150 |

### Levels

| Level | Title | XP |
|---|---|---|
| 1 | Seedling | 0 |
| 2 | Dirt Enthusiast | 150 |
| 3 | Master Grower | 400 |
| 4 | Legendary Gardener | 800 |

---

## Data sources & credits

| Source | Used for | License / tier |
|---|---|---|
| [PlantNet](https://my.plantnet.org/) | Photo → species ID | Free API key |
| [Open-Meteo](https://open-meteo.com/) | Weather + geocoding | Free, keyless |
| [OpenPlantDB](https://github.com/cwfrazier1/openplantdb) | Care-field verification | CC0 |
| [Perenual](https://perenual.com/docs/api) | Second care-data check | Free API key |
| [OWID / Poore & Nemecek 2018](https://ourworldindata.org/grapher/ghg-per-kg-poore) | Food CO₂e factors | CC BY |
| [City of Toronto food waste audits](https://www.toronto.ca/services-payments/recycling-organics-garbage/waste-management/waste-reduction/food-waste/) | Pitch impact baselines | Public |
| Auth0 | Optional login / friends | Free tenant |
| YouTube / Google CSE / Wikipedia | Learn search | API keys optional (demo fallbacks) |

Catalog (`database/plants_curated.json`) is hand-curated with per-source `verified` flags. See [`database/README.md`](database/README.md).

---

## Toronto food waste context

Source: [City of Toronto — Food Waste](https://www.toronto.ca/services-payments/recycling-organics-garbage/waste-management/waste-reduction/food-waste/) (2017–2018 single-family audits).

| Stat | Value |
|---|---|
| City-wide food waste annually | **99,000+ tonnes** |
| Avg single-family household | **200+ kg / year** |
| Avoidable | **100+ kg / year** |
| Fruits & vegetables | **~45 kg / household / year** |
| Put in Green Bin | **~80%** |
| Canadian edible waste (national context) | **$1,300+ / year** |

```
% fruit/veg waste offset   = foodKgPerSeason ÷ 45 × 100
% avoidable waste offset   = foodKgPerSeason ÷ 100 × 100
% total food waste offset  = foodKgPerSeason ÷ 200 × 100
Green Bin diversion (est.) = foodKgPerSeason × 0.80
$ edible waste avoided     = (foodKgPerSeason ÷ 100) × $1,300 CAD
```

```bash
curl http://localhost:8000/stats/toronto-food-waste
curl "http://localhost:8000/impact/food-waste?foodKg=22.5"
```

---

## Pitch — what to say

Use as a ≈2–3 min script. Swap in live numbers from your demo layout.

### 1. Hook

> “Toronto single-family homes throw away **over 200 kg of food every year** — more than **100 kg is avoidable**, and **fruits and vegetables are the #1 wasted food** at about **45 kg per household**. Almost **80%** of that still goes in the Green Bin. Canadians waste **$1,300+** of edible food at home annually. People want to grow their own food, but most don’t know *what* fits *their* yard, sun, or skill level.”

### 2. Solution

> “**PlotTwist** scans your yard, learns what you want to grow, and computes an **optimized planting layout** — space, sunlight, watering, companions, and **carbon impact**. When your dream garden doesn’t fit, we **negotiate** — that’s the plot twist.”

### 3. Demo beat

Walk: **Welcome → Scan → Preferences → Select → Results → Home / Garden**

> “This garden grows **~X kg of food per season**, offsets **Y%** of typical Toronto fruit & veg waste, and saves **~Z kg CO₂e** — food plants only.”

### 4. Why it’s credible

- Yard scan → real grid (`yard-scan/`)
- Optimizer on-device, tested (`optimizer/`)
- Catalog verified vs OpenPlantDB + Perenual; live Open-Meteo; PlantNet ID
- Honest carbon; Toronto baselines via `/impact/food-waste`

### 5. Close

> “We’re helping **Toronto households grow food that would otherwise be wasted**, with numbers tied to **City waste audits**. **Helping plants and people grow.**”

### Sound bites

- **Problem:** “The average Toronto home wastes **45 kg of produce a year** — we help you grow that instead.”
- **Differentiator:** “When your garden doesn’t fit, we **negotiate**, not reject.”
- **Impact:** “Every kg you grow is a kg that never hit the **Green Bin**.”
- **Honesty:** “We only claim CO₂e on **food you actually yield**.”

### What not to claim

- Don’t say PlotTwist eliminates all household food waste — compare to baselines (45 / 100 / 200 kg).
- Don’t conflate growing-vs-buying CO₂e with landfill methane unless modeled separately.
- The **$1,300** figure is **Canadian national** context — say “estimated.”
