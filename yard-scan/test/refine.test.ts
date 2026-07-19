import { describe, expect, it } from "vitest";
import {
  detectCoinFromTap,
  refineCoinTaps,
  refineReferenceTaps,
  type LumaImage,
} from "../src/refine";

/** Synthetic photo: bright disc (coin) on a darker background. */
function discImage(opts: {
  w: number;
  h: number;
  cx: number;
  cy: number;
  r: number;
  bg?: number;
  fg?: number;
}): LumaImage {
  const { w, h, cx, cy, r } = opts;
  const bg = opts.bg ?? 90;
  const fg = opts.fg ?? 200;
  const luma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // 1px soft edge so sub-pixel refinement has a gradient to lock onto
      const t = Math.min(Math.max(r + 0.5 - d, 0), 1);
      luma[y * w + x] = bg + (fg - bg) * t;
    }
  }
  return { widthPx: w, heightPx: h, luma };
}

describe("refineReferenceTaps", () => {
  it("snaps sloppy taps onto the disc edge (diameter within ~1px)", () => {
    const r = 16;
    const img = discImage({ w: 200, h: 200, cx: 100, cy: 100, r });
    // User taps: 3px outside on the left, 4px inside on the right
    const res = refineReferenceTaps(
      img,
      { x: 100 - r - 3, y: 100 },
      { x: 100 + r - 4, y: 100 },
    );
    expect(res.refined).toBe(true);
    const d = Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y);
    expect(Math.abs(d - 2 * r)).toBeLessThan(1.2);
  });

  it("works on a dark coin against a bright background", () => {
    const r = 12;
    const img = discImage({ w: 160, h: 160, cx: 80, cy: 80, r, bg: 190, fg: 60 });
    const res = refineReferenceTaps(
      img,
      { x: 80 - r + 3, y: 80 },
      { x: 80 + r + 2, y: 80 },
    );
    expect(res.refined).toBe(true);
    const d = Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y);
    expect(Math.abs(d - 2 * r)).toBeLessThan(1.2);
  });

  it("leaves taps alone on a featureless image", () => {
    const flat: LumaImage = {
      widthPx: 100,
      heightPx: 100,
      luma: new Float32Array(100 * 100).fill(120),
    };
    const a = { x: 30, y: 50 };
    const b = { x: 60, y: 50 };
    const res = refineReferenceTaps(flat, a, b);
    expect(res.refined).toBe(false);
    expect(res.a).toEqual(a);
    expect(res.b).toEqual(b);
  });

  it("handles diagonal tap lines", () => {
    const r = 14;
    const img = discImage({ w: 200, h: 200, cx: 100, cy: 100, r });
    const u = Math.SQRT1_2;
    const res = refineReferenceTaps(
      img,
      { x: 100 - (r + 3) * u, y: 100 - (r + 3) * u },
      { x: 100 + (r - 2) * u, y: 100 + (r - 2) * u },
    );
    expect(res.refined).toBe(true);
    const d = Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y);
    expect(Math.abs(d - 2 * r)).toBeLessThan(1.5);
  });

  it("never explodes the span (rejects far-away edges)", () => {
    const r = 10;
    const img = discImage({ w: 300, h: 300, cx: 150, cy: 150, r });
    const res = refineReferenceTaps(
      img,
      { x: 150 - r - 2, y: 150 },
      { x: 150 + r + 2, y: 150 },
    );
    const d = Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y);
    expect(d).toBeGreaterThan((2 * r + 4) * 0.6);
    expect(d).toBeLessThan((2 * r + 4) * 1.5);
  });
});

/** Disc on a wood-grain-like striped background. */
function texturedDisc(opts: {
  w: number;
  h: number;
  cx: number;
  cy: number;
  r: number;
}): LumaImage {
  const { w, h, cx, cy, r } = opts;
  const luma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // background: bright wood with dark grain stripes
      const grain = Math.sin(x * 0.9 + Math.sin(y * 0.13) * 3) > 0.82 ? -40 : 0;
      let v = 195 + grain + ((x * 7 + y * 13) % 5) - 2;
      const d = Math.hypot(x - cx, y - cy);
      const t = Math.min(Math.max(r + 0.5 - d, 0), 1);
      v = v * (1 - t) + 128 * t; // dark gray coin
      luma[y * w + x] = v;
    }
  }
  return { widthPx: w, heightPx: h, luma };
}

describe("refineCoinTaps", () => {
  it("converges to the same diameter from different sloppy taps (textured bg)", () => {
    const r = 13;
    const img = texturedDisc({ w: 240, h: 240, cx: 120, cy: 121, r });
    const tapSets: [number, number, number, number][] = [
      [120 - r - 3, 121 + 2, 120 + r + 2, 121 - 2],
      [120 - r + 2, 119, 120 + r + 3, 123],
      [120 - r - 1, 122, 120 + r - 3, 120],
    ];
    // Contract: refining is allowed to refuse (keep the user's taps) on hard
    // texture, but whenever it does refine, the answer must be accurate.
    const diams: number[] = [];
    for (const [ax, ay, bx, by] of tapSets) {
      const res = refineCoinTaps(img, { x: ax, y: ay }, { x: bx, y: by });
      if (res.refined) {
        diams.push(Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y));
      }
    }
    expect(diams.length).toBeGreaterThanOrEqual(2);
    for (const d of diams) {
      expect(Math.abs(d - 2 * r)).toBeLessThan(1.5);
    }
    // convergence: refined trials agree with each other
    expect(Math.max(...diams) - Math.min(...diams)).toBeLessThan(1);
  });

  it("recovers even when the tap midpoint is off the coin center", () => {
    const r = 15;
    const img = texturedDisc({ w: 240, h: 240, cx: 120, cy: 120, r });
    const res = refineCoinTaps(
      img,
      { x: 120 - r + 4, y: 116 },
      { x: 120 + r + 5, y: 117 },
    );
    expect(res.refined).toBe(true);
    const d = Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y);
    expect(Math.abs(d - 2 * r)).toBeLessThan(1.5);
    const mx = (res.a.x + res.b.x) / 2;
    expect(Math.abs(mx - 120)).toBeLessThan(1.5);
  });

  it("refuses when there is no coin-like contrast", () => {
    const flat: LumaImage = {
      widthPx: 100,
      heightPx: 100,
      luma: new Float32Array(100 * 100).fill(150),
    };
    const res = refineCoinTaps(flat, { x: 40, y: 50 }, { x: 60, y: 50 });
    expect(res.refined).toBe(false);
  });

  it("works for a bright coin on dark soil", () => {
    const r = 12;
    const { w, h } = { w: 200, h: 200 };
    const luma = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const noise = ((x * 31 + y * 17) % 7) - 3;
        let v = 70 + noise; // dark soil
        const d = Math.hypot(x - 100, y - 100);
        const t = Math.min(Math.max(r + 0.5 - d, 0), 1);
        v = v * (1 - t) + 210 * t; // shiny coin
        luma[y * w + x] = v;
      }
    }
    const img: LumaImage = { widthPx: w, heightPx: h, luma };
    const res = refineCoinTaps(
      img,
      { x: 100 - r - 2, y: 101 },
      { x: 100 + r + 3, y: 99 },
    );
    expect(res.refined).toBe(true);
    const d = Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y);
    expect(Math.abs(d - 2 * r)).toBeLessThan(1.5);
  });
});


describe("detectCoinFromTap (single tap)", () => {
  it("finds the coin from one tap near its center", () => {
    const r = 14;
    const img = texturedDisc({ w: 240, h: 240, cx: 120, cy: 120, r });
    const res = detectCoinFromTap(img, { x: 122, y: 118 });
    expect(res).not.toBeNull();
    const d = Math.hypot(res!.b.x - res!.a.x, res!.b.y - res!.a.y);
    expect(Math.abs(d - 2 * r)).toBeLessThan(2);
  });

  it("works for a small coin (r=8) and a big one (r=30)", () => {
    for (const r of [8, 30]) {
      const img = texturedDisc({ w: 300, h: 300, cx: 150, cy: 150, r });
      const res = detectCoinFromTap(img, { x: 150 + 3, y: 150 - 2 });
      expect(res).not.toBeNull();
      const d = Math.hypot(res!.b.x - res!.a.x, res!.b.y - res!.a.y);
      expect(Math.abs(d - 2 * r)).toBeLessThan(Math.max(2, r * 0.15));
    }
  });

  it("returns null on a featureless image", () => {
    const flat: LumaImage = {
      widthPx: 120,
      heightPx: 120,
      luma: new Float32Array(120 * 120).fill(140),
    };
    expect(detectCoinFromTap(flat, { x: 60, y: 60 })).toBeNull();
  });
});
