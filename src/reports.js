const express = require('express');
const { db, getSettings } = require('./db');

const router = express.Router();

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function startOfWeek(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return addDays(isoDate, -((d.getDay() + 6) % 7)); // Monday
}
function dow(isoDate) {
  return new Date(isoDate + 'T00:00:00').getDay();
}

function range(req) {
  const from = req.query.from || '0000-01-01';
  const to = req.query.to || '9999-12-31';
  return { from, to };
}

router.get('/summary', (req, res) => {
  const { from, to } = range(req);
  const group = req.query.group || 'project';
  if (group === 'project') {
    return res.json(db.prepare(`
      SELECT p.id AS project_id, COALESCE(p.name, 'No project') AS project, SUM(e.minutes) AS minutes
      FROM entries e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.entry_date BETWEEN ? AND ?
      GROUP BY e.project_id ORDER BY minutes DESC`).all(from, to));
  }
  if (group === 'tag') {
    const tagged = db.prepare(`
      SELECT t.id AS tag_id, t.name AS tag, SUM(e.minutes) AS minutes
      FROM entries e JOIN entry_tags et ON et.entry_id = e.id JOIN tags t ON t.id = et.tag_id
      WHERE e.entry_date BETWEEN ? AND ?
      GROUP BY t.id ORDER BY minutes DESC`).all(from, to);
    const untagged = db.prepare(`
      SELECT COALESCE(SUM(minutes), 0) AS m FROM entries
      WHERE entry_date BETWEEN ? AND ? AND id NOT IN (SELECT entry_id FROM entry_tags)`).get(from, to).m;
    return res.json({ tags: tagged, untagged_minutes: untagged });
  }
  if (group === 'project_tag') {
    return res.json(db.prepare(`
      SELECT COALESCE(p.name, 'No project') AS project, t.name AS tag, SUM(e.minutes) AS minutes
      FROM entries e
      JOIN entry_tags et ON et.entry_id = e.id JOIN tags t ON t.id = et.tag_id
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.entry_date BETWEEN ? AND ?
      GROUP BY e.project_id, t.id ORDER BY project, minutes DESC`).all(from, to));
  }
  res.status(400).json({ error: 'group must be project|tag|project_tag' });
});

router.get('/trends', (req, res) => {
  const count = Math.min(52, Number(req.query.count) || 12);
  const monday = startOfWeek(localToday());
  const sumRange = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM entries WHERE entry_date BETWEEN ? AND ?');
  const weeks = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = addDays(monday, -7 * i);
    weeks.push({ week_start: start, minutes: sumRange.get(start, addDays(start, 6)).m });
  }
  res.json(weeks);
});

router.get('/untracked', (req, res) => {
  const { from, to } = range(req);
  const settings = getSettings();
  const target = Number(settings.daily_target_minutes);
  const workdays = new Set(settings.workdays.split(',').filter(Boolean).map(Number));
  const today = localToday();
  const byDay = {};
  for (const row of db.prepare(
    'SELECT entry_date, SUM(minutes) AS m FROM entries WHERE entry_date BETWEEN ? AND ? GROUP BY entry_date').all(from, to)) {
    byDay[row.entry_date] = row.m;
  }
  const rows = [];
  let totalShortfall = 0;
  let cur = from, guard = 0;
  while (cur <= to && cur <= today && guard++ < 400) {
    if (workdays.has(dow(cur))) {
      const logged = byDay[cur] || 0;
      if (logged < target) {
        rows.push({ date: cur, logged_minutes: logged, shortfall_minutes: target - logged });
        totalShortfall += target - logged;
      }
    }
    cur = addDays(cur, 1);
  }
  res.json({ target_minutes: target, total_shortfall_minutes: totalShortfall, days: rows });
});

module.exports = router;
