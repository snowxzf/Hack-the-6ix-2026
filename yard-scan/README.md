# @plottwist/yard-scan

Camera → real backyard dimensions → `GardenGrid` for the optimizer.

## What it does

1. **Scale reference**
   - **Coin (recommended)** — known diameter (CAD/USD coins)
   - **Custom object** — user picks anything in frame and types its real width in cm
2. **Device spatial attitude** — pitch/roll from CoreMotion / ARKit / ARCore
3. **Multi-photo stitch** — overlapping frames via AR pose or pan hints
4. **GardenGrid out** — 30 cm cells for `@plottwist/optimizer`

## Packages installed

```bash
cd yard-scan
npm install
# installs: typescript, vitest, tsx (see package.json)
npm test
npm run demo
```

## Scale reference API

```ts
import {
  scanYard,
  referenceFromEdgeTaps,
  SCAN_UX,
} from "@plottwist/yard-scan";

// Coin (recommended)
const coinRef = referenceFromEdgeTaps(edgeA, edgeB, {
  mode: "coin",
  kind: "cad_quarter",
});

// Any object — user typed 8.56 cm (credit card width)
const customRef = referenceFromEdgeTaps(edgeA, edgeB, {
  mode: "custom_object",
  kind: "custom",
  customDiameterCm: 8.56,
  label: "credit card",
});

const result = scanYard([{
  id: "f0",
  widthPx, heightPx,
  attitude: { pitchFromNadirRad: 0.2 },
  bedPolygonPx: corners,
  reference: coinRef, // or customRef
}]);
```

Wired into the web test app: `app/` → Scan step.

## Multi-frame UX

1. First photo must include the scale reference.
2. Extra frames: `stitch: { linksTo, direction, overlapFraction }` or AR `worldPositionM`.
