import type { KeymapDocument, ParsedBinding } from "./types";
import { parseKeymap } from "./parse";

// Edits are applied by splicing into the original source at recorded spans, so
// everything we don't model (comments, #defines, behaviors, formatting) is
// preserved byte-for-byte. After an edit we re-parse to get fresh offsets.

// Serialize a binding from its parts: "&kp", "&lt_bal NUM SPACE", "&trans".
export function serializeBinding(behavior: string, params: string[]): string {
  return ["&" + behavior, ...params].join(" ");
}

export function bindingText(b: ParsedBinding): string {
  return serializeBinding(b.behavior, b.params);
}

// Identity serialization: the document's source is the source of truth.
export function serialize(doc: KeymapDocument): string {
  return doc.source;
}

// --- adding source-channel constructs (combos, behaviors) -----------------
// These insert a new child node into the relevant container (combos {} /
// behaviors {}), creating the container in the root if it doesn't exist yet.
// Inserting at the container body's end relies on its `\n  }` closing indent so
// the child lands at the right depth; ZMK doesn't care about indentation anyway.

export interface NewCombo {
  name: string;
  /** Full binding text incl. "&", e.g. "&kp ESC" or "&caps_word". */
  binding: string;
  keyPositions: number[];
}

export function addCombo(doc: KeymapDocument, c: NewCombo): KeymapDocument {
  const child =
    `  ${c.name} {\n` +
    `      bindings = <${c.binding}>;\n` +
    `      key-positions = <${c.keyPositions.join(" ")}>;\n` +
    `    };\n  `;
  if (doc.combosSpan) {
    return insertAt(doc.source, doc.combosSpan.end, child);
  }
  const block =
    `\n  combos {\n    compatible = "zmk,combos";\n  ${child}};\n`;
  return insertInRoot(doc, block);
}

export type HoldTapFlavor = "tap-preferred" | "balanced" | "hold-preferred" | "tap-unless-interrupted";

export interface NewHoldTap {
  name: string;
  flavor: HoldTapFlavor;
  tappingTermMs: number;
  quickTapMs: number;
  /** The two behaviors it wraps, without "&", e.g. ["mo", "kp"]. */
  bindings: [string, string];
}

export function addHoldTap(doc: KeymapDocument, b: NewHoldTap): KeymapDocument {
  const child =
    `  ${b.name}: ${b.name} {\n` +
    `      compatible = "zmk,behavior-hold-tap";\n` +
    `      #binding-cells = <2>;\n` +
    `      flavor = "${b.flavor}";\n` +
    `      tapping-term-ms = <${b.tappingTermMs}>;\n` +
    `      quick-tap-ms = <${b.quickTapMs}>;\n` +
    `      bindings = <&${b.bindings[0]}>, <&${b.bindings[1]}>;\n` +
    `    };\n  `;
  if (doc.behaviorsSpan) {
    return insertAt(doc.source, doc.behaviorsSpan.end, child);
  }
  const block = `\n  behaviors {\n  ${child}};\n`;
  return insertInRoot(doc, block);
}

function insertAt(source: string, at: number, text: string): KeymapDocument {
  return parseKeymap(source.slice(0, at) + text + source.slice(at));
}

function insertInRoot(doc: KeymapDocument, block: string): KeymapDocument {
  if (!doc.rootSpan) throw new Error("No root node to insert into");
  return insertAt(doc.source, doc.rootSpan.end, block);
}

// Replace one binding's text and return a freshly parsed document. `newRaw`
// should be a full binding string including the leading "&".
export function replaceBinding(
  doc: KeymapDocument,
  layerIndex: number,
  keyPosition: number,
  newRaw: string,
): KeymapDocument {
  const layer = doc.layers[layerIndex];
  if (!layer) throw new Error(`No layer at index ${layerIndex}`);
  const binding = layer.bindings[keyPosition];
  if (!binding) throw new Error(`No binding at position ${keyPosition}`);
  const next =
    doc.source.slice(0, binding.span.start) +
    newRaw +
    doc.source.slice(binding.span.end);
  return parseKeymap(next);
}
