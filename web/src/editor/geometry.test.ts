import { describe, it, expect } from "vitest";
import { layoutGeometry, KEY_UNIT_PX } from "./geometry";
import type { KeyPhysicalAttrs } from "@zmkfirmware/zmk-studio-ts-client/keymap";

const key = (x: number, y: number): KeyPhysicalAttrs => ({
  width: 100,
  height: 100,
  x,
  y,
  r: 0,
  rx: 0,
  ry: 0,
});

describe("layoutGeometry", () => {
  it("scales centi-key-units to pixels", () => {
    const g = layoutGeometry([key(0, 0)]);
    expect(g.keys[0].width).toBe(KEY_UNIT_PX);
    expect(g.keys[0].left).toBe(0);
  });

  it("places a second key one unit to the right", () => {
    const g = layoutGeometry([key(0, 0), key(100, 0)]);
    expect(g.keys[1].left).toBe(KEY_UNIT_PX);
  });

  it("computes board bounds from the furthest key edge", () => {
    const g = layoutGeometry([key(0, 0), key(100, 200)]);
    // furthest right/bottom = 100+100 wide, 200+100 tall (in CKU) -> *scale
    expect(g.width).toBe(2 * KEY_UNIT_PX);
    expect(g.height).toBe(3 * KEY_UNIT_PX);
  });

  it("converts rotation centi-degrees to degrees", () => {
    const g = layoutGeometry([{ ...key(0, 0), r: 1500 }]);
    expect(g.keys[0].rotation).toBe(15);
  });
});
