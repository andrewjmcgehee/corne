import { describe, it, expect } from "vitest";
import { keyByName, keyByUsage, usageLabel, splitUsage, HID_KBD } from "./keycodes";

describe("keycode catalog", () => {
  it("maps letters to keyboard-page usages", () => {
    const a = keyByName("A")!;
    expect(a.usage).toBe((HID_KBD << 16) | 0x04);
    expect(a.label).toBe("A");
    expect(usageLabel(a.usage)).toBe("A");
  });

  it("resolves number aliases both ways", () => {
    expect(keyByName("N7")).toBe(keyByName("7"));
    expect(keyByName("N0")!.label).toBe("0");
  });

  it("decodes shifted symbols to their glyphs", () => {
    // STAR is left-shift + keyboard '8'.
    const star = keyByName("STAR")!;
    expect(usageLabel(star.usage)).toBe("*");
    const { mods } = splitUsage(star.usage);
    expect(mods).toBe(0x02); // LSFT
  });

  it("recovers a label for an unknown modified key via base + mod prefix", () => {
    // Left-GUI + Left arrow is not its own table entry; should prefix ⌘.
    const left = keyByName("LEFT")!;
    const guiLeft = left.usage | (0x08 << 24); // LGUI
    expect(usageLabel(guiLeft)).toBe("⌘←");
  });

  it("folds a modifier onto a base key the way the picker does (LA(BSPC))", () => {
    // The KeycodePicker builds modified keycodes as base | (mods << 24); Alt+BSPC
    // must decode to ⌥⌫, not 0x0:0.
    const bspc = keyByName("BSPC")!;
    const laBspc = ((bspc.usage & 0x00ffffff) | (0x04 << 24)) >>> 0; // LALT
    expect(splitUsage(laBspc)).toEqual({ mods: 0x04, base: bspc.usage });
    expect(usageLabel(laBspc)).toBe("⌥⌫");
  });

  it("falls back to hex for entirely unknown usages", () => {
    const bogus = (0x42 << 16) | 0x1234;
    expect(usageLabel(bogus)).toBe("0x42:1234");
  });

  it("resolves the macOS GLOBE / fn key (consumer page)", () => {
    const globe = keyByName("GLOBE")!;
    expect(globe.usage).toBe((0x0c << 16) | 0x029d);
    expect(usageLabel(globe.usage)).toBe("fn");
    expect(keyByName("FN")).toBe(globe);
  });

  it("collapses Ctrl+Alt+Cmd into the hyper diamond", () => {
    const space = keyByName("SPACE")!;
    const hyper = (space.usage | ((0x01 | 0x04 | 0x08) << 24)) >>> 0; // LCTL+LALT+LGUI
    expect(usageLabel(hyper)).toBe("✦␣");
    // with shift held too, the ⇧ leads the diamond
    const hyperShift = (space.usage | ((0x01 | 0x02 | 0x04 | 0x08) << 24)) >>> 0;
    expect(usageLabel(hyperShift)).toBe("⇧✦␣");
    // a non-hyper combo keeps individual glyphs
    expect(usageLabel((space.usage | ((0x01 | 0x04) << 24)) >>> 0)).toBe("⌃⌥␣");
  });

  it("has a stable canonical name per usage", () => {
    const a = keyByName("A")!;
    expect(keyByUsage(a.usage)!.name).toBe("A");
  });
});
