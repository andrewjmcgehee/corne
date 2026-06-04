// ZMK keycode catalog.
//
// A `&kp` binding's param is a 32-bit ZMK keycode: explicit modifiers in the
// top byte, HID usage page in bits 16-23, usage id in the low 16 bits. ZMK's
// shifted symbols (STAR, EXCL, …) are just a base usage with the left-shift
// bit set, so we model them the same way and recover a pretty label.
//
// This table is intentionally scoped to what a typical keymap uses (the full
// keyboard page + a little of the consumer page), not the entire HID spec. It
// drives both directions: usage -> label for rendering, name -> usage for the
// editor and the .keymap parser.

export const HID_KBD = 0x07;
export const HID_CONSUMER = 0x0c;

// Modifier bits in the top byte of a ZMK keycode.
const MOD = {
  LCTL: 0x01,
  LSFT: 0x02,
  LALT: 0x04,
  LGUI: 0x08,
  RCTL: 0x10,
  RSFT: 0x20,
  RALT: 0x40,
  RGUI: 0x80,
} as const;

const MOD_LABELS: Array<[number, string]> = [
  [MOD.LGUI, "⌘"],
  [MOD.RGUI, "⌘"],
  [MOD.LCTL, "⌃"],
  [MOD.RCTL, "⌃"],
  [MOD.LALT, "⌥"],
  [MOD.RALT, "⌥"],
  [MOD.LSFT, "⇧"],
  [MOD.RSFT, "⇧"],
];

const kbd = (id: number) => (HID_KBD << 16) | id;
const ls = (usage: number) => usage | (MOD.LSFT << 24);

export interface KeyDef {
  /** Canonical ZMK keycode name, e.g. "A", "STAR", "LCMD". */
  name: string;
  /** Full 32-bit ZMK keycode (mods + page + id). */
  usage: number;
  /** Pretty display label, e.g. "*", "⌘". */
  label: string;
  /** Grouping for the picker UI. */
  group: KeyGroup;
  /** Alternate names that resolve to the same code. */
  aliases?: string[];
}

export type KeyGroup =
  | "letters"
  | "numbers"
  | "symbols"
  | "function"
  | "nav"
  | "editing"
  | "mods"
  | "whitespace"
  | "media";

const RAW: Array<Omit<KeyDef, "usage"> & { id?: number; usage?: number }> = [
  // letters
  ...Array.from({ length: 26 }, (_, i) => {
    const ch = String.fromCharCode(65 + i);
    return { name: ch, id: 0x04 + i, label: ch, group: "letters" as const };
  }),
  // number row 1..9,0  (HID 0x1E..0x27)
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d, i) => ({
    name: `N${d}`,
    id: 0x1e + i,
    label: d,
    group: "numbers" as const,
    aliases: [d],
  })),
  // whitespace / control
  { name: "ENTER", id: 0x28, label: "⏎", group: "whitespace", aliases: ["RET", "RETURN"] },
  { name: "ESC", id: 0x29, label: "esc", group: "whitespace", aliases: ["ESCAPE"] },
  { name: "BSPC", id: 0x2a, label: "⌫", group: "whitespace", aliases: ["BACKSPACE"] },
  { name: "TAB", id: 0x2b, label: "⇥", group: "whitespace" },
  { name: "SPACE", id: 0x2c, label: "␣", group: "whitespace", aliases: ["SPC"] },
  { name: "CAPS", id: 0x39, label: "caps", group: "whitespace", aliases: ["CAPSLOCK"] },
  // punctuation (unshifted)
  { name: "MINUS", id: 0x2d, label: "-", group: "symbols" },
  { name: "EQUAL", id: 0x2e, label: "=", group: "symbols" },
  { name: "LBKT", id: 0x2f, label: "[", group: "symbols" },
  { name: "RBKT", id: 0x30, label: "]", group: "symbols" },
  { name: "BSLH", id: 0x31, label: "\\", group: "symbols" },
  { name: "SEMI", id: 0x33, label: ";", group: "symbols" },
  { name: "SQT", id: 0x34, label: "'", group: "symbols", aliases: ["APOS", "SINGLE_QUOTE"] },
  { name: "GRAVE", id: 0x35, label: "`", group: "symbols" },
  { name: "COMMA", id: 0x36, label: ",", group: "symbols" },
  { name: "DOT", id: 0x37, label: ".", group: "symbols", aliases: ["PERIOD"] },
  { name: "FSLH", id: 0x38, label: "/", group: "symbols", aliases: ["SLASH"] },
  // function row
  ...Array.from({ length: 12 }, (_, i) => ({
    name: `F${i + 1}`,
    id: 0x3a + i,
    label: `F${i + 1}`,
    group: "function" as const,
  })),
  // navigation / editing
  { name: "INS", id: 0x49, label: "ins", group: "editing", aliases: ["INSERT"] },
  { name: "HOME", id: 0x4a, label: "home", group: "nav" },
  { name: "PG_UP", id: 0x4b, label: "pgup", group: "nav", aliases: ["PAGE_UP"] },
  { name: "DEL", id: 0x4c, label: "⌦", group: "editing", aliases: ["DELETE"] },
  { name: "END", id: 0x4d, label: "end", group: "nav" },
  { name: "PG_DN", id: 0x4e, label: "pgdn", group: "nav", aliases: ["PAGE_DOWN"] },
  { name: "RIGHT", id: 0x4f, label: "→", group: "nav" },
  { name: "LEFT", id: 0x50, label: "←", group: "nav" },
  { name: "DOWN", id: 0x51, label: "↓", group: "nav" },
  { name: "UP", id: 0x52, label: "↑", group: "nav" },
  // modifiers
  { name: "LCTRL", id: 0xe0, label: "⌃", group: "mods", aliases: ["LCTL"] },
  { name: "LSHFT", id: 0xe1, label: "⇧", group: "mods", aliases: ["LSHIFT"] },
  { name: "LALT", id: 0xe2, label: "⌥", group: "mods" },
  { name: "LCMD", id: 0xe3, label: "⌘", group: "mods", aliases: ["LGUI", "LWIN"] },
  { name: "RCTRL", id: 0xe4, label: "⌃", group: "mods", aliases: ["RCTL"] },
  { name: "RSHFT", id: 0xe5, label: "⇧", group: "mods", aliases: ["RSHIFT"] },
  { name: "RALT", id: 0xe6, label: "⌥", group: "mods" },
  { name: "RCMD", id: 0xe7, label: "⌘", group: "mods", aliases: ["RGUI", "RWIN"] },
  // shifted symbols (base usage + left shift)
  { name: "EXCL", usage: ls(kbd(0x1e)), label: "!", group: "symbols", aliases: ["BANG"] },
  { name: "AT", usage: ls(kbd(0x1f)), label: "@", group: "symbols" },
  { name: "HASH", usage: ls(kbd(0x20)), label: "#", group: "symbols", aliases: ["POUND"] },
  { name: "DLLR", usage: ls(kbd(0x21)), label: "$", group: "symbols", aliases: ["DOLLAR"] },
  { name: "PRCT", usage: ls(kbd(0x22)), label: "%", group: "symbols", aliases: ["PERCENT"] },
  { name: "CARET", usage: ls(kbd(0x23)), label: "^", group: "symbols" },
  { name: "AMPS", usage: ls(kbd(0x24)), label: "&", group: "symbols", aliases: ["AMPERSAND"] },
  { name: "STAR", usage: ls(kbd(0x25)), label: "*", group: "symbols", aliases: ["ASTRK", "ASTERISK"] },
  { name: "LPAR", usage: ls(kbd(0x26)), label: "(", group: "symbols", aliases: ["LEFT_PARENTHESIS"] },
  { name: "RPAR", usage: ls(kbd(0x27)), label: ")", group: "symbols", aliases: ["RIGHT_PARENTHESIS"] },
  { name: "UNDER", usage: ls(kbd(0x2d)), label: "_", group: "symbols", aliases: ["UNDERSCORE"] },
  { name: "PLUS", usage: ls(kbd(0x2e)), label: "+", group: "symbols" },
  { name: "LBRC", usage: ls(kbd(0x2f)), label: "{", group: "symbols", aliases: ["LEFT_BRACE"] },
  { name: "RBRC", usage: ls(kbd(0x30)), label: "}", group: "symbols", aliases: ["RIGHT_BRACE"] },
  { name: "PIPE", usage: ls(kbd(0x31)), label: "|", group: "symbols" },
  { name: "COLON", usage: ls(kbd(0x33)), label: ":", group: "symbols" },
  { name: "DQT", usage: ls(kbd(0x34)), label: '"', group: "symbols", aliases: ["DOUBLE_QUOTES"] },
  { name: "TILDE", usage: ls(kbd(0x35)), label: "~", group: "symbols" },
  { name: "LT", usage: ls(kbd(0x36)), label: "<", group: "symbols", aliases: ["LESS_THAN"] },
  { name: "GT", usage: ls(kbd(0x37)), label: ">", group: "symbols", aliases: ["GREATER_THAN"] },
  { name: "QMARK", usage: ls(kbd(0x38)), label: "?", group: "symbols", aliases: ["QUESTION"] },
];

export const KEY_DEFS: KeyDef[] = RAW.map((r) => ({
  name: r.name,
  label: r.label,
  group: r.group,
  aliases: r.aliases,
  usage: r.usage ?? kbd(r.id!),
}));

const byName = new Map<string, KeyDef>();
const byUsage = new Map<number, KeyDef>();
for (const def of KEY_DEFS) {
  byName.set(def.name, def);
  for (const a of def.aliases ?? []) byName.set(a, def);
  // First definition for a usage wins (canonical name listed first).
  if (!byUsage.has(def.usage)) byUsage.set(def.usage, def);
}

export function keyByName(name: string): KeyDef | undefined {
  return byName.get(name.toUpperCase());
}

// Fuzzy-ish keycode search over name/label/aliases for the editor's picker.
export function searchKeys(query: string): KeyDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return KEY_DEFS.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q) ||
      (d.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
  );
}

export function keyByUsage(usage: number): KeyDef | undefined {
  return byUsage.get(usage);
}

// Decompose a keycode into modifier bits and the base (mod-stripped) usage.
export function splitUsage(usage: number): { mods: number; base: number } {
  return { mods: (usage >>> 24) & 0xff, base: usage & 0x00ffffff };
}

// Best-effort human label for any keycode. Falls back to "page:id" hex when the
// usage isn't in our table, so unknown keys render honestly rather than blank.
export function usageLabel(usage: number): string {
  const exact = byUsage.get(usage);
  if (exact) return exact.label;

  const { mods, base } = splitUsage(usage);
  const baseDef = byUsage.get(base);
  const modPrefix = MOD_LABELS.filter(([bit]) => mods & bit)
    .map(([, l]) => l)
    .join("");

  if (baseDef) return modPrefix + baseDef.label;

  const page = (base >>> 16) & 0xff;
  const id = base & 0xffff;
  return `${modPrefix}0x${page.toString(16)}:${id.toString(16)}`;
}
