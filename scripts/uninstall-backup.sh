#!/bin/bash
# Removes the daily backup LaunchAgent. Existing snapshots are left alone.
set -euo pipefail

LABEL="com.timekeeping.backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed $LABEL"
