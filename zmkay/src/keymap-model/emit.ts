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
