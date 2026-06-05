import type { BehaviorBinding, Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type {
  GetBehaviorDetailsResponse,
  BehaviorParameterValueDescription,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { usageLabel } from "./keycodes";

export interface DescribeContext {
  behaviors: Map<number, GetBehaviorDetailsResponse>;
  layers: Layer[];
}

// Find a behavior id by matching its firmware display name (e.g. /key press/i),
// so the editor can apply &kp / &trans / &none without hardcoding numeric ids.
export function findBehaviorId(
  behaviors: Map<number, GetBehaviorDetailsResponse>,
  pattern: RegExp,
): number | undefined {
  for (const [id, details] of behaviors) {
    if (pattern.test(details.displayName)) return id;
  }
  return undefined;
}

export interface BindingLabel {
  /** Primary glyph shown large on the key (e.g. "A", "*", "esc"). */
  main: string;
  /** Optional small badge (e.g. "MO nav", "LT", "⇧"). */
  badge?: string;
  /** Full description for tooltips / accessibility. */
  title: string;
}

// A small map from firmware display names to compact badges. Custom behaviors
// (hold-taps defined in the .keymap) fall through to an initials-based badge.
const BADGES: Array<[RegExp, string]> = [
  [/momentary/i, "MO"],
  [/to layer/i, "TO"],
  [/toggle/i, "TOG"],
  [/layer.?tap/i, "LT"],
  [/mod.?tap/i, "MT"],
  [/sticky layer/i, "SL"],
  [/sticky/i, "SK"],
  [/caps.?word/i, "CAPS"],
  [/bluetooth/i, "BT"],
  [/reset/i, "RST"],
  [/bootloader/i, "BOOT"],
  [/key repeat/i, "REP"],
];

export type ParamKind = "hid" | "layer" | "const" | "range" | "nil" | "unknown";

export function paramKind(
  desc: BehaviorParameterValueDescription | undefined,
): ParamKind {
  if (!desc) return "unknown";
  if (desc.hidUsage) return "hid";
  if (desc.layerId) return "layer";
  if (desc.range) return "range";
  if (desc.constant !== undefined) return "const";
  if (desc.nil) return "nil";
  return "unknown";
}

function layerName(layers: Layer[], ref: number): string {
  // ZMK layer params are typically the stable layer id; fall back to index.
  const byId = layers.find((l) => l.id === ref);
  if (byId) return byId.name || `L${ref}`;
  if (ref >= 0 && ref < layers.length) return layers[ref].name || `L${ref}`;
  return `L${ref}`;
}

function renderParam(kind: ParamKind, value: number, layers: Layer[]): string {
  switch (kind) {
    case "hid":
      return usageLabel(value);
    case "layer":
      return layerName(layers, value);
    default:
      return String(value);
  }
}

export function describeBinding(
  binding: BehaviorBinding,
  ctx: DescribeContext,
): BindingLabel {
  const details = ctx.behaviors.get(binding.behaviorId);
  const display = details?.displayName ?? `behavior ${binding.behaviorId}`;

  // Behavior id 0 with no params is ZMK's transparent/none sentinel in practice;
  // but rely on display name where we can.
  if (/transparent/i.test(display)) {
    return { main: "▽", title: "transparent (fall through)" };
  }
  if (/^none$/i.test(display)) {
    return { main: "✗", title: "none (disabled)" };
  }

  // Bluetooth is not a hold-tap: param1 is the command (BT_*_CMD) and param2 is
  // the profile. The generic two-param path would show the command value (3 for
  // every BT_SEL), so decode it explicitly into "BT <profile>" / "BT CLR" / etc.
  if (/bluetooth/i.test(display)) {
    return describeBluetooth(binding.param1, binding.param2);
  }

  const badge = badgeFor(display);
  const set = details?.metadata?.[0];
  const k1 = paramKind(set?.param1?.[0]);
  const k2 = paramKind(set?.param2?.[0]);

  // No parameters: a bare behavior (caps word, bootloader, …).
  if (k1 === "nil" || k1 === "unknown") {
    return { main: badge ?? short(display), title: display };
  }

  const p1 = renderParam(k1, binding.param1, ctx.layers);

  // Single parameter (kp, mo, to, sk, bt …): show the value, badge the behavior
  // unless it's a plain key press.
  if (k2 === "nil" || k2 === "unknown") {
    const isPlainKey = k1 === "hid" && /key press/i.test(display);
    return {
      main: p1,
      badge: isPlainKey ? undefined : badge,
      title: `${display}: ${p1}`,
    };
  }

  // Two parameters (layer-tap, mod-tap, custom hold-taps): the tap action is the
  // primary glyph, the hold action becomes the badge.
  const p2 = renderParam(k2, binding.param2, ctx.layers);
  // For LT the layer is param1 (hold) and key is param2 (tap); for MT the mod is
  // param1 (hold) and key is param2 (tap). Either way param2 is the tap key.
  const tap = k2 === "hid" ? p2 : p1;
  const hold = k2 === "hid" ? p1 : p2;
  return {
    main: tap,
    badge: badge ? `${badge} ${hold}` : hold,
    title: `${display}: hold ${hold}, tap ${tap}`,
  };
}

// ZMK bt command values (dt-bindings/zmk/bt.h): param1 = command, param2 = profile.
function describeBluetooth(cmd: number, profile: number): BindingLabel {
  switch (cmd) {
    case 3: // BT_SEL_CMD
      return { main: String(profile), badge: "BT", title: `Bluetooth: select profile ${profile}` };
    case 0: // BT_CLR_CMD
      return { main: "CLR", badge: "BT", title: "Bluetooth: clear current profile" };
    case 4: // BT_CLR_ALL_CMD
      return { main: "CLR⁺", badge: "BT", title: "Bluetooth: clear all profiles" };
    case 1: // BT_NXT_CMD
      return { main: "▶", badge: "BT", title: "Bluetooth: next profile" };
    case 2: // BT_PRV_CMD
      return { main: "◀", badge: "BT", title: "Bluetooth: previous profile" };
    case 5: // BT_DISC_CMD
      return { main: `DC${profile}`, badge: "BT", title: `Bluetooth: disconnect profile ${profile}` };
    default:
      return { main: String(cmd), badge: "BT", title: "Bluetooth" };
  }
}

function badgeFor(display: string): string | undefined {
  for (const [re, label] of BADGES) if (re.test(display)) return label;
  return undefined;
}

function short(display: string): string {
  // Initials from a multi-word name, else the first few chars.
  const words = display.split(/[\s_-]+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]!.toUpperCase()).join("");
  return display.slice(0, 4);
}
