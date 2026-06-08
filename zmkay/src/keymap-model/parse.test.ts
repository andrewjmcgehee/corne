import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseKeymap } from "./parse";
import { parseBindings } from "./parse";
import { replaceBinding, serialize, bindingText } from "./emit";

// A self-contained baseline keymap fixture (NOT the user's live config, which
// changes as combos/behaviors are added through the app).
const KEYMAP_PATH = fileURLToPath(
  new URL("./__fixtures__/corne.keymap", import.meta.url),
);
const source = readFileSync(KEYMAP_PATH, "utf8");

describe("parseKeymap on the corne.keymap fixture", () => {
  const doc = parseKeymap(source);

  it("finds all four layers in order", () => {
    expect(doc.layers.map((l) => l.name)).toEqual([
      "alpha",
      "num",
      "sym",
      "nav",
    ]);
  });

  it("reads layer labels", () => {
    expect(doc.layers.map((l) => l.label)).toEqual([
      "alpha",
      "num",
      "sym",
      "nav",
    ]);
  });

  it("parses 42 bindings per layer (Corne 3x6+3)", () => {
    for (const layer of doc.layers) {
      expect(layer.bindings.length).toBe(42);
    }
  });

  it("parses behaviors and params correctly", () => {
    const alpha = doc.layers[0];
    expect(alpha.bindings[0]).toMatchObject({ behavior: "kp", params: ["TAB"] });
    // The layer-tap thumb key: &lt_bal NUM SPACE
    const lt = alpha.bindings.find((b) => b.behavior === "lt_bal");
    expect(lt?.params).toEqual(["NUM", "SPACE"]);
  });

  it("keeps parenthesized params as single tokens (&kp LG(LEFT))", () => {
    const nav = doc.layers.find((l) => l.name === "nav")!;
    const lg = nav.bindings.find((b) => b.params.some((p) => p.includes("LG(")));
    expect(lg?.params).toContain("LG(LEFT)");
  });

  it("parses the caps_word combo", () => {
    expect(doc.combos).toHaveLength(1);
    expect(doc.combos[0]).toMatchObject({
      name: "caps",
      bindings: "&caps_word",
      keyPositions: [24, 35],
    });
  });

  it("collects custom behavior labels (hm, lt_bal)", () => {
    expect(doc.definedBehaviors).toEqual(
      expect.arrayContaining(["hm", "lt_bal"]),
    );
  });

  it("collects #define layer constants", () => {
    expect(doc.defines.get("ALPHA")).toBe("0");
    expect(doc.defines.get("NAV")).toBe("3");
  });

  it("recorded spans round-trip to the original binding text", () => {
    for (const layer of doc.layers) {
      for (const b of layer.bindings) {
        expect(source.slice(b.span.start, b.span.end)).toBe(b.raw);
      }
    }
  });
});

describe("emit (offset-splice editing)", () => {
  it("is the identity for an unedited document", () => {
    expect(serialize(parseKeymap(source))).toBe(source);
  });

  it("replaces a single binding and leaves everything else byte-identical", () => {
    const doc = parseKeymap(source);
    // Change alpha position 1 (Q) to &kp ESC.
    const original = doc.layers[0].bindings[1];
    expect(bindingText(original)).toBe("&kp Q");
    const edited = replaceBinding(doc, 0, 1, "&kp ESC");

    expect(bindingText(edited.layers[0].bindings[1])).toBe("&kp ESC");
    // The only difference from the source is "Q" -> "ESC".
    expect(edited.source.replace("&kp ESC", "&kp Q")).toBe(source);
  });

  it("re-parses to fresh, valid offsets after an edit", () => {
    const doc = parseKeymap(source);
    const edited = replaceBinding(doc, 0, 0, "&kp CAPS");
    for (const b of edited.layers[0].bindings) {
      expect(edited.source.slice(b.span.start, b.span.end)).toBe(b.raw);
    }
  });
});

describe("parseBindings unit", () => {
  it("splits bindings and trims trailing whitespace from spans", () => {
    const content = "&kp A   &mo NUM  &trans";
    const out = parseBindings(content, 0);
    expect(out.map((b) => b.behavior)).toEqual(["kp", "mo", "trans"]);
    expect(out[0].raw).toBe("&kp A");
    expect(out[1].params).toEqual(["NUM"]);
  });

  it("treats ___ and xxx as &trans / &none bindings", () => {
    const out = parseBindings("&kp A  ___  xxx  &mo NUM", 0);
    expect(out).toHaveLength(4);
    expect(out.map((b) => b.behavior)).toEqual(["kp", "trans", "none", "mo"]);
    expect(out[1].raw).toBe("___");
    expect(out[2].raw).toBe("xxx");
  });
});
