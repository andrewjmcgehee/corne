#!/usr/bin/env bash
# Stop and remove the keytrack LaunchAgent and binary. Leaves collected stats
# in ~/.local/share/keytrack intact (delete that dir yourself if you want).
set -euo pipefail

LABEL="com.amcg.keytrack"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

echo "==> Stopping LaunchAgent"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

echo "==> Removing files"
rm -f "$PLIST" "$HOME/.local/bin/keytrack"

cat <<EOF
==> Removed binary and LaunchAgent.
    Collected stats are kept at: $HOME/.local/share/keytrack
    Remove them with:  rm -rf "$HOME/.local/share/keytrack"
    You may also remove keytrack from System Settings -> Privacy & Security
    -> Input Monitoring.
EOF
