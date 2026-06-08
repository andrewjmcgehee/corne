# zmkay — remaining work

Snapshot of what's left, written mid-build. Things already working: live BLE
editing (QuickBind + structured editor), local Zephyr toolchain + cancelable
debounced parallel auto-build (driven by `build.yaml` + `config/west.yml`), USB
half detection, one-click 1200-baud→DFU flash, behaviors/combos editor that
writes `corne.keymap`, and device→source `candidate.keymap` generation.

## Core features

- [ ] **Reconciliation / source write-back (task #5).** The big one. Live (BLE)
      edits and source (`.keymap`) are still separate channels. Today the device
      state is mirrored to `candidate.keymap`; the next step is a real diff
      (device vs `corne.keymap`) and promoting changes into `corne.keymap`
      directly (with confirmation), so source is the single source of truth.
- [ ] **Git sync (task #6).** GitHub OAuth (PKCE) + isomorphic-git to
      clone/commit/push the config repo from the app. Currently manual git.

## Shipping / packaging (task #8)

- [ ] **Generalize the `usb-dfu-reset` module path.** `build.rs::dfu_module_dir`
      is hardcoded to `/Users/amcg/Workspaces/corne/firmware/usb-dfu-reset`.
      Either bundle the module as a Tauri resource and resolve at runtime, or
      publish it to a repo and reference it from `config/west.yml`. Required
      before anyone else can use the build/flash path.
- [ ] **Host-tools story.** The macOS Zephyr SDK ships no host tools, so builds
      rely on system `gperf` (Xcode CLT). A fresh machine without CLT can't
      build. Bundle gperf or detect+guide. (`dtc` is optional; only a warning.)
- [ ] **Fold first-run provisioning into the main flow.** `bootstrap_toolchain`
      is only reachable via the old Firmware dialog; a new user who just edits
      files gets a failed build until they provision. Auto-offer provisioning.
- [ ] **Package the Tauri app** + deploy the web (non-Tauri) build to GitHub
      Pages.

## Firmware / flash robustness

- [ ] **Make "physical flash supersedes BLE" fully reliable.** Current approach:
      clear Studio settings over BLE *before* flashing (pre-flash, while
      connected). That depends on a live BLE link. A cleaner option is a small
      firmware module that stamps a build-id into settings and clears the saved
      keymap on boot when the id changes — then a flash always wins, no BLE, no
      reconnect. (settings_reset.uf2 is already built at
      `~/.zmkay/workspace/build/reset/zephyr/zmk.uf2` as a USB fallback.)
- [ ] **Verify whether `resetSettings` clears BT bonds** (re-pair needed) or is
      keymap-scoped. Affects the auto-reset UX.
- [ ] **Left half 2-CDC runtime** — flashed and connects; sanity-check it works
      as a keyboard with HID + studio CDC + DFU CDC all active.

## Known limitations / polish

- [ ] `build.yaml` parsing only supports the `include:` matrix form (not the
      top-level `board:`/`shield:` arrays). Only `corne_left`/`corne_right`
      entries are used; `settings_reset` is ignored.
- [ ] Parser only expands the two standard no-`&` aliases `___`→`&trans` and
      `xxx`→`&none`; other user-defined bare macros aren't recognized.
- [ ] Behavior editor: hold/tap fields are free text — could be behavior
      dropdowns. Combo key-position picker needs a live connection for the visual
      board (numeric fallback otherwise).
- [ ] Reconnect budget after flash is a hard 5s; bump/make configurable if the
      Mac re-bonds slowly.
- [ ] Prereq #9: confirm the physical layout (likely fine — locking disabled).
- [ ] Stray untracked `corne.keymap` at the repo root — clean up / investigate.

## Debugging aids already in place

- JS console logs: `[flash]`, `[reset]`, `[connect]`, `[render]`.
- Rust stderr (in the `pnpm tauri dev` terminal): `[flash] …`.
- Error boundary renders a stack instead of blanking on a render throw.
- Early build failures now show `ERROR: …` in the Build tab log panes.
