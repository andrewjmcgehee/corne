import { keyByName, type KeyDef } from "../keymap-model/keycodes";

// Maps a browser KeyboardEvent.code to a ZMK keycode name, so "press the key you
// want" works as a binding input. code is layout-independent (physical position),
// which is what we want — pressing the physical Q always yields Q regardless of
// the OS layout. Only codes with a ZMK equivalent are listed; anything else
// falls through to undefined.
const CODE_TO_ZMK: Record<string, string> = {
  // letters
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => {
      const ch = String.fromCharCode(65 + i);
      return [`Key${ch}`, ch];
    }),
  ),
  // number row
  Digit1: "N1", Digit2: "N2", Digit3: "N3", Digit4: "N4", Digit5: "N5",
  Digit6: "N6", Digit7: "N7", Digit8: "N8", Digit9: "N9", Digit0: "N0",
  // punctuation
  Minus: "MINUS", Equal: "EQUAL", BracketLeft: "LBKT", BracketRight: "RBKT",
  Backslash: "BSLH", Semicolon: "SEMI", Quote: "SQT", Backquote: "GRAVE",
  Comma: "COMMA", Period: "DOT", Slash: "FSLH",
  // whitespace / control
  Enter: "ENTER", Escape: "ESC", Backspace: "BSPC", Tab: "TAB", Space: "SPACE",
  CapsLock: "CAPS",
  // editing / nav
  Insert: "INS", Delete: "DEL", Home: "HOME", End: "END",
  PageUp: "PG_UP", PageDown: "PG_DN",
  ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN",
  // function row
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`]),
  ),
  // modifiers
  ShiftLeft: "LSHFT", ShiftRight: "RSHFT",
  ControlLeft: "LCTRL", ControlRight: "RCTRL",
  AltLeft: "LALT", AltRight: "RALT",
  MetaLeft: "LCMD", MetaRight: "RCMD",
  // keypad digits -> number keycodes (close enough for binding intent)
  Numpad0: "N0", Numpad1: "N1", Numpad2: "N2", Numpad3: "N3", Numpad4: "N4",
  Numpad5: "N5", Numpad6: "N6", Numpad7: "N7", Numpad8: "N8", Numpad9: "N9",
};

// Resolve a keydown event to a ZMK keycode definition, or undefined if the key
// has no plain &kp equivalent (e.g. an unmapped media key).
export function keyDefFromEvent(e: KeyboardEvent): KeyDef | undefined {
  const name = CODE_TO_ZMK[e.code];
  return name ? keyByName(name) : undefined;
}
