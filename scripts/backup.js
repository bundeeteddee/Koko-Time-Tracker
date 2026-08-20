// Writes a consistent, single-file snapshot of the SQLite database into a
// destination folder — typically a Google Drive folder, so the snapshot rides
// along to the cloud.
//
// Why a snapshot instead of syncing data/ directly: the database runs in WAL
// mode, so it is really three files (timekeeping.db, -wal, -shm) that only mean
// anything together. A sync client uploads them as independent objects at
// independent moments, which can pair a .db from one instant with a -wal from
// another — that restores as a corrupt database, not a stale one. VACUUM INTO
// produces one self-contained file with no sidecars, and is safe to run while
// the app is running.
//
// Usage:  node scripts/backup.js [destination-dir]
//         TIMEKEEPING_BACKUP_DIR=<dir> node scripts/backup.js
//         TIMEKEEPING_BACKUP_KEEP=<n>  (how many dated snapshots to keep, default 14)
//
// To restore: stop the app (launchctl bootout gui/$UID/com.timekeeping.app),
// DELETE data/timekeeping.db-wal and data/timekeeping.db-shm, then copy the
// snapshot to data/timekeeping.db. Leaving the old sidecars in place next to a
// restored database is its own way to corrupt it.

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const SOURCE = path.join(__dirname, '..', 'data', 'timekeeping.db');
const PREFIX = 'timekeeping-';
const KEEP = Number(process.env.TIMEKEEPING_BACKUP_KEEP || 14);

const dest = process.argv[2] || process.env.TIMEKEEPING_BACKUP_DIR;
if (!dest) {
  console.error('No destination. Pass a folder, or set TIMEKEEPING_BACKUP_DIR.');
  console.error('e.g. node scripts/backup.js ~/"Google Drive/My Drive/TimeKeeping Backups"');
  process.exit(1);
}
if (!fs.existsSync(SOURCE)) {
  console.error(`No database at ${SOURCE}`);
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });

function stamp(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const finalPath = path.join(dest, `${PREFIX}${stamp(new Date())}.db`);
const tmpPath = `${finalPath}.tmp-${process.pid}`;
fs.rmSync(tmpPath, { force: true }); // VACUUM INTO refuses an existing destination

let entries;
try {
  const source = new DatabaseSync(SOURCE, { readOnly: true });
  source.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
  source.close();

  // Read the snapshot back before it replaces yesterday's — a backup nobody
  // opens is a backup nobody knows is broken.
  const snapshot = new DatabaseSync(tmpPath, { readOnly: true });
  const check = snapshot.prepare('PRAGMA integrity_check').get().integrity_check;
  if (check !== 'ok') throw new Error(`integrity_check said: ${check}`);
  entries = snapshot.prepare('SELECT COUNT(*) AS c FROM entries').get().c;
  snapshot.close();
  fs.rmSync(`${tmpPath}-wal`, { force: true });
  fs.rmSync(`${tmpPath}-shm`, { force: true });

  fs.renameSync(tmpPath, finalPath);
} catch (err) {
  for (const f of [tmpPath, `${tmpPath}-wal`, `${tmpPath}-shm`]) fs.rmSync(f, { force: true });
  console.error(`${new Date().toISOString()} backup failed: ${err.message}`);
  process.exit(1);
}

const kb = Math.round(fs.statSync(finalPath).size / 1024);
console.log(`${new Date().toISOString()} wrote ${finalPath} (${entries} entries, ${kb} KB)`);

// Prune old snapshots — only files this script itself wrote.
const dated = fs.readdirSync(dest)
  .filter((f) => /^timekeeping-\d{4}-\d{2}-\d{2}\.db$/.test(f))
  .sort();
for (const old of dated.slice(0, Math.max(0, dated.length - KEEP))) {
  fs.rmSync(path.join(dest, old), { force: true });
  console.log(`  pruned ${old}`);
}
