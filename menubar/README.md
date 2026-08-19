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
brew install --cask swiftbar
```

On first launch SwiftBar asks for a plugin folder. Either point it at this
`menubar/` directory, or keep your own folder and symlink the plugin into it:

```bash
ln -s "$PWD/menubar/koko.1m.sh" ~/path-to-your-plugin-folder/
```

Then **Refresh all** from the SwiftBar menu. The `1m` in the filename is the
refresh interval — rename it to `koko.5m.sh` if once a minute feels eager.

Point it at a different port with a `KOKO_URL` environment variable
(`KOKO_URL=http://localhost:5000`); it defaults to `http://localhost:4321`.

## What you can type

One line, duration first:

```
1:30 fixed the sheets sync #bugfix @Koko
```

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
