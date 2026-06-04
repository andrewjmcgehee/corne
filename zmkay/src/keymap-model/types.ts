// Canonical model for a parsed ZMK .keymap (devicetree) file.
//
// The parser records source offsets (`span`) for every binding and layer so the
// emitter can splice edits into the original text — preserving comments,
// #defines, behaviors, combos, and formatting that we don't model explicitly.
// This is the "source channel" counterpart to the live RPC `Keymap`.

export interface Span {
  start: number;
  end: number;
}

export interface ParsedBinding {
  /** Behavior name without the leading "&", e.g. "kp", "mo", "lt_bal", "trans". */
  behavior: string;
  /** Parameter tokens, e.g. ["NUM", "SPACE"] or ["LG(LEFT)"] or []. */
  params: string[];
  /** Original text including the "&", e.g. "&lt_bal NUM SPACE". */
  raw: string;
  /** Offsets of `raw` within the source. */
  span: Span;
}

export interface ParsedLayer {
  /** Devicetree node name, e.g. "alpha". */
  name: string;
  /** Optional `label = "...";` value. */
  label?: string;
  bindings: ParsedBinding[];
  /** Span of the content between the `<` and `>` of `bindings = < … >`. */
  bindingsSpan: Span;
}

export interface ParsedCombo {
  name: string;
  bindings: string; // raw binding text, e.g. "&caps_word"
  keyPositions: number[];
}

export interface KeymapDocument {
  /** The original, unmodified source text. Edits are spliced against this. */
  source: string;
  layers: ParsedLayer[];
  combos: ParsedCombo[];
  /** Names of behaviors defined in the `behaviors { … }` node (e.g. "hm"). */
  definedBehaviors: string[];
  /** `#define NAME value` pairs (e.g. ALPHA -> 0, NUM -> 1). */
  defines: Map<string, string>;
  /** Body spans (between the braces) of container nodes, for inserting new
   *  children. Absent if the node doesn't exist yet. `root` is the `/ { … }`. */
  combosSpan?: Span;
  behaviorsSpan?: Span;
  rootSpan?: Span;
}
