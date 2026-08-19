# Menu bar quick logging

Logs time from the macOS status bar — the icon area on the right, next to wifi
and battery — so you don't have to find a browser window to record twenty
minutes. Reporting stays in the browser; this is only for writing.

The status item shows today's total, in the accent colour while a workday is
still short of target. Its menu has **Log entry…** (⌘L), today's entries, and a
link to the full app.

## Install

`koko.1m.sh` is a [SwiftBar](https://swiftbar.app) plugin. It uses only the
plugin metadata both apps share, so [xbar](https://xbarapp.com) should work too
— untested.

```bash
brew install --cask swiftbar     # if you don't have it
bash scripts/install-swiftbar.sh # sets it up and starts it
bash scripts/uninstall-swiftbar.sh
```

The clock icon and today's total appear in the menu bar on the right. If
nothing shows up, use **Refresh all** from SwiftBar's own menu.

The installer doesn't point SwiftBar at this folder — it gives SwiftBar a
folder of its own (`~/SwiftBarPlugins`) holding a one-line wrapper that runs the
plugin from the repo, so `git pull` is enough to update it. Two reasons it has
to work that way, both of which bite if you set it up by hand:

- **SwiftBar runs everything in its plugin folder**, and sets the executable bit
  while it's at it. Aimed at `menubar/`, it will happily try to execute this
  README.
- **SwiftBar runs plugins through a login shell** unless the plugin says
  `<swiftbar.runInBash>false</swiftbar.runInBash>`. A login shell sources your
  shell profile first, and *anything your profile prints to stdout* arrives
  ahead of the plugin's own output — so a stray `echo` in `~/.bash_profile`
  becomes your menu bar item. The wrapper carries that flag.

The `1m` in the filename is the refresh interval — rename both the wrapper and
the plugin to `koko.5m.sh` if once a minute feels eager.

Point it at a different port with a `KOKO_URL` environment variable
(`KOKO_URL=http://localhost:5000`); it defaults to `http://localhost:4321`.

## What you can type

**Log entry…** opens a small chromeless window with one text field. Type the
whole entry on one line, duration first:

```
1:30 fixed the sheets sync #bugfix @Koko
```

Typing `#` suggests your existing tags with their use counts, and offers to
create the one you're typing; `@` suggests projects. **⏎** takes the highlighted
suggestion while the list is up and logs the entry when it isn't — the hint in
the corner says which. **esc** dismisses the list, then closes the window. As
you type, the corner shows the duration, project and tags the server will
actually record, using the server's own parser rather than a second copy of it.

The window is a Chrome app window, sized by the page itself. Without Chrome the
plugin falls back to a plain AppleScript dialog, which takes exactly the same
one-line syntax but has no suggestions.

The window closing is the confirmation that the entry was logged — the total in
the status bar catches up on the plugin's next refresh, within a minute. The
page could refresh it immediately by opening `swiftbar://refreshallplugins`,
but Chrome puts an "Open SwiftBar?" permission dialog in front of that, which
is a worse trade than a total that's briefly a minute behind.

- **Duration** — anything the app's own duration box takes: `90`, `90m`, `2h`,
  `1:30`, `1h30`, `1.5h` (or `1,5h`). A bare number is minutes.
- **`#tags`** — stay in the description; they're extracted exactly as they are
  when you type them into the web form.
- **`@project`** — case, spaces and punctuation don't matter (`@koko-time`
  finds "Koko Time"), and a unique prefix works. Use `@"Two Words"` if you
  prefer being explicit. **Leave it out and the entry goes to your most recently
  used project**, which is what the web form preselects too.

Everything left over is the description. If the duration is missing or the
project is ambiguous, you get a notification saying so and nothing is logged.

Quick entries always land on **today**. There's nowhere on one line to put a
date without making the syntax guess at your intent, so use the web form to
backdate — the endpoint takes an `entry_date` if you're scripting against it.

The menu lists the day's first eight entries and then says how many it's
hiding; the full day is always in the app.

## Without SwiftBar

The parsing lives in the server (`POST /api/quick`), so the plugin is just a
shell script moving one line of text — anything that can make an HTTP request
can log time:

```bash
curl --data-urlencode "text=1:30 fixed the sheets sync #bugfix @Koko" \
  localhost:4321/api/quick
```

A **Shortcuts** shortcut of "Ask for Input" → "Get Contents of URL" pointed at
that endpoint gives you the same thing with no install at all, and Shortcuts
can pin itself to the menu bar and take a global hotkey. You lose the glanceable
daily total, which is the main reason to prefer the plugin.
