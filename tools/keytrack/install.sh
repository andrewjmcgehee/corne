#!/usr/bin/env bash
# Build keytrack, install the binary + LaunchAgent, and start it at login.
# Re-runnable: safe to run again after editing the source.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$HOME/.local/bin"
DATA_DIR="$HOME/.local/share/keytrack"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LABEL="com.amcg.keytrack"
PLIST="$AGENTS_DIR/$LABEL.plist"
DOMAIN="gui/$(id -u)"

echo "==> Building keytrack"
clang -O2 -Wall "$HERE/keytrack.c" -o "$HERE/keytrack" \
    -framework ApplicationServices -framework CoreFoundation

echo "==> Installing binary -> $BIN_DIR/keytrack"
mkdir -p "$BIN_DIR" "$DATA_DIR" "$AGENTS_DIR"
install -m 0755 "$HERE/keytrack" "$BIN_DIR/keytrack"

echo "==> Writing LaunchAgent -> $PLIST"
sed "s|__HOME__|$HOME|g" "$HERE/com.amcg.keytrack.plist.template" > "$PLIST"

echo "==> Loading LaunchAgent"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL"
launchctl kickstart -k "$DOMAIN/$LABEL" || true

cat <<EOF

==> Done. One manual step remains: grant Input Monitoring permission.

  macOS will not let keytrack read the keyboard until you allow it:

    System Settings -> Privacy & Security -> Input Monitoring
      -> enable "keytrack"   (add it with + if it isn't listed:
         the binary is $BIN_DIR/keytrack)

  After you toggle it on, the agent restarts itself within ~10s and begins
  recording. Verify with:

    tail -f "$DATA_DIR/keytrack.log"     # should say: keytrack: running ...
    python3 "$HERE/report.py"            # view stats (after some typing)

  It now starts automatically at every login. To stop/remove: ./uninstall.sh
EOF
