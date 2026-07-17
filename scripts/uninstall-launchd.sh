#!/bin/bash
# Removes the TimeKeeping LaunchAgent.
set -euo pipefail

LABEL="com.timekeeping.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed $LABEL"
