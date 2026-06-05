import { describe, it, expect } from "vitest";
import { parseKeymap } from "./parse";
import { emitCandidate, serializeLiveBinding, buildIdToName } from "./from-live";
import { keyByName } from "./keycodes";

const SRC = `
#define BASE 0
#define NUM 1
/ {
  behaviors {
    lt_bal: lt_bal { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&mo>, <&kp>; };
  };
  keymap {
    compatible = "zmk,keymap";
    base {
      bindings = <
        &kp A   &mo NUM   &lt_bal NUM SPACE   &kp LG(LEFT)   &bt BT_SEL 0   &trans
      >;
      label = "base";
    };
  };
};
`;

// ids: kp=1, mo=2, lt_bal=3, bt=4, trans=5
const behaviors = new Map<number, any>([
  [1, { id: 1, displayName: "Key Press", metadata: [{ param1: [{ hidUsage: {} }], param2: [] }] }],
  [2, { id: 2, displayName: "Momentary Layer", metadata: [{ param1: [{ layerId: {} }], param2: [] }] }],
  [3, { id: 3, displayName: "lt_bal", metadata: [{ param1: [{ layerId: {} }], param2: [{ hidUsage: {} }] }] }],
  [4, { id: 4, displayName: "Bluetooth", metadata: [{ param1: [], param2: [] }] }],
  [5, { id: 5, displayName: "Transparent", metadata: [{ param1: [{ nil: {} }], param2: [] }] }],
]);

const A = keyByName("A")!.usage;
const SPACE = keyByName("SPACE")!.usage;
const LG_LEFT = keyByName("LEFT")!.usage | (0x08 << 24);

const baseBindings = [
  { behaviorId: 1, param1: A, param2: 0 },
  { behaviorId: 2, param1: 1, param2: 0 },
  { behaviorId: 3, param1: 1, param2: SPACE },
  { behaviorId: 1, param1: LG_LEFT, param2: 0 },
  { behaviorId: 4, param1: 3, param2: 0 },
  { behaviorId: 5, param1: 0, param2: 0 },
];
const live: any = { layers: [{ id: 0, name: "base", bindings: baseBindings }] };

describe("emitCandidate (device -> source)", () => {
  it("recovers behavior names by zipping against the source", () => {
    const idToName = buildIdToName(live, parseKeymap(SRC));
    expect(idToName.get(1)).toBe("kp");
    expect(idToName.get(3)).toBe("lt_bal");
    expect(idToName.get(4)).toBe("bt");
  });

  it("round-trips an unedited keymap byte-for-byte", () => {
    expect(emitCandidate(live, behaviors, parseKeymap(SRC))).toBe(SRC);
  });

  it("serializes modified keycodes, layers, and bt commands", () => {
    const idToName = buildIdToName(live, parseKeymap(SRC));
    const reverseDefines = new Map([["1", "NUM"]]);
    const ctx = { idToName, behaviors, reverseDefines };
    const s = (b: any) => serializeLiveBinding(b, ctx as any);
    expect(s({ behaviorId: 1, param1: keyByName("BSPC")!.usage | (0x04 << 24), param2: 0 })).toBe("&kp LA(BSPC)");
    expect(s({ behaviorId: 2, param1: 1, param2: 0 })).toBe("&mo NUM");
    expect(s({ behaviorId: 3, param1: 1, param2: SPACE })).toBe("&lt_bal NUM SPACE");
    expect(s({ behaviorId: 4, param1: 3, param2: 2 })).toBe("&bt BT_SEL 2");
    expect(s({ behaviorId: 5, param1: 0, param2: 0 })).toBe("&trans");
  });

  it("aligns columns of a changed multi-row layer", () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    base {
      bindings = <
        &kp A     &kp BSPC   &kp C
        &kp DEL   &kp E      &kp F
      >;
    };
  };
};
`;
    const beh = new Map<number, any>([[1, { id: 1, displayName: "Key Press", metadata: [{ param1: [{ hidUsage: {} }], param2: [] }] }]]);
    const kp = (name: string) => ({ behaviorId: 1, param1: keyByName(name)!.usage, param2: 0 });
    // Change the first key so the layer re-renders; widths then differ per column.
    const km: any = { layers: [{ id: 0, name: "base", bindings: [kp("GRAVE"), kp("BSPC"), kp("C"), kp("DEL"), kp("E"), kp("F")] }] };
    const out = emitCandidate(km, beh, parseKeymap(src));
    const rows = out.split("\n").filter((l) => l.includes("&kp"));
    // The second column starts at the same offset on both rows.
    const col2 = (l: string) => l.indexOf("&", l.indexOf("&") + 1);
    expect(col2(rows[0])).toBe(col2(rows[1]));
    expect(out).toContain("&kp GRAVE");
  });

  it("places short (thumb) rows into their real columns via the layout x", () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    base {
      bindings = <
        &kp A   &kp B   &kp C   &kp D
        &kp E   &kp F
      >;
    };
  };
};
`;
    const beh = new Map<number, any>([[1, { id: 1, displayName: "Key Press", metadata: [{ param1: [{ hidUsage: {} }], param2: [] }] }]]);
    const kp = (name: string) => ({ behaviorId: 1, param1: keyByName(name)!.usage, param2: 0 });
    // Two thumb keys (E, F) sit under columns 1 and 2.
    const layoutKeys: any[] = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 },
      { x: 100, y: 300 }, { x: 200, y: 300 },
    ];
    const km: any = { layers: [{ id: 0, name: "base", bindings: [kp("GRAVE"), kp("B"), kp("C"), kp("D"), kp("E"), kp("F")] }] };
    const out = emitCandidate(km, beh, parseKeymap(src), layoutKeys);
    const lines = out.split("\n").filter((l) => l.includes("&kp"));
    const [row0, thumb] = lines;
    // E lands under B (column 1) and F under C (column 2); column 0 is blank.
    expect(thumb.indexOf("&kp E")).toBe(row0.indexOf("&kp B"));
    expect(thumb.indexOf("&kp F")).toBe(row0.indexOf("&kp C"));
  });

  it("splices only the changed binding, preserving the rest", () => {
    const edited = {
      layers: [{ id: 0, name: "base", bindings: [{ behaviorId: 1, param1: keyByName("B")!.usage, param2: 0 }, ...baseBindings.slice(1)] }],
    } as any;
    const out = emitCandidate(edited, behaviors, parseKeymap(SRC));
    expect(out).toContain("&kp B");
    expect(out).not.toContain("&kp A");
    expect(out).toContain("&lt_bal NUM SPACE"); // untouched
    expect(out).toContain('label = "base"');
  });
});
