// Seeds ~8 weeks of plausible entries for testing. Wipes existing entries/projects first.
const { db, syncEntryTags, markDirty } = require('../src/db');

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
}
const TODAY = iso(new Date());

let s = 987654;
const R = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

db.exec('DELETE FROM entry_tags; DELETE FROM entries; DELETE FROM projects;');
const addProject = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)');
const pa = Number(addProject.run('Client A', '#bf5b34').lastInsertRowid);
const pb = Number(addProject.run('Client B', '#c9922e').lastInsertRowid);

const TEMPLATES = [
  { p: pa, d: 'refactor the billing table #frontend' },
  { p: pa, d: 'code review + PR feedback #frontend' },
  { p: pa, d: 'debugging the sync webhook #backend' },
  { p: pa, d: 'infra migration notes #backend' },
  { p: pb, d: 'wire up webhook retries #api' },
  { p: pb, d: 'sprint planning #people-management' },
  { p: pb, d: 'client sync call #people-management #meetings' },
  { p: null, d: '1:1 with Sam #people-management' },
  { p: null, d: 'reading up on async #learning #rust' },
  { p: null, d: 'exploring vector DBs #exploration #learning' },
  { p: null, d: 'team retro #people-management #meetings' },
  { p: null, d: 'interview + debrief #people-management #hiring' },
];

const insert = db.prepare('INSERT INTO entries (entry_date, minutes, project_id, description) VALUES (?, ?, ?, ?)');
function add(date, minutes, projectId, description) {
  const id = Number(insert.run(date, minutes, projectId, description).lastInsertRowid);
  syncEntryTags(id, description);
}

let count = 0;
for (let back = 0; back < 56; back++) {
  const date = addDays(TODAY, -back);
  const dow = new Date(date + 'T00:00:00').getDay();
  if (back === 0) {
    add(date, 120, pa, 'refactor the billing table #frontend');
    add(date, 90, pb, 'wire up webhook retries #api');
    add(date, 60, null, '1:1 with Sam #people-management');
    add(date, 60, null, 'reading up on async #learning #rust');
    count += 4;
    continue;
  }
  if (dow === 0 || dow === 6) {
    if (R() > 0.72) {
      add(date, [60, 90][Math.floor(R() * 2)], null,
        ['reading up on async #learning #rust', 'weekend side spike #exploration'][Math.floor(R() * 2)]);
      count++;
    }
    continue;
  }
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const t = TEMPLATES[Math.floor(R() * TEMPLATES.length)];
    add(date, [30, 45, 60, 90, 120][Math.floor(R() * 5)], t.p, t.d);
    count++;
  }
}
markDirty();
console.log(`Seeded ${count} entries across 56 days (today = ${TODAY}).`);
