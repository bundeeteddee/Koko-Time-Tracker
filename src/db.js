const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'timekeeping.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Warm palette from the design; new projects cycle through it.
const PROJECT_PALETTE = ['#bf5b34', '#c9922e', '#7d8c4a', '#a86b8a', '#6a7ba8', '#9c6b4a', '#c77d52', '#b0895a'];

const MIGRATIONS = [
  function v1() {
    db.exec(`
      CREATE TABLE projects (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color      TEXT NOT NULL,
        archived   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE tags (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        archived   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE entries (
        id          INTEGER PRIMARY KEY,
        entry_date  TEXT NOT NULL,
        minutes     INTEGER NOT NULL CHECK (minutes > 0),
        project_id  INTEGER REFERENCES projects(id),
        description TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_entries_date    ON entries(entry_date);
      CREATE INDEX idx_entries_project ON entries(project_id);
      CREATE TABLE entry_tags (
        entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        tag_id   INTEGER NOT NULL REFERENCES tags(id),
        PRIMARY KEY (entry_id, tag_id)
      );
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE sync_state (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        dirty           INTEGER NOT NULL DEFAULT 1,
        last_success_at TEXT,
        last_error      TEXT
      );
      INSERT INTO sync_state (id, dirty) VALUES (1, 1);
    `);
    const seedSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries({
      daily_target_minutes: '480',
      workdays: '1,2,3,4,5',
      reminders_enabled: '1',
      reminder_midday: '12:30',
      reminder_eod: '17:30',
      reminder_last_fired: '',
      sheet_id: '',
      sheet_tab: 'Entries',
    })) seedSetting.run(k, v);
    const seedTag = db.prepare('INSERT INTO tags (name) VALUES (?)');
    for (const t of ['people-management', 'learning', 'exploration', 'meetings', 'coding']) seedTag.run(t);
  },
];

function migrate() {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = version; i < MIGRATIONS.length; i++) {
    MIGRATIONS[i]();
    db.exec(`PRAGMA user_version = ${i + 1}`);
  }
}
migrate();

// ---------- tags ----------

const TAG_RE = /#([a-z0-9][a-z0-9-]*)/gi;

function tagsIn(description) {
  const out = new Set();
  for (const m of (description || '').matchAll(TAG_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

function ensureTag(name) {
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
  if (existing) return existing.id;
  return Number(db.prepare('INSERT INTO tags (name) VALUES (?)').run(name).lastInsertRowid);
}

function syncEntryTags(entryId, description) {
  db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(entryId);
  const link = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
  for (const name of tagsIn(description)) link.run(entryId, ensureTag(name));
}

// ---------- settings ----------

function getSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

// ---------- sync bookkeeping ----------

let onDirty = null; // set by sheets-sync to schedule a debounced push
function markDirty() {
  db.prepare('UPDATE sync_state SET dirty = 1 WHERE id = 1').run();
  if (onDirty) onDirty();
}

function nextProjectColor() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  return PROJECT_PALETTE[count % PROJECT_PALETTE.length];
}

module.exports = {
  db,
  tagsIn,
  syncEntryTags,
  getSettings,
  setSetting,
  markDirty,
  setOnDirty: (fn) => { onDirty = fn; },
  nextProjectColor,
  PROJECT_PALETTE,
};
