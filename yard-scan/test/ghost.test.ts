import { describe, expect, it } from "vitest";
import { coinGhostForNextFrame } from "../src/stitch";

describe("coinGhostForNextFrame", () => {
  it("moves a right-edge coin to the left after a pan-right", () => {
    const ghost = coinGhostForNextFrame(
      { x: 1800, y: 1400 },
      40,
      { w: 2160, h: 2880 },
      { w: 2160, h: 2880 },
      "right",
      0.3,
    );
    // shift = 0.7 * 2160 = 1512 → 1800 - 1512 = 288
    expect(ghost.center.x).toBeCloseTo(288, 0);
    expect(ghost.center.y).toBeCloseTo(1400, 0);
    expect(ghost.diameterPx).toBeCloseTo(40, 0);
  });

  it("keeps the ghost on-screen when the math would go off the left edge", () => {
    const ghost = coinGhostForNextFrame(
      { x: 200, y: 1000 },
      50,
      { w: 2160, h: 2880 },
      { w: 2160, h: 2880 },
      "right",
      0.25,
    );
    expect(ghost.center.x).toBeGreaterThan(25);
    expect(ghost.center.x).toBeLessThan(2160);
  });
});
