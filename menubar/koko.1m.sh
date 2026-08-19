#!/bin/bash
#
# Koko — macOS status bar plugin for SwiftBar (or xbar).
#
# <xbar.title>Koko Time Tracker</xbar.title>
# <xbar.author>Koko</xbar.author>
# <xbar.desc>Shows today's logged time and logs new entries from the status bar.</xbar.desc>
# <xbar.dependencies>Koko running on localhost:4321</xbar.dependencies>
#
# Deliberately dumb: the server does all the parsing (see src/quick-parse.js), so
# this file only has to move one line of text. That means no jq, no node, no
# python — just curl and the tools in /usr/bin, which is all SwiftBar guarantees
# on PATH. Install: see menubar/README.md.

export PATH=/usr/bin:/bin:/usr/sbin:/sbin
# awk formats durations, and a comma decimal separator under a European locale
# would turn "4.2h" into "4,2h".
export LC_ALL=C
BASE="${KOKO_URL:-http://localhost:4321}"
SELF="${SWIFTBAR_PLUGIN_PATH:-$0}"
# The menu items below re-invoke this script by path, so it has to be absolute.
case "$SELF" in /*) ;; *) SELF="$(cd "$(dirname "$SELF")" && pwd)/$(basename "$SELF")" ;; esac

# Design tokens from the app, so the menu looks like it belongs to Koko.
ACCENT='#bf5b34'
MUTED='#8a8378'

# Passed as an argv rather than interpolated into the script text, so a message
# containing quotes (server errors quote the input back) can't break the syntax.
notify() {
  osascript - "$1" <<'APPLESCRIPT' >/dev/null 2>&1
on run argv
  display notification (item 1 of argv) with title "Koko"
end run
APPLESCRIPT
}

# JSON string escapes back to plain text for display.
unescape() { sed 's/\\"/"/g; s/\\\\/\\/g'; }

# ---------- actions (re-invocations of this same script by SwiftBar) ----------

if [ "$1" = "log" ]; then
  text=$(osascript \
    -e 'display dialog "Log time — e.g. 1:30 fixed the sheets sync #bugfix @Koko" default answer "" with title "Koko" buttons {"Cancel", "Log"} default button "Log"' \
    -e 'text returned of result' 2>/dev/null) || exit 0
  [ -z "$text" ] && exit 0

  body=$(curl -s -m 10 --data-urlencode "text=$text" "$BASE/api/quick")
  # The server answers with either the created entry or {"error": "..."}. Field
  # order is fixed by entryRow(), so a plain sed is enough to read it back.
  err=$(printf '%s' "$body" | sed -n 's/^{"error":"\(.*\)"}$/\1/p' | unescape)
  if [ -n "$err" ]; then
    notify "$err"
  elif [ -n "$body" ]; then
    mins=$(printf '%s' "$body" | sed -n 's/.*"minutes":\([0-9]*\).*/\1/p')
    notify "Logged $(awk -v m="$mins" 'BEGIN { h = int(m/60); r = m%60;
      if (h && r) printf "%dh%02d", h, r; else if (h) printf "%dh", h; else printf "%dm", r }')"
  else
    notify "Koko isn't responding on $BASE"
  fi
  exit 0
fi

if [ "$1" = "open" ]; then
  open "$BASE"
  exit 0
fi

# ---------- the menu itself ----------

status=$(curl -s -m 3 "$BASE/api/status")

if [ -z "$status" ]; then
  echo "— | sfimage=timer color=$MUTED"
  echo "---"
  echo "Koko isn't running | color=$MUTED"
  echo "Open $BASE | href=$BASE"
  exit 0
fi

read_num() { printf '%s' "$status" | sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p"; }
today=$(read_num today_minutes)
target=$(read_num target_minutes)
[ -z "$today" ] && today=0
[ -z "$target" ] && target=0
date_today=$(printf '%s' "$status" | sed -n 's/.*"today":"\([0-9-]*\)".*/\1/p')

# Weekends and other non-workdays carry no target, same as the web UI. The day
# of week comes from the date the server reported rather than from the shell's
# own clock, so the two can't disagree either side of midnight. 0 is Sunday,
# matching the JS getDay() values stored in settings.
workdays=$(printf '%s' "$status" | sed -n 's/.*"workdays":\[\([0-9,]*\)\].*/\1/p')
dow=$(date -j -f '%Y-%m-%d' "$date_today" '+%w' 2>/dev/null)
is_target_day=0
[ "$target" -gt 0 ] && case ",$workdays," in *",$dow,"*) is_target_day=1 ;; esac

# Mirrors the app's two formatters: decimal hours for totals (fmtH) and the
# compact form for a single entry (fmtDur), so the menu reads like the web UI.
fmt() { awk -v m="$1" 'BEGIN { printf (m % 60 == 0 ? "%dh" : "%.1fh"), m/60 }'; }
fmt_entry() { awk -v m="$1" 'BEGIN { h = int(m/60); r = m%60;
  if (h && r) printf "%dh%02d", h, r; else if (h) printf "%dh", h; else printf "%dm", r }'; }

# Accent while a workday is still short of target, plain ink once it is met —
# the same at-a-glance signal the reminders give, without a notification.
if [ "$is_target_day" = 1 ] && [ "$today" -lt "$target" ]; then
  echo "$(fmt "$today") | sfimage=timer color=$ACCENT"
else
  echo "$(fmt "$today") | sfimage=timer"
fi

echo "---"
echo "Log entry… | shell=\"$SELF\" param1=log terminal=false refresh=true key=CmdOrCtrl+l"
echo "---"

if [ "$is_target_day" = 1 ]; then
  echo "$(fmt "$today") of $(fmt "$target") logged today | color=$MUTED"
else
  echo "$(fmt "$today") logged today · no target today | color=$MUTED"
fi

entries=$(curl -s -m 3 "$BASE/api/entries?from=$date_today&to=$date_today")

# One line per entry. Splitting on the record boundary and anchoring each field
# to the one that follows it keeps descriptions containing commas or quotes intact.
# The literal backslash-newline is deliberate: BSD sed writes a plain "n" for
# "\n" in a replacement, so the records would never split and fields from
# different entries would be spliced together.
# The trailing newline matters: without it `read` returns non-zero on the last
# record and the while loop discards the oldest entry of the day.
printf '%s\n' "$entries" \
  | sed 's/^\[//; s/\]$//; s/},{/}\
{/g' \
  | sed -n 's/^{.*"minutes":\([0-9]*\),.*"project_name":\(.*\),"project_color".*"description":"\(.*\)","updated_at".*$/\1\t\2\t\3/p' \
  | head -8 | while IFS=$'\t' read -r mins project desc; do
  project=$(printf '%s' "$project" | sed 's/^"//; s/"$//')
  [ "$project" = "null" ] && project="No project"
  desc=$(printf '%s' "$desc" | unescape)
  [ -z "$desc" ] && desc="(no description)"
  echo "$(fmt_entry "$mins")  $desc | length=45 tooltip=\"$project\""
done

echo "---"
echo "Open reports… | shell=\"$SELF\" param1=open terminal=false"
echo "Refresh | refresh=true"
