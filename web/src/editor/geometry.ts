import type { KeyPhysicalAttrs } from "@zmkfirmware/zmk-studio-ts-client/keymap";

// ZMK physical-layout attributes are expressed in centi-key-units: 100 = 1u.
// Rotation `r` is in centi-degrees; `rx`/`ry` are the rotation origin in the
// same centi-key-unit space.
export const CKU_PER_U = 100;

// On-screen size of one key unit. Tuned for a comfortable desktop board.
export const KEY_UNIT_PX = 54;
const SCALE = KEY_UNIT_PX / CKU_PER_U;
// Visual gap between keys, applied as an inset so positions stay on the grid.
const GAP_PX = 4;

export interface PlacedKey {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  originX: number;
  originY: number;
}

export interface BoardGeometry {
  keys: PlacedKey[];
  width: number;
  height: number;
}

// Convert a layout's raw key attrs into absolute pixel boxes plus the overall
// board bounds (so the container can size itself).
export function layoutGeometry(keys: KeyPhysicalAttrs[]): BoardGeometry {
  let maxX = 0;
  let maxY = 0;
  const placed: PlacedKey[] = keys.map((k, index) => {
    const left = k.x * SCALE;
    const top = k.y * SCALE;
    const width = k.width * SCALE;
    const height = k.height * SCALE;
    maxX = Math.max(maxX, k.x + k.width);
    maxY = Math.max(maxY, k.y + k.height);
    return {
      index,
      left,
      top,
      width,
      height,
      rotation: (k.r ?? 0) / 100,
      originX: (k.rx ?? 0) * SCALE - left,
      originY: (k.ry ?? 0) * SCALE - top,
    };
  });
  return {
    keys: placed,
    width: maxX * SCALE,
    height: maxY * SCALE,
  };
}

export { GAP_PX };
