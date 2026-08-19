#!/bin/bash
# Removes the Koko plugin from SwiftBar. Leaves SwiftBar itself installed.
set -euo pipefail
PLUGIN_DIR="${SWIFTBAR_PLUGIN_DIR:-$HOME/SwiftBarPlugins}"
rm -f "$PLUGIN_DIR/koko.1m.sh"
osascript -e 'quit app "SwiftBar"' 2>/dev/null || true
echo "Removed $PLUGIN_DIR/koko.1m.sh and quit SwiftBar."
echo "SwiftBar's plugin folder is still set to $PLUGIN_DIR — change it in SwiftBar's preferences if you want."
