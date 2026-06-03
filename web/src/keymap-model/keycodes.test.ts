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

  it("falls back to hex for entirely unknown usages", () => {
    const bogus = (0x42 << 16) | 0x1234;
    expect(usageLabel(bogus)).toBe("0x42:1234");
  });

  it("has a stable canonical name per usage", () => {
    const a = keyByName("A")!;
    expect(keyByUsage(a.usage)!.name).toBe("A");
  });
});
