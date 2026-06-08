import type {
  KeymapDocument,
  ParsedLayer,
  ParsedBinding,
  ParsedCombo,
  Span,
} from "./types";

// A focused devicetree parser for ZMK .keymap files. It does NOT aim to model
// arbitrary DTS — only the constructs we visualize/edit (keymap layers +
// bindings, combos, behavior node names, #defines). Everything else is left in
// the source verbatim and preserved by the offset-splicing emitter.

interface Node {
  /** Devicetree label before the node name, e.g. "hm" in `hm: homerow { … }`. */
  label?: string;
  /** Node name, e.g. "alpha", "homerow_shift_esc", or "/" for the root. */
  name: string;
  /** Span of the body between the braces. */
  bodySpan: Span;
}

// --- low-level scanning ---------------------------------------------------

// Return the index just past the `}` matching the `{` at `open`, skipping over
// comments and string literals so stray braces inside them don't confuse us.
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    i = skipTrivia(src, i);
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

// If `i` is at the start of a comment or string, return the index of its last
// character (so a following i++ lands just past it); otherwise return `i`.
function skipTrivia(src: string, i: number): number {
  if (src[i] === "/" && src[i + 1] === "/") {
    const nl = src.indexOf("\n", i);
    return nl === -1 ? src.length : nl;
  }
  if (src[i] === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    return end === -1 ? src.length : end + 1;
  }
  if (src[i] === '"') {
    let j = i + 1;
    while (j < src.length && src[j] !== '"') {
      if (src[j] === "\\") j++;
      j++;
    }
    return j;
  }
  return i;
}

// Matches an optional `label:` then a node name then `{`. Node names may include
// the root `/` and hyphens.
const NODE_RE = /^(?:([A-Za-z_]\w*)\s*:\s*)?(\/|[A-Za-z_][\w-]*)\s*\{/;

// A node identifier sits at the start of a statement: it's the first token on
// its line, or directly follows `{`, `;`, or `}`. This excludes property values
// like `bindings = <…>` (preceded by `=`) while allowing the root `/` node,
// which follows preprocessor lines that don't end in `;`.
function isNodeStart(src: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && (src[j] === " " || src[j] === "\t")) j--;
  if (j < 0) return true;
  return (
    src[j] === "\n" ||
    src[j] === "{" ||
    src[j] === ";" ||
    src[j] === "}"
  );
}

// Recursively collect every node within [start, end) at all depths.
function collectNodes(src: string, start: number, end: number): Node[] {
  const out: Node[] = [];
  let i = start;
  while (i < end) {
    i = skipTrivia(src, i);
    if (i >= end) break;
    const m = NODE_RE.exec(src.slice(i, end));
    if (m && isNodeStart(src, i)) {
      const braceIdx = src.indexOf("{", i);
      const close = matchBrace(src, braceIdx);
      const bodySpan = { start: braceIdx + 1, end: close - 1 };
      out.push({ label: m[1], name: m[2], bodySpan });
      out.push(...collectNodes(src, bodySpan.start, bodySpan.end));
      i = close;
      continue;
    }
    if (src[i] === "{") {
      // Unexpected brace (no node header) — skip the block to stay in sync.
      i = matchBrace(src, i);
      continue;
    }
    i++;
  }
  return out;
}

// --- helpers --------------------------------------------------------------

// Replace comments with same-length whitespace so recorded offsets stay valid.
function blankComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function bodyText(src: string, n: Node): string {
  return src.slice(n.bodySpan.start, n.bodySpan.end);
}

// --- binding parsing ------------------------------------------------------

// Parse the content between `<` and `>` of a bindings property into individual
// bindings, recording absolute source spans. `offset` is the absolute index of
// the content's first character. A binding starts at a `&` (e.g. `&kp A`) or at
// the bare aliases `___`/`xxx` — the de-facto ZMK shorthands for `&trans`/`&none`
// — so layers that use them still count their keys correctly.
export function parseBindings(content: string, offset: number): ParsedBinding[] {
  const clean = blankComments(content);
  const bindings: ParsedBinding[] = [];

  // Binding starts: every `&`, plus standalone ___ / xxx tokens.
  const starts: number[] = [];
  const startRe = /&|(?<![A-Za-z0-9_])(?:___|xxx)(?![A-Za-z0-9_])/g;
  for (let m = startRe.exec(clean); m; m = startRe.exec(clean)) starts.push(m.index);

  for (let a = 0; a < starts.length; a++) {
    const start = starts[a];
    const rawEnd = a + 1 < starts.length ? starts[a + 1] : clean.length;
    const trimmed = content.slice(start, rawEnd).replace(/\s+$/, "");

    let behavior: string;
    let params: string[];
    if (content[start] === "&") {
      const tokens = clean.slice(start + 1, rawEnd).trim().split(/\s+/).filter(Boolean);
      behavior = tokens.shift() ?? "";
      params = tokens;
    } else {
      // Bare alias: expand to its semantic behavior (raw keeps the alias text).
      behavior = trimmed === "___" ? "trans" : trimmed === "xxx" ? "none" : trimmed;
      params = [];
    }

    bindings.push({
      behavior,
      params,
      raw: trimmed,
      span: { start: offset + start, end: offset + start + trimmed.length },
    });
  }
  return bindings;
}

// Locate `bindings = < … >` inside a node body; return content + its span.
function findBindingsProp(
  src: string,
  n: Node,
): { content: string; span: Span } | null {
  const body = blankComments(bodyText(src, n));
  const m = /bindings\s*=\s*</.exec(body);
  if (!m) return null;
  const ltAbs = n.bodySpan.start + m.index + m[0].length - 1; // index of '<'
  const gtAbs = src.indexOf(">", ltAbs);
  if (gtAbs === -1) return null;
  return {
    content: src.slice(ltAbs + 1, gtAbs),
    span: { start: ltAbs + 1, end: gtAbs },
  };
}

function findLabelProp(src: string, n: Node): string | undefined {
  const m = /label\s*=\s*"([^"]*)"/.exec(blankComments(bodyText(src, n)));
  return m ? m[1] : undefined;
}

function nodeBodyHas(src: string, n: Node, re: RegExp): boolean {
  return re.test(blankComments(bodyText(src, n)));
}

// Of the nodes matching `predicate`, return the most specific (smallest body) —
// e.g. the `keymap` node rather than the enclosing root, both of which contain
// the "zmk,keymap" compatible string.
function mostSpecific(
  nodes: Node[],
  predicate: (n: Node) => boolean,
): Node | undefined {
  return nodes
    .filter(predicate)
    .sort(
      (a, b) =>
        a.bodySpan.end - a.bodySpan.start - (b.bodySpan.end - b.bodySpan.start),
    )[0];
}

// Direct children of a node (one level down).
function directChildren(nodes: Node[], parent: Node): Node[] {
  return nodes.filter(
    (n) =>
      n !== parent &&
      n.bodySpan.start > parent.bodySpan.start &&
      n.bodySpan.end < parent.bodySpan.end &&
      !nodes.some(
        (mid) =>
          mid !== parent &&
          mid !== n &&
          mid.bodySpan.start > parent.bodySpan.start &&
          mid.bodySpan.end < parent.bodySpan.end &&
          n.bodySpan.start > mid.bodySpan.start &&
          n.bodySpan.end < mid.bodySpan.end,
      ),
  );
}

// --- top-level parse ------------------------------------------------------

export function parseKeymap(source: string): KeymapDocument {
  const nodes = collectNodes(source, 0, source.length);

  const keymapNode = mostSpecific(nodes, (n) =>
    nodeBodyHas(source, n, /compatible\s*=\s*"zmk,keymap"/),
  );
  const layers: ParsedLayer[] = [];
  if (keymapNode) {
    for (const child of directChildren(nodes, keymapNode)) {
      const bp = findBindingsProp(source, child);
      if (!bp) continue; // not a layer
      layers.push({
        name: child.name,
        label: findLabelProp(source, child),
        bindings: parseBindings(bp.content, bp.span.start),
        bindingsSpan: bp.span,
      });
    }
  }

  const combosNode = mostSpecific(nodes, (n) =>
    nodeBodyHas(source, n, /compatible\s*=\s*"zmk,combos"/),
  );
  const combos: ParsedCombo[] = combosNode
    ? directChildren(nodes, combosNode).map((child) => parseCombo(source, child))
    : [];

  const behaviorsNode = mostSpecific(nodes, (n) => n.name === "behaviors");
  const definedBehaviors = behaviorsNode
    ? directChildren(nodes, behaviorsNode).map((c) => c.label ?? c.name)
    : [];

  const rootNode = mostSpecific(nodes, (n) => n.name === "/");

  return {
    source,
    layers,
    combos,
    definedBehaviors,
    defines: parseDefines(source),
    combosSpan: combosNode?.bodySpan,
    behaviorsSpan: behaviorsNode?.bodySpan,
    rootSpan: rootNode?.bodySpan,
  };
}

function parseCombo(src: string, child: Node): ParsedCombo {
  const clean = blankComments(bodyText(src, child));
  const bindings = /bindings\s*=\s*<([^>]*)>/.exec(clean)?.[1].trim() ?? "";
  const positions = /key-positions\s*=\s*<([^>]*)>/.exec(clean)?.[1] ?? "";
  return {
    name: child.name,
    bindings,
    keyPositions: positions.trim().split(/\s+/).filter(Boolean).map(Number),
  };
}

function parseDefines(src: string): Map<string, string> {
  const defines = new Map<string, string>();
  const re = /^\s*#define\s+([A-Za-z_]\w*)\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) defines.set(m[1], m[2].trim());
  return defines;
}
