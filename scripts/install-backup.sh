#!/bin/bash
# Installs a daily snapshot of the database into a folder your cloud client syncs
# (Google Drive by default). Usage: scripts/install-backup.sh [destination-dir]
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LABEL="com.timekeeping.backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$HOME/Library/Logs/TimeKeeping"

DEST="${1:-}"
if [ -z "$DEST" ]; then
  # One Google Drive account mounted → use it. Zero or several → ask.
  mounts=("$HOME/Library/CloudStorage"/GoogleDrive-*/"My Drive")
  if [ ${#mounts[@]} -eq 1 ] && [ -d "${mounts[0]}" ]; then
    DEST="${mounts[0]}/TimeKeeping Backups"
  else
    echo "Couldn't pick a Google Drive folder automatically." >&2
    echo "Usage: $0 \"<destination-dir>\"" >&2
    exit 1
  fi
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOGS" "$DEST"

# & is special on sed's replacement side, and & < are special in XML.
esc() { printf '%s' "$1" | sed -e 's|&|\&amp;|g' -e 's|<|\&lt;|g' -e 's|&|\\&|g'; }

sed -e "s|__NODE__|$(esc "$NODE")|g" \
    -e "s|__PROJECT__|$(esc "$PROJECT")|g" \
    -e "s|__DEST__|$(esc "$DEST")|g" \
    -e "s|__LOGS__|$(esc "$LOGS")|g" \
  "$PROJECT/launchd/$LABEL.plist.template" > "$PLIST"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"

echo "Installed $LABEL — snapshot at login and daily at 22:00"
echo "  backups : $DEST"
echo "  logs    : $LOGS/backup.log"
echo "  now     : launchctl kickstart gui/$UID/$LABEL"
