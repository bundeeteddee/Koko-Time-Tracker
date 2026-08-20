// Seeds ~14 weeks of plausible entries for a demo/playground database.
// Wipes existing entries, projects and tags first — never run it against real data.
const { db, syncEntryTags, markDirty } = require('../src/db');

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); }
const TODAY = iso(new Date());

let s = 20260820;
const R = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(R() * a.length)];

db.exec('DELETE FROM entry_tags; DELETE FROM entries; DELETE FROM tags; DELETE FROM projects;');
const addProject = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)');
const ACME = Number(addProject.run('Acme Bank', '#bf5b34').lastInsertRowid);
const LUMEN = Number(addProject.run('Lumen Health', '#c9922e').lastInsertRowid);
const HOMELAB = Number(addProject.run('Home Lab', '#7d8c4a').lastInsertRowid);
const WOOD = Number(addProject.run('Woodworking', '#a86b8a').lastInsertRowid);

const WORK = [
  { p: ACME, w: 9, d: [
    'writing test cases for the payment retry flow #tests',
    'code review on the ledger service PR #review',
    'debugging duplicate settlement webhooks #backend',
    'pairing with Brian on the statement export #backend',
    'sprint planning with the payments squad #planning #meetings',
    'API contract review with the mobile team #meetings',
    'flaky test triage in the settlement suite #tests',
    'writing up the retry design doc #docs',
  ] },
  { p: LUMEN, w: 8, d: [
    'investigating why FHIR bundle imports time out #research',
    'patient search relevance tuning #backend',
    'accessibility pass on the intake form #frontend',
    'integration tests for the appointment scheduler #tests',
    'roadmap review with the client #meetings',
    'profiling the import worker #research #backend',
    'onboarding docs for the new integration #docs',
  ] },
  { p: HOMELAB, w: 2, d: [
    'rebuilding the NAS on ZFS #homelab',
    'local DNS + ad blocking #homelab',
    'swapping the failing drive + resilver #homelab',
    'automating offsite backups #homelab',
    'reading up on Rust async #learning',
  ] },
  { p: WOOD, w: 2, d: [
    'shaping the walnut shelf brackets #woodworking',
    'cutting dovetails for the drawer #woodworking',
    'glue-up and clamping the shelf #woodworking',
    'finishing coat on the bookcase #woodworking',
    'sharpening chisels + shop tidy #woodworking',
  ] },
  { p: null, w: 9, d: [
    '1:1 with Brian #1on1',
    '1:1 with Priya #1on1',
    '1:1 with Marcus #1on1',
    'collecting peer input for Priya’s review #em',
    'writing performance review notes #em',
    'career-ladder draft feedback #em',
    'interview loop + debrief #hiring',
    'hiring sync with recruiting #hiring #meetings',
    'team retro #meetings',
    'reading up on incident review practices #learning',
  ] },
];
const BAG = WORK.flatMap((g) => Array(g.w).fill(g));

const insert = db.prepare('INSERT INTO entries (entry_date, minutes, project_id, description) VALUES (?, ?, ?, ?)');
function add(date, minutes, projectId, description) {
  const id = Number(insert.run(date, minutes, projectId, description).lastInsertRowid);
  syncEntryTags(id, description);
}

let count = 0;
for (let back = 100; back >= 0; back--) {
  const date = addDays(TODAY, -back);
  const dow = new Date(date + 'T00:00:00').getDay();
  if (back === 0) {
    // Today starts part-logged, so the progress bar has somewhere to go.
    add(date, 75, ACME, 'debugging duplicate settlement webhooks #backend');
    add(date, 60, LUMEN, 'accessibility pass on the intake form #frontend');
    count += 2;
    continue;
  }
  if (dow === 0 || dow === 6) {                       // weekends: hobbies, sometimes
    if (R() > 0.55) {
      const g = R() > 0.5 ? WORK[2] : WORK[3];
      add(date, pick([60, 90, 120]), g.p, pick(g.d));
      count++;
    }
    continue;
  }
  const light = R() > 0.85;                            // the odd short day
  let left = 15 * Math.round((light ? 150 + R() * 90 : 420 + R() * 90) / 15);
  const seen = new Set();
  let guard = 0;
  while (left >= 30 && guard++ < 60) {
    const g = pick(BAG);
    const desc = pick(g.d);
    if (seen.has(desc)) continue;                      // one line per thing per day
    seen.add(desc);
    const m = Math.min(left, pick([30, 30, 45, 45, 60, 60, 90, 120]));
    add(date, m, g.p, desc);
    left -= m;
    count++;
  }
}
markDirty();
console.log(`Seeded ${count} entries across 100 days (today = ${TODAY}).`);
