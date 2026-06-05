import { describe, it, expect } from "vitest";
import { describeBinding } from "./describe";

// Minimal behaviors map: only the display name matters for the bt decode.
const behaviors = new Map<number, any>([[7, { displayName: "Bluetooth" }]]);
const ctx = { behaviors, layers: [] as any };
const bt = (param1: number, param2: number) =>
  describeBinding({ behaviorId: 7, param1, param2 } as any, ctx as any);

describe("describeBinding bluetooth", () => {
  it("shows the profile for BT_SEL (param1=3), not the command value", () => {
    expect(bt(3, 0)).toMatchObject({ main: "0", badge: "BT" });
    expect(bt(3, 1)).toMatchObject({ main: "1", badge: "BT" });
    expect(bt(3, 3)).toMatchObject({ main: "3", badge: "BT" });
  });

  it("decodes the other bt commands", () => {
    expect(bt(0, 0).main).toBe("CLR"); // BT_CLR
    expect(bt(4, 0).main).toBe("CLR⁺"); // BT_CLR_ALL
    expect(bt(1, 0).main).toBe("▶"); // BT_NXT
    expect(bt(2, 0).main).toBe("◀"); // BT_PRV
  });
});
