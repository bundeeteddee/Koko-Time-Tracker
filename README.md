# TimeKeeping

Personal, Noko-like after-the-fact time tracker. Local web app at
[http://localhost:4321](http://localhost:4321) — SQLite is the source of truth,
with an optional Google Sheets mirror as a live remote backup.

- Log entries retrospectively: duration (`2h`, `90m`, `1h30`) + description with inline `#tags`
- Entries optionally belong to a **project**; `#tags` categorize the work (multiple per entry)
- Views: Today (quick log), Week, Reports (project/tag breakdowns, weekly trend, untracked time), Settings
- macOS reminders at midday and end of day when the day looks under-logged

## Run

```bash
npm install
npm start          # http://localhost:4321
npm run seed       # optional: wipe data and load 8 weeks of fake entries
```

## Always-on (launchd)

```bash
bash scripts/install-launchd.sh    # starts now + at every login, restarts on crash
bash scripts/uninstall-launchd.sh  # removes it
```

Logs go to `~/Library/Logs/TimeKeeping/` (not `logs/` in the project — launchd
cannot write inside `~/Documents`, which is TCC-protected).

**Notifications**: the first reminder triggers a macOS prompt to allow
notifications (attributed to Script Editor/osascript). Allow it in
System Settings → Notifications if you miss the prompt. Test with:

```bash
curl -X POST localhost:4321/api/dev/notify
```

## Google Sheets mirror (one-time setup)

The mirror is a one-way full rewrite (SQLite → sheet), so sheet edits are
overwritten and deletions just work. It syncs 60s after any change, on
startup, and hourly; failures retry with backoff — the app never blocks on it.

1. Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com) (free).
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Any name; no roles needed. Then open it → **Keys → Add key → JSON**.
4. Save the downloaded file as `data/service-account.json`, then `chmod 600 data/service-account.json`.
5. Create a Google Sheet. Share it (Editor) with the service-account email —
   shown in Settings → Google Sheets backup once the JSON is in place.
6. Copy the sheet's ID (the long string in its URL) into Settings → Sheet ID,
   and hit **Sync now**.

## Data

- `data/timekeeping.db` — SQLite (WAL). Everything lives here; the sheet is disposable.
- Reseeding (`npm run seed`) **wipes entries and projects** — don't run it once you have real data.
- Start fresh (drop the demo data): stop the server, delete `data/timekeeping.db*`,
  start again — you get an empty database with the starter tags, then add your real
  projects in Settings.
