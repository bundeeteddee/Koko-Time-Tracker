# TimeKeeping

A personal, Noko-style time tracker that runs entirely on the user's machine.
Single-user local web app at http://localhost:4321. SQLite is the source of
truth; an optional Google Sheet acts as a one-way, disposable mirror. Entries
are logged after the fact (duration + description) — there is no timer.

## Architecture

- `server.js` — Express bound to 127.0.0.1:4321. Parses JSON *and* form
  bodies (shell clients post with `curl --data-urlencode`, which sidesteps
  JSON-escaping user text), and serves static files with `extensions: ['html']`
  so `/quick` resolves to `quick.html`
- `src/db.js` — built-in `node:sqlite` (NOT better-sqlite3; zero native deps),
  migrations via `PRAGMA user_version`, schema: projects / tags / entries /
  entry_tags / settings / sync_state
- `src/routes.js` + `src/reports.js` — JSON API under `/api`. `POST /api/quick`
  logs a whole entry from one line of text; it shares the one write path
  (`insertEntry`) with `POST /api/entries`
- `src/reminders.js` — in-process 60s scheduler; under-logged-day reminders via
  macOS notifications (osascript)
- `src/sheets-sync.js` — Google Sheets mirror: debounced full-tab rewrite using
  a service account, with startup catch-up, hourly re-mirror, and backoff retry
- `public/` — no-build vanilla-JS SPA (`index.html` is a static skeleton,
  `app.js` renders into it, Chart.js and Instrument Serif vendored under
  `public/vendor/` so the app works offline). No framework, no bundler —
  keep it that way. `quick.html`/`quick.js`/`quick.css` are a separate
  single-field page opened from the menu bar as a Chrome app window; it sizes
  the window to its own content because Chrome ignores `--window-size` when
  it's already running, and re-sizes on `document.fonts.ready` because
  Instrument Serif lands after first paint
- `public/quick-parse.js` — the one-line quick-entry parser, dual-loaded like
  `duration.js`: required by `src/routes.js` for `POST /api/quick` and loaded
  as a plain script by the popup, so its live preview is the server's own parse
- `menubar/koko.1m.sh` — SwiftBar/xbar plugin: today's total in the macOS
  status bar plus a one-line log dialog. Deliberately dumb (curl + sed only,
  no jq/node/python) because `POST /api/quick` does the parsing
  (`public/quick-parse.js`). Installed via `scripts/install-swiftbar.sh`, which
  writes a wrapper into `~/SwiftBarPlugins` rather than pointing SwiftBar at
  `menubar/` — SwiftBar executes *every* file in its plugin folder (README
  included) and runs plugins through a login shell unless they declare
  `<swiftbar.runInBash>false</swiftbar.runInBash>`, in which case anything the
  user's shell profile prints becomes the status bar item
- `design/PersonalTimeKeeping-App.dc.html` — the original design mock the UI
  is translated from

## Conventions and invariants

- **Data lives in `data/`** (gitignored): `timekeeping.db` plus
  `service-account.json` (Google credentials). Never commit it. `npm run seed`
  wipes entries, projects and tags — it is for development against a throwaway
  database only. It is also the demo world the README's screenshots and
  `docs/tour.gif` are recorded from, so keep its projects/descriptions
  presentable.
- **Design fidelity**: new UI should reuse the mock's tokens — card `#f4efe6`,
  panel `#faf6ee`, accent `#bf5b34`, ink `#2d2822`, tag pills
  `#efe6d4`/`#8a5a2a`, Instrument Serif for large numerals.
- **Tags are parsed, not managed**: `#tags` are extracted from entry
  descriptions (`syncEntryTags` re-parses on every create/update). A tag comes
  into existence when an entry containing it is logged — never eagerly from
  the autocomplete UI.
- **Sync freshness**: any route that mutates data must call `markDirty()` so
  the Sheets mirror gets scheduled.

## Running / debugging

- `npm start` runs the server directly. For always-on use,
  `scripts/install-launchd.sh` installs it as a launchd LaunchAgent
  (`com.timekeeping.app`) that starts at login and restarts on crash.
- After server-code changes when running under launchd:
  `launchctl kickstart -k gui/$UID/com.timekeeping.app`
- launchd logs go to `~/Library/Logs/TimeKeeping/`, not `logs/` in the repo:
  launchd cannot use paths inside TCC-protected folders (`~/Documents`,
  `~/Desktop`, `~/Downloads`) — WorkingDirectory or Std*Path there makes the
  job fail with exit code 78. Keep the plist template that way.
- Frontend changes need only a browser hard-refresh; no server restart.
- `npm test` runs `node --test` over `test/`. Pure helpers meant to be tested
  live in their own `public/*.js` file with a guarded `module.exports` at the
  bottom (see `public/duration.js`) so Node can require them while the browser
  still loads them as a plain `<script>` — no bundler, no test framework.
- Verify UI changes by driving the real app headlessly (e.g. puppeteer-core
  with system Chrome against localhost:4321), and exercise both keyboard and
  mouse paths — hover-triggered re-renders have previously broken mouse
  interaction while keyboard paths kept passing. Install the driver outside the
  repo (`npm install --prefix <scratch> puppeteer-core`) — the project ships
  with no devDependencies and it should stay that way.
- Drive it against a throwaway copy of the app, not the real one: `src/db.js`
  resolves `data/` from `__dirname/..`, so copying `server.js`/`src`/`public`
  to a scratch directory with an empty `data/` and running it on another port
  gives a disposable database. Symlinking instead of copying doesn't work —
  `__dirname` resolves through the symlink back to the real `data/`.
- Menu bar changes can't be verified from a script's stdout alone; SwiftBar may
  never run it, or prepend something. Screenshot the real thing:
  `screencapture -x -R"<x>,0,<w>,26" out.png` (coordinates are points, so half
  the pixel width on Retina).
- README artwork is regenerated, not hand-captured: `scripts/tour/record.js`
  drives a throwaway copy of the app and writes one frame per visual state with
  the duration it should hold, `build-gif.sh` turns those into `docs/tour.gif`,
  and `shots.js` refreshes `docs/screenshots/`. Read `record.js`'s header before
  running any of them — it logs real entries, so it must never point at the real
  app, and the demo database needs reseeding between takes.
