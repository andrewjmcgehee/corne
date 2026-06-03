# keytrack

A passive, **aggregate-only** keystroke tracker for macOS, built to give you
data-driven input for laying out this ZMK Corne.

It listens to the global keyboard with a `CGEventTap` in *listen-only* mode — it
never modifies, delays, or consumes events, so **it cannot slow down your
typing**. It runs in the background and starts at login via a LaunchAgent.

## What it records (and what it deliberately doesn't)

It keeps only **counts**, never the ordered stream of keys, so the data cannot
be reconstructed into the text you typed (passwords, messages, etc.):

| Signal | What it tells you for layout design |
|---|---|
| Per-key frequency | Which keys deserve home-row / strong-finger spots |
| Bigrams (A→B counts) | Common rolls & finger travel to keep easy/adjacent |
| Chord candidates | Keys you *already* press together → ZMK combo candidates |
| Modifier press counts | How heavily you lean on each modifier |
| Shortcuts (ctrl/alt/cmd + key) | Layer / home-row-mod / combo decisions |
| Hold-duration histogram | Tuning `tapping-term-ms` for tap-hold behaviors |
| Inter-key interval histogram | Tuning combo timeout & tapping term |

Bigrams and chords are stored as aggregate pair-counts across your whole corpus
— not sequences — so they reveal frequency, not content.

## Important: you run Karabiner Colemak-DH

A session-level event tap sees keystrokes **after** Karabiner remaps them, so
keytrack records the *logical* letters/symbols you actually intend to type
(Colemak-DH output), not the physical QWERTY positions. That's exactly the
signal you want when deciding what each Corne key should emit. Just remember the
key names in the report are logical characters, not physical key positions.

## Install

```sh
./install.sh
```

This builds the binary (`clang`, no dependencies), installs it to
`~/.local/bin/keytrack`, writes a LaunchAgent to
`~/Library/LaunchAgents/com.amcg.keytrack.plist`, and starts it.

### One manual step: grant permission

macOS gates keyboard monitoring behind a permission. After installing:

> **System Settings → Privacy & Security → Input Monitoring → enable `keytrack`**
> (add `~/.local/bin/keytrack` with the **+** button if it isn't already listed)

The agent restarts itself within ~10s once enabled and begins recording. Until
then the log will show the permission message.

Verify:

```sh
tail -f ~/.local/share/keytrack/keytrack.log   # "keytrack: running ..."
```

## View your stats

```sh
python3 report.py            # reads ~/.local/share/keytrack/stats.txt
python3 report.py --top 30   # show more rows
```

Collect at least a few days of normal typing before drawing conclusions.

## Data & files

- Stats: `~/.local/share/keytrack/stats.txt` (plain text, flushed every 30s and
  on exit; accumulates across restarts). Format is one record per line:
  `k <keycode> <count>`, `b <prev> <cur> <count>`, `c <lo> <hi> <count>`,
  `s <modmask> <keycode> <count>`, `m <modbit> <count>`,
  `h/<i> <bucket_ms> <count>`, `p <keycode> <sum_ms> <count>`.
- Log: `~/.local/share/keytrack/keytrack.log`
- Override the data directory with the `KEYTRACK_DIR` env var.

To reset your data: stop the agent, delete `stats.txt`, start it again.

## Uninstall

```sh
./uninstall.sh
```

Removes the agent and binary; your collected stats are left in place (delete
`~/.local/share/keytrack` yourself if you want them gone). You can also remove
keytrack from the Input Monitoring list in System Settings.

## Build manually

```sh
clang -O2 -Wall keytrack.c -o keytrack \
    -framework ApplicationServices -framework CoreFoundation
```
