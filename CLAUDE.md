# TimeKeeping

A personal, Noko-style time tracker that runs entirely on the user's machine.
Single-user local web app at http://localhost:4321. SQLite is the source of
truth; an optional Google Sheet acts as a one-way, disposable mirror. Entries
are logged after the fact (duration + description) — there is no timer.

## Architecture

- `server.js` — Express bound to 127.0.0.1:4321
- `src/db.js` — built-in `node:sqlite` (NOT better-sqlite3; zero native deps),
  migrations via `PRAGMA user_version`, schema: projects / tags / entries /
  entry_tags / settings / sync_state
- `src/routes.js` + `src/reports.js` — JSON API under `/api`
- `src/reminders.js` — in-process 60s scheduler; under-logged-day reminders via
  macOS notifications (osascript)
- `src/sheets-sync.js` — Google Sheets mirror: debounced full-tab rewrite using
  a service account, with startup catch-up, hourly re-mirror, and backoff retry
- `public/` — no-build vanilla-JS SPA (`index.html` is a static skeleton,
  `app.js` renders into it, Chart.js from CDN). No framework, no bundler —
  keep it that way.
- `design/PersonalTimeKeeping-App.dc.html` — the original design mock the UI
  is translated from

## Conventions and invariants

- **Data lives in `data/`** (gitignored): `timekeeping.db` plus
  `service-account.json` (Google credentials). Never commit it. `npm run seed`
  wipes entries and projects — it is for development against a throwaway
  database only.
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
  interaction while keyboard paths kept passing.
