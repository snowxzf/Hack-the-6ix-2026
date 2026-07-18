# PlotTwist 🌱 — Hack the 6ix 2026

Scan your backyard, tell us what you dream of growing, and PlotTwist computes the
optimal planting layout — space, sunlight, watering logistics, and carbon footprint
included. When your dreams don't fit your yard, we negotiate. That's the plot twist.

## Repo layout

| Package | What | Owner |
|---|---|---|
| `optimizer/` | Layout + carbon optimization engine (pure TS, tested, on-device) | Sara |
| `app/` | Mobile app (scan → preferences → layout → dashboard) | Selina |
| API / catalog | Plant catalog, PlantNet ID, Open-Meteo weather | Jessica |

## Quickstart

```
cd optimizer && npm install && npm test && npm run demo
```

Data contracts between all packages live in `optimizer/src/types.ts`.
