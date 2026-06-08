# zmkay architecture

zmkay configures a ZMK (Corne) keyboard two ways at once: it edits the keymap
**live over Bluetooth** while you watch it change on the board, and it **builds +
flashes firmware** from your local config repo. Those are two independent
channels (see [The two channels](#the-two-channels)). It runs as a Tauri desktop
app (Rust backend + React/TS frontend) and as a plain web app with reduced
capability.

> New here? Read [The two channels](#the-two-channels) and
> [The transport split](#the-transport-split) first — everything else is detail.
> For the open work and known limits, see `TODO.md`. For the maintainability
> backlog, see `MAINTAINABILITY.md`.

## The two channels

The central thing to understand. They are **separate today** — reconciling them
(promoting live edits back into source) is the top item in `TODO.md`.

### Channel A — live edit over BLE (works in web and native)

The keyboard speaks the **ZMK Studio RPC** protocol over a BLE characteristic.
zmkay connects, reads the current keymap *off the device*, and writes binding
changes back instantly. No firmware build is involved; what you see is the
board's live state.

```
device ──RPC──▶ rpc/client.ts ──▶ state/store.ts ──▶ editor/ (BoardView, KeyEditor, QuickBind)
        ◀──────────────────────── setBinding / save / discard
```

- `state/store.ts` is the hub: connection lifecycle, the in-memory `keymap`, and
  every live action (`setBinding`, `save`, `discard`, `restoreStock`).
- On `save`, the device's keymap is also rendered to `candidate.keymap` (a
  *preview* of source, never the source itself — see `keymap-model/from-live.ts`).
  This is the seam where Channel A reaches toward Channel B but does not yet cross.

### Channel B — source → build → flash (native only)

Your config repo's `corne.keymap` / `build.yaml` / `west.yml` are the source of
truth for firmware. zmkay watches that folder, builds both Corne halves with a
private Zephyr toolchain, and flashes the resulting `.uf2`s over USB.

```
config/ (corne.keymap, build.yaml, west.yml)
   │  file watcher (src-tauri build.rs)
   ▼
west build  ──▶  zmk.uf2 (left + right)  ──▶  USB DFU flash (src-tauri flash.rs / usb.rs)
```

- The editor for *source* combos / hold-taps is `app/BehaviorsDialog.tsx`, which
  parses and rewrites `corne.keymap` via `keymap-model/`.
- Build orchestration lives entirely in Rust (`src-tauri/src/build.rs`); the TS
  side (`transport/build.ts`, `state/build-store.ts`) just drives it and renders
  progress.

## The transport split

How a connection is opened depends on platform. `isTauri()`
(`transport/tauri-ble.ts`) is the switch.

| Concern        | Web build                    | Native (Tauri) build                         |
| -------------- | ---------------------------- | -------------------------------------------- |
| BLE            | `transport/gatt.ts` (Web Bluetooth) | `transport/tauri-ble.ts` → Rust `ble.rs` |
| Serial         | `transport/connect.ts` (Web Serial) | same                                      |
| Build / flash  | unavailable                  | `transport/{build,flash,usb,config}.ts` → Rust |

`transport/connect.ts` is the front door: it dispatches on `TransportKind`
(`"ble" | "serial"`) and wraps whatever transport it gets in the Studio client's
`RpcConnection`. Native BLE exists because ZMK guards the Studio characteristic
with `ENCRYPT` permissions, so it only answers over a bonded link — the Rust
`ble.rs` reaches the keyboard while it's already paired+connected to the OS
(see the header comment in `src-tauri/src/ble.rs` for the full why).

Everything under `transport/` that isn't `gatt.ts` / `connect.ts` is a thin
Tauri `invoke` wrapper and is **native-only** — calling it in the web build
throws.

## Directory map

```
src/
  app/          React shell, header chrome, dialogs, source-keymap forms
  editor/       live keymap editor — board render, key cells, pickers, QuickBind
  keymap-model/ parse/emit/describe .keymap text; render live keymap → candidate
  rpc/          typed wrappers over the Studio RPC client; behavior/keymap cache
  state/        zustand stores: store.ts (live/connection), build-store.ts (builds)
  transport/    platform transports + Tauri command wrappers (see split above)

src-tauri/src/
  ble.rs        native BLE transport for the Studio RPC characteristic
  build.rs      local Zephyr toolchain: provision, watch, parallel cancelable build
  flash.rs      UF2 flashing
  usb.rs        USB half detection + 1200-baud → DFU trigger
  config.rs     read/write keymap files in the config folder
  lib.rs        registers every #[tauri::command] (the full backend API surface)
```

`src-tauri/src/lib.rs` is the **index of the backend API** — every command the
frontend can call is listed in its `invoke_handler!`. Start there to see what
Rust offers.

## Data the app persists

- **localStorage** (`rpc/behavior-cache.ts`, `state/device-storage.ts`): cached
  behaviors/layouts/keymap per device (so reconnect renders instantly before the
  slow BLE refetch), the known-device registry, the per-device config folder
  path, and USB half nicknames.
- **The private toolchain** under `~/.zmkay` (Unix) / `%LOCALAPPDATA%\zmkay`
  (Windows): Python venv (west/cmake/ninja), the west workspace (zmk + zephyr +
  modules), and the Zephyr SDK. Provisioned once on first build; ~2–3 GB. Path
  must contain **no spaces** (Zephyr's devicetree preprocessor breaks otherwise —
  see `build.rs` header).

## The Rust ↔ JS contract

The backend and frontend communicate two ways, and **both are currently
stringly-typed on each side independently** (a known fragility — see
`MAINTAINABILITY.md` §2):

- **Commands**: TS `invoke("ble_connect", …)` → Rust `#[tauri::command] ble_connect`.
  The authoritative list is `lib.rs`.
- **Events** (Rust → JS, push): the backend `emit`s named channels the frontend
  `listen`s on — `ble://rx`, `ble://disconnected`, `build://{status,log,run}`,
  `flash://status`. These names, plus shared status strings
  (`"building" | "success" | "error" | "canceled"`), are duplicated by hand on
  both sides; keep them in sync until they're centralized.
</content>
