# @plottwist/yard-scan

Camera → real backyard dimensions → `GardenGrid` for the optimizer.

**Helping plants and people grow** starts with knowing how much space you have.
This package turns phone photos into a measured planting bed.

## What it does

1. **Reference coin in frame** — user drops a quarter/penny on the soil; we
   convert pixels → centimeters from the known coin diameter.
2. **Device spatial attitude** — pitch/roll from CoreMotion / ARKit / ARCore
   corrects foreshortening when the phone isn’t perfectly overhead.
3. **Multi-photo stitch** — if the yard doesn’t fit in one shot, capture
   overlapping frames; we merge them via AR world pose (preferred) or pan
   direction hints (hackathon fallback).
4. **GardenGrid out** — rasterized 30 cm cells ready for `@plottwist/optimizer`.

```
┌─────────────┐   coin + bed outline   ┌──────────────┐
│  Phone cam  │ ─────────────────────► │  yard-scan   │
│  + IMU/AR   │   attitude per frame   │  scanYard()  │
└─────────────┘                        └──────┬───────┘
                                              │ GardenGrid
                                              ▼
                                       ┌──────────────┐
                                       │  optimizer  │
                                       └──────────────┘
```

## Quickstart

```bash
cd yard-scan
npm install
npm test
npm run demo
```

## App integration (Selina)

On each shutter press, collect:

| Field | Source |
|---|---|
| Image bitmap | Camera |
| `attitude.pitchFromNadirRad` | CoreMotion gravity / ARKit / ARCore |
| `attitude.worldPositionM` | ARKit/ARCore (best for stitch) |
| `coin` | Tap-to-mark coin **or** Vision circle detect |
| `bedPolygonPx` | User taps corners **or** bed segmentation |
| `stitch` | UI “add another photo →” sets `linksTo` + direction |

```ts
import { scanYard, mockCoinFromTap, attitudeFromGravity } from "@plottwist/yard-scan";

const result = scanYard([
  {
    id: "f0",
    widthPx: 1920,
    heightPx: 1080,
    attitude: attitudeFromGravity(gravityFromDevice),
    bedPolygonPx: tappedCorners,
    coin: mockCoinFromTap(coinCenter, coinDiameterPx, "cad_quarter"),
  },
]);

// result.garden → pass straight into optimizeGarden({ garden: result.garden, ... })
// result.diagnostics.widthCm / heightCm → show "is this right?" confirm sheet
```

### Multi-frame UX

1. First photo must include the **coin**.
2. Prompt: “Need more of the yard? Take another overlapping photo.”
3. Each extra frame sets `stitch: { linksTo: prevId, direction: "right", overlapFraction: 0.25 }`.
4. If AR session is on, fill `worldPositionM` instead — stitch is more accurate.

## Honesty / demo notes

- Coin tap + corner taps are the most reliable hackathon path (CV circle detect can be flaky on soil).
- Steep phone angles warn the user; overhead shots win.
- Convex-hull stitch is a solid approximation for roughly rectangular beds; L-shaped yards may need manual cell edits in the grid UI afterward.
