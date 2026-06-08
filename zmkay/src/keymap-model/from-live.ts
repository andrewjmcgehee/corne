import type {
  Keymap,
  BehaviorBinding,
  KeyPhysicalAttrs,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { KeymapDocument, Span } from "./types";
import { keyByUsage, splitUsage } from "./keycodes";
import { paramKind, type ParamKind } from "./describe";

// Render the live (on-device) keymap back into a formatted .keymap by overlaying
// its bindings onto the parsed source. The source stays the structural truth
// (behaviors, combos, #defines, includes, formatting, comments); only bindings
// that actually differ from the device are re-serialized and spliced in, so
// unchanged keys keep their exact original text.
//
// The one thing the RPC doesn't give us is a binding's devicetree name (it has
// only a numeric id + displayName), so we recover id->name by zipping the live
// keymap against the source positionally and taking a majority vote per id —
// robust to the handful of positions the user edited — with a static fallback.

// Standard ZMK behaviors keyed by their Studio displayName (fallback only; the
// zip covers anything actually used in the source).
const STATIC_NAMES: Array<[RegExp, string]> = [
  [/^key press/i, "kp"],
  [/^momentary/i, "mo"],
  [/^to layer/i, "to"],
  [/^toggle/i, "tog"],
  [/^layer.?tap/i, "lt"],
  [/^mod.?tap/i, "mt"],
  [/^sticky layer/i, "sl"],
  [/^sticky/i, "sk"],
  [/^caps.?word/i, "caps_word"],
  [/^bluetooth/i, "bt"],
  [/^transparent/i, "trans"],
  [/^none/i, "none"],
  [/^bootloader/i, "bootloader"],
  [/^reset/i, "sys_reset"],
  [/^key repeat/i, "key_repeat"],
  [/^output/i, "out"],
];

const MOD_FUNCS: Array<[number, string]> = [
  [0x01, "LC"],
  [0x02, "LS"],
  [0x04, "LA"],
  [0x08, "LG"],
  [0x10, "RC"],
  [0x20, "RS"],
  [0x40, "RA"],
  [0x80, "RG"],
];

type Ctx = {
  idToName: Map<number, string>;
  behaviors: Map<number, GetBehaviorDetailsResponse>;
  reverseDefines: Map<string, string>;
  transAlias: string; // "&trans" or "___" if the source uses that shorthand
  noneAlias: string; // "&none" or "xxx"
};

// Recover behaviorId -> devicetree name by majority vote across positions.
export function buildIdToName(live: Keymap, source: KeymapDocument): Map<number, string> {
  const votes = new Map<number, Map<string, number>>();
  const n = Math.min(live.layers.length, source.layers.length);
  for (let i = 0; i < n; i++) {
    const lb = live.layers[i].bindings;
    const sb = source.layers[i].bindings;
    const m = Math.min(lb.length, sb.length);
    for (let k = 0; k < m; k++) {
      const id = lb[k].behaviorId;
      const name = sb[k].behavior;
      if (!name) continue;
      const inner = votes.get(id) ?? new Map<string, number>();
      inner.set(name, (inner.get(name) ?? 0) + 1);
      votes.set(id, inner);
    }
  }
  const out = new Map<number, string>();
  for (const [id, inner] of votes) {
    let best = "";
    let bestCount = -1;
    for (const [name, c] of inner) {
      if (c > bestCount) {
        best = name;
        bestCount = c;
      }
    }
    out.set(id, best);
  }
  return out;
}

function staticName(displayName: string | undefined): string | undefined {
  if (!displayName) return undefined;
  for (const [re, name] of STATIC_NAMES) if (re.test(displayName)) return name;
  return undefined;
}

// A HID usage -> ZMK keycode token, wrapping any modifier bits in LC()/LA()/…
function keycodeToken(usage: number): string {
  const exact = keyByUsage(usage);
  if (exact) return exact.name;
  const { mods, base } = splitUsage(usage);
  const baseDef = keyByUsage(base);
  let tok = baseDef ? baseDef.name : `0x${(base >>> 0).toString(16)}`;
  for (const [bit, fn] of MOD_FUNCS) if (mods & bit) tok = `${fn}(${tok})`;
  return tok;
}

// dt-bindings/zmk/bt.h commands; BT_SEL/BT_DISC carry a profile.
function btToken(cmd: number, profile: number): string {
  switch (cmd) {
    case 0: return "BT_CLR";
    case 1: return "BT_NXT";
    case 2: return "BT_PRV";
    case 3: return `BT_SEL ${profile}`;
    case 4: return "BT_CLR_ALL";
    case 5: return `BT_DISC ${profile}`;
    default: return `${cmd} ${profile}`;
  }
}

function paramToken(kind: ParamKind, value: number, reverseDefines: Map<string, string>): string | null {
  switch (kind) {
    case "hid":
      return keycodeToken(value);
    case "layer":
      return reverseDefines.get(String(value)) ?? String(value);
    case "range":
      return String(value);
    case "const":
    case "nil":
      return null; // implicit / no param
    default:
      return value ? String(value) : null;
  }
}

export function serializeLiveBinding(binding: BehaviorBinding, ctx: Ctx): string {
  const id = binding.behaviorId;
  const name = ctx.idToName.get(id) ?? staticName(ctx.behaviors.get(id)?.displayName) ?? `unknown_${id}`;
  if (name === "bt") return `&bt ${btToken(binding.param1, binding.param2)}`;
  if (name === "trans") return ctx.transAlias ?? "&trans";
  if (name === "none") return ctx.noneAlias ?? "&none";

  const set = ctx.behaviors.get(id)?.metadata?.[0];
  const parts = [`&${name}`];
  const p1 = paramToken(paramKind(set?.param1?.[0]), binding.param1, ctx.reverseDefines);
  if (p1 !== null) parts.push(p1);
  const p2 = paramToken(paramKind(set?.param2?.[0]), binding.param2, ctx.reverseDefines);
  if (p2 !== null) parts.push(p2);
  return parts.join(" ");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// Produce a formatted .keymap reflecting the device's current bindings. Layers
// with no change are kept verbatim; a changed layer is re-rendered as an aligned
// table (since one wider entry can widen — and thus re-flow — its whole column).
// `layoutKeys` (the physical layout) places short rows like the thumbs into their
// real columns; without it, rows fall back to index-aligned columns.
export function emitCandidate(
  live: Keymap,
  behaviors: Map<number, GetBehaviorDetailsResponse>,
  source: KeymapDocument,
  layoutKeys?: KeyPhysicalAttrs[],
): string {
  const idToName = buildIdToName(live, source);
  const reverseDefines = new Map<string, string>();
  for (const [name, val] of source.defines) {
    if (!reverseDefines.has(val)) reverseDefines.set(val, name);
  }
  // Preserve the source's trans/none style (&trans vs the ___ shorthand).
  let transAlias = "&trans";
  let noneAlias = "&none";
  for (const layer of source.layers) {
    for (const b of layer.bindings) {
      if (b.raw === "___") transAlias = "___";
      else if (b.raw === "xxx") noneAlias = "xxx";
    }
  }
  const ctx: Ctx = { idToName, behaviors, reverseDefines, transAlias, noneAlias };

  const edits: Array<{ span: Span; content: string }> = [];
  const n = Math.min(live.layers.length, source.layers.length);
  for (let i = 0; i < n; i++) {
    const sLayer = source.layers[i];
    const lb = live.layers[i].bindings;
    const m = Math.min(lb.length, sLayer.bindings.length);

    const tokens: string[] = [];
    let changed = false;
    for (let k = 0; k < m; k++) {
      const t = serializeLiveBinding(lb[k], ctx);
      tokens.push(t);
      if (norm(t) !== norm(sLayer.bindings[k].raw)) changed = true;
    }
    if (!changed || tokens.length !== sLayer.bindings.length) continue;

    const original = source.source.slice(sLayer.bindingsSpan.start, sLayer.bindingsSpan.end);
    edits.push({ span: sLayer.bindingsSpan, content: formatBindingsGrid(original, tokens, layoutKeys) });
  }

  // Apply last-to-first so earlier spans stay valid.
  edits.sort((a, b) => b.span.start - a.span.start);
  let out = source.source;
  for (const e of edits) {
    out = out.slice(0, e.span.start) + e.content + out.slice(e.span.end);
  }
  return out;
}

// Re-render a layer's bindings as a column-aligned table. Rows come from the
// source's line grouping; each binding's column is its index within a full row,
// or — for short rows like the thumbs — the column whose x it sits under in the
// physical layout (so they land in the right columns with the rest left empty).
// Each column is padded to the widest entry in that column.
function formatBindingsGrid(original: string, tokens: string[], layoutKeys?: KeyPhysicalAttrs[]): string {
  const lines = original.split("\n");
  const parsed = lines.map(splitLineTokens);
  const maxCount = Math.max(0, ...parsed.map((p) => p.toks.length));

  // Position index (0..n) of the first token on each line, in devicetree order.
  let idx = 0;
  const lineStart = parsed.map((p) => {
    const start = idx;
    idx += p.toks.length;
    return start;
  });

  // Column x-centers, taken from the first full-width row.
  const firstFull = parsed.findIndex((p) => p.toks.length === maxCount);
  const colXs =
    layoutKeys && firstFull >= 0
      ? Array.from({ length: maxCount }, (_, j) => layoutKeys[lineStart[firstFull] + j]?.x ?? j)
      : null;

  // Assign every token to a (line, column) cell.
  const grid: string[][] = parsed.map(() => new Array(maxCount).fill(""));
  parsed.forEach((p, li) => {
    p.toks.forEach((_, j) => {
      const pos = lineStart[li] + j;
      const token = tokens[pos] ?? "";
      let col = j;
      if (p.toks.length !== maxCount && colXs && layoutKeys?.[pos]) {
        col = nearestIndex(colXs, layoutKeys[pos].x);
        while (col < maxCount - 1 && grid[li][col] !== "") col++; // avoid collisions
      }
      grid[li][col] = token;
    });
  });

  const colWidths = new Array(maxCount).fill(0);
  grid.forEach((row) => row.forEach((t, c) => (colWidths[c] = Math.max(colWidths[c], t.length))));

  const rstrip = (s: string) => s.replace(/\s+$/, "");
  return parsed
    .map((p, li) => {
      if (p.toks.length === 0) return lines[li]; // structural whitespace
      const cells = grid[li].map((t, c) => t.padEnd(colWidths[c]));
      return rstrip(p.indent + cells.join("  "));
    })
    .join("\n");
}

function nearestIndex(centers: number[], v: number): number {
  let best = 0;
  let bestD = Infinity;
  centers.forEach((c, i) => {
    const d = Math.abs(c - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// Split one line into its leading indent and the count of bindings on it.
function splitLineTokens(line: string): { indent: string; toks: Array<{ text: string }> } {
  const indent = /^(\s*)/.exec(line)![1];
  const rest = line.slice(indent.length);
  const toks: Array<{ text: string }> = [];
  for (let i = 0; i < rest.length; i++) if (rest[i] === "&") toks.push({ text: "&" });
  return { indent, toks };
}
