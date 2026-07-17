#!/bin/bash
# Installs the TimeKeeping server as a launchd LaunchAgent (auto-start at login, restart on crash).
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LABEL="com.timekeeping.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$HOME/Library/Logs/TimeKeeping"

mkdir -p "$HOME/Library/LaunchAgents" "$LOGS"

sed -e "s|__NODE__|$NODE|g" -e "s|__PROJECT__|$PROJECT|g" -e "s|__LOGS__|$LOGS|g" \
  "$PROJECT/launchd/$LABEL.plist.template" > "$PLIST"

# Reload if already installed
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"

echo "Installed and started $LABEL"
echo "  server : http://localhost:4321"
echo "  logs   : $LOGS/"
echo "  status : launchctl print gui/$UID/$LABEL | head -20"
