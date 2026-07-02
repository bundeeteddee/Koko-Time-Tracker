const fs = require('node:fs');
const path = require('node:path');
const { google } = require('googleapis');
const { db, getSettings, setOnDirty } = require('./db');

const KEY_PATH = path.join(__dirname, '..', 'data', 'service-account.json');

const DEBOUNCE_MS = 60 * 1000;
const HOURLY_MS = 60 * 60 * 1000;
const BACKOFF_START_MS = 60 * 1000;
const BACKOFF_MAX_MS = 15 * 60 * 1000;

let debounceTimer = null;
let backoffMs = BACKOFF_START_MS;
let syncing = false;

function credentials() {
  try {
    return JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function serviceEmail() {
  return credentials()?.client_email || null;
}

function isConfigured() {
  return !!(credentials() && getSettings().sheet_id);
}

function buildRows() {
  const rows = db.prepare(`
    SELECT e.id, e.entry_date, e.minutes, p.name AS project,
           (SELECT GROUP_CONCAT(t.name, ', ') FROM entry_tags et JOIN tags t ON t.id = et.tag_id
            WHERE et.entry_id = e.id) AS tags,
           e.description, e.updated_at
    FROM entries e LEFT JOIN projects p ON p.id = e.project_id
    ORDER BY e.entry_date, e.id`).all();
  const header = ['id', 'date', 'hours', 'minutes', 'project', 'tags', 'description', 'updated_at'];
  return [header, ...rows.map((r) => [
    r.id, r.entry_date, Math.round(r.minutes / 60 * 100) / 100, r.minutes,
    r.project || '', r.tags || '', r.description, r.updated_at,
  ])];
}

function recordResult(error) {
  if (error) {
    db.prepare('UPDATE sync_state SET last_error = ? WHERE id = 1').run(String(error.message || error));
  } else {
    db.prepare("UPDATE sync_state SET dirty = 0, last_error = NULL, last_success_at = datetime('now') WHERE id = 1").run();
  }
}

// Full rewrite of the mirror tab: the sheet always equals current DB state,
// so edits and deletions need no reconciliation and offline gaps self-heal.
async function syncNow() {
  if (syncing) return { ok: false, error: 'sync already in progress' };
  const creds = credentials();
  const settings = getSettings();
  if (!creds) return { ok: false, error: 'data/service-account.json missing' };
  if (!settings.sheet_id) return { ok: false, error: 'no sheet ID configured in Settings' };

  syncing = true;
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const tab = settings.sheet_tab || 'Entries';
    const spreadsheetId = settings.sheet_id;

    // Ensure the tab exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    if (!meta.data.sheets.some((s) => s.properties.title === tab)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
      });
    }

    const rows = buildRows();
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tab}'` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!J1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[`last synced: ${new Date().toISOString()}`]] },
    });

    recordResult(null);
    backoffMs = BACKOFF_START_MS;
    console.log(`sheets-sync: mirrored ${rows.length - 1} entries`);
    return { ok: true, rows: rows.length - 1 };
  } catch (err) {
    recordResult(err);
    console.error('sheets-sync failed:', err.message);
    scheduleRetry();
    return { ok: false, error: err.message };
  } finally {
    syncing = false;
  }
}

function scheduleRetry() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncIfDirty, backoffMs);
  backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
}

function syncIfDirty() {
  if (!isConfigured()) return;
  const dirty = db.prepare('SELECT dirty FROM sync_state WHERE id = 1').get().dirty;
  if (dirty) syncNow();
}

function start() {
  // Debounced push after any mutation
  setOnDirty(() => {
    if (!isConfigured()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(syncIfDirty, DEBOUNCE_MS);
  });
  // Catch-up on startup, then hourly safety re-mirror
  setTimeout(syncIfDirty, 5 * 1000);
  setInterval(syncIfDirty, HOURLY_MS);
}

module.exports = { start, syncNow, serviceEmail, isConfigured };
