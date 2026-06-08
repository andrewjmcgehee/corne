# zmkay — maintainability backlog

Findings from a readability/maintainability review (2026-06-08). The code quality
is high and module-level comments are excellent; what's missing is connective
tissue — a map, typed contracts at the Rust/JS seam, and a consistent logging
story. Ordered by leverage.

## 1. Architecture map — DONE

No README or architecture doc existed. Every *module* explained itself, but
nothing explained how they fit together (the two-channel design, the transport
split, the data flow, the toolchain layout). Added `ARCHITECTURE.md`.

## 2. The Rust↔JS boundary is glued together by magic strings on both sides

The contract between the Rust backend and the TS frontend exists twice, by hand,
with nothing checking the copies agree. This is the biggest interface fragility —
most likely to break silently during future work.

- **Event channel names** — `ble://rx`, `ble://disconnected`, `build://status`,
  `build://log`, `build://run`, `flash://status` — are string literals in Rust
  (`app.emit("...")`) *and* in TS (`listen("...")`). Rename one side → silent no-op.
- **Status unions** — `"building" | "success" | "error" | "canceled"` lives as a
  Rust `String` field (`build.rs:343`, constrained only by a `//` comment) and
  again as a TS `RunStatus` type. They can drift.
- **Log tag prefixes** — Rust emits `[left] …`/`[right] …` (`build.rs:145`) and
  `build-store.ts` string-slices them back apart. Change the format in one place
  and lines silently vanish from a pane.

**Fix:** collect all channel names + shared status literals into one
`src/transport/events.ts` with named consts and a `// MUST match src-tauri/src/*.rs`
header. One file to grep, one documented mirror.

## 3. Logging is ad hoc; silent failures hide bugs

- Frontend logging is scattered `console.log`/`warn` with hand-typed prefixes
  (`[connect]`, `[zmkay]`, `[flash]`, `[reset]`), each preceded by
  `// eslint-disable-next-line no-console` (a signal the lint config is fighting
  the desired behavior).
- **Bigger problem — silent failures.** `notifications.ts`, `behavior-cache.ts`,
  `device-storage.ts`, `build-store.ts`, and several `store.ts` paths swallow
  errors with bare `catch {}`. When a cache silently fails to persist or a
  notification stream dies, there is nothing to see.
- Backend is inconsistent: `ble.rs` uses `eprintln!("[ble] …")`; `build.rs`
  streams to the UI but logs nothing to stderr.

**Fix:** a ~15-line `src/log.ts` with namespaced, leveled loggers
(`const log = logger("connect"); log.info(...)`), the single eslint-disable inside
it, and one env switch to silence in prod. Convert bare `catch {}` to
`catch (e) { log.debug(...) }` — stays non-fatal, becomes visible. Add a small
stderr log wrapper on the Rust side so `build.rs` failures aren't UI-only.

## 4. `src/app/` is a 15-file grab-bag; split it by role

`app/` mixes four kinds of thing, so there's no obvious home for a new component:
- shell + persistent chrome: `App`, `ConnectionBar`, `FlashBar`, `BuildStatus`, `BuildTab`
- modal dialogs: `ConnectDialog`, `FlashDialog`, `BehaviorsDialog`
- reusable forms: `ComboForm`, `HoldTapForm`, `form-bits`
- primitives: `Modal`, `ErrorBoundary`, `BrowserGuard`

Primitives that *should* be shared aren't: `Spinner` and an error-note box are
reimplemented in both `ConnectDialog` and `FlashDialog`; the run-status
`DOT`/`LABEL` styling maps are duplicated between `BuildStatus` and `BuildTab`.

**Fix:** `app/` (shell+chrome), `dialogs/`, `forms/`, `ui/` (Modal, Spinner,
ErrorNote, form-bits). Pulling shared primitives into `ui/` removes the copies and
makes the structure self-documenting.

## 5. Smaller, concrete cleanups

- **Hardcoded path landmine**: `build.rs:745` `dfu_module_dir` falls back to
  `/Users/amcg/Workspaces/corne/firmware/usb-dfu-reset`. (Also in `TODO.md`.) Makes
  the repo silently work only on this machine.
- **Duplicated keycode bit-packing**: `((b & 0x00ffffff) | ((m & 0xff) << 24)) >>> 0`
  appears twice in `KeycodePicker.tsx`; its inverse `splitUsage` lives in
  `keycodes.ts`. The mod-in-top-byte format is implicit/magic. Make it one exported
  `encodeUsage`/`decodeUsage` pair in `keycodes.ts`.
- **Correctness smells worth a verify pass (not just style):**
  - `from-live.ts:199` — `if (!changed || tokens.length !== sLayer.bindings.length) continue;`
    skips a layer when source/live lengths differ; a length mismatch silently
    dropping the edit looks like it could be a bug, not an intended skip.
  - `QuickBind.tsx` — `(position + 1) % count` yields `NaN` if `count` is 0; guard it.
  - Modifier detection by `def.name.includes("SHFT")` (in `QuickBind` and
    `from-live`) is fragile string-matching against keycode names.
- **Document an unenforced invariant**: `types.ts` makes `rootSpan`/`combosSpan`
  optional, then `emit.ts:82` throws if absent. One line noting "emit requires a
  parsed rootSpan" would help.
</content>
</invoke>
