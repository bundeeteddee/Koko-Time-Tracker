const express = require('express');
const { db, syncEntryTags, getSettings, setSetting, markDirty, nextProjectColor } = require('./db');

const router = express.Router();

router.use('/reports', require('./reports'));

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function entryRow(row) {
  return {
    id: row.id,
    entry_date: row.entry_date,
    minutes: row.minutes,
    project_id: row.project_id,
    project_name: row.project_name,
    project_color: row.project_color,
    description: row.description,
    updated_at: row.updated_at,
  };
}

const ENTRY_SELECT = `
  SELECT e.*, p.name AS project_name, p.color AS project_color
  FROM entries e LEFT JOIN projects p ON p.id = e.project_id`;

// ---------- entries ----------

router.get('/entries', (req, res) => {
  const cond = [], params = [];
  if (req.query.from) { cond.push('e.entry_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { cond.push('e.entry_date <= ?'); params.push(req.query.to); }
  if (req.query.project_id) { cond.push('e.project_id = ?'); params.push(Number(req.query.project_id)); }
  if (req.query.tag_id) {
    cond.push('e.id IN (SELECT entry_id FROM entry_tags WHERE tag_id = ?)');
    params.push(Number(req.query.tag_id));
  }
  const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
  const rows = db.prepare(ENTRY_SELECT + where + ' ORDER BY e.entry_date DESC, e.id DESC').all(...params);
  res.json(rows.map(entryRow));
});

function validateEntry(body) {
  const minutes = Math.round(Number(body.minutes));
  if (!Number.isFinite(minutes) || minutes <= 0) return { error: 'minutes must be a positive number' };
  if (!DATE_RE.test(body.entry_date || '')) return { error: 'entry_date must be YYYY-MM-DD' };
  let projectId = null;
  if (body.project_id !== null && body.project_id !== undefined && body.project_id !== '') {
    projectId = Number(body.project_id);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) return { error: 'unknown project_id' };
  }
  return { minutes, entryDate: body.entry_date, projectId, description: String(body.description || '').trim() };
}

router.post('/entries', (req, res) => {
  const v = validateEntry(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const info = db.prepare('INSERT INTO entries (entry_date, minutes, project_id, description) VALUES (?, ?, ?, ?)')
    .run(v.entryDate, v.minutes, v.projectId, v.description);
  const id = Number(info.lastInsertRowid);
  syncEntryTags(id, v.description);
  markDirty();
  res.status(201).json(entryRow(db.prepare(ENTRY_SELECT + ' WHERE e.id = ?').get(id)));
});

router.put('/entries/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM entries WHERE id = ?').get(id)) return res.status(404).json({ error: 'not found' });
  const v = validateEntry(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  db.prepare("UPDATE entries SET entry_date = ?, minutes = ?, project_id = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
    .run(v.entryDate, v.minutes, v.projectId, v.description, id);
  syncEntryTags(id, v.description);
  markDirty();
  res.json(entryRow(db.prepare(ENTRY_SELECT + ' WHERE e.id = ?').get(id)));
});

router.delete('/entries/:id', (req, res) => {
  const info = db.prepare('DELETE FROM entries WHERE id = ?').run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  markDirty();
  res.json({ ok: true });
});

// ---------- projects ----------

router.get('/projects', (req, res) => {
  const where = req.query.include_archived ? '' : ' WHERE archived = 0';
  res.json(db.prepare(`
    SELECT p.*, (SELECT MAX(entry_date) FROM entries WHERE project_id = p.id) AS last_used
    FROM projects p${where} ORDER BY last_used DESC NULLS LAST, p.name`).all());
});

router.post('/projects', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  if (db.prepare('SELECT id FROM projects WHERE name = ?').get(name)) return res.status(409).json({ error: 'project already exists' });
  const info = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)').run(name, nextProjectColor());
  markDirty();
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(info.lastInsertRowid)));
});

router.put('/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!proj) return res.status(404).json({ error: 'not found' });
  const name = req.body.name !== undefined ? String(req.body.name).trim() : proj.name;
  if (!name) return res.status(400).json({ error: 'name required' });
  const clash = db.prepare('SELECT id FROM projects WHERE name = ? AND id != ?').get(name, id);
  if (clash) return res.status(409).json({ error: 'project already exists' });
  const archived = req.body.archived !== undefined ? (req.body.archived ? 1 : 0) : proj.archived;
  db.prepare('UPDATE projects SET name = ?, archived = ? WHERE id = ?').run(name, archived, id);
  markDirty();
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

// ---------- tags ----------

const TAG_LIST_SQL = `
  SELECT t.*, COUNT(et.entry_id) AS uses, MAX(e.entry_date) AS last_used
  FROM tags t
  LEFT JOIN entry_tags et ON et.tag_id = t.id
  LEFT JOIN entries e ON e.id = et.entry_id
  GROUP BY t.id
  ORDER BY uses DESC, last_used DESC NULLS LAST, t.name`;

router.get('/tags', (req, res) => res.json(db.prepare(TAG_LIST_SQL).all()));

function normalizeTagName(raw) {
  return String(raw || '').trim().replace(/^#/, '').toLowerCase();
}

function rewriteTagInDescriptions(fromName, toName) {
  const re = `#${fromName}`;
  const rows = db.prepare(
    "SELECT id, description FROM entries WHERE ' ' || lower(description) || ' ' LIKE '%' || ? || '%'").all(re);
  const update = db.prepare("UPDATE entries SET description = ?, updated_at = datetime('now') WHERE id = ?");
  const wordRe = new RegExp('#' + fromName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '(?![a-z0-9-])', 'gi');
  for (const row of rows) {
    const next = row.description.replace(wordRe, '#' + toName);
    if (next !== row.description) update.run(next, row.id);
  }
}

router.put('/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  if (!tag) return res.status(404).json({ error: 'not found' });
  const archived = req.body.archived !== undefined ? (req.body.archived ? 1 : 0) : tag.archived;
  let name = tag.name;
  if (req.body.name !== undefined) {
    name = normalizeTagName(req.body.name);
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) return res.status(400).json({ error: 'invalid tag name' });
    const clash = db.prepare('SELECT id FROM tags WHERE name = ? AND id != ?').get(name, id);
    if (clash) return res.status(409).json({ error: 'tag already exists — use merge instead' });
  }
  if (name !== tag.name) rewriteTagInDescriptions(tag.name, name);
  db.prepare('UPDATE tags SET name = ?, archived = ? WHERE id = ?').run(name, archived, id);
  markDirty();
  res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
});

router.post('/tags/:id/merge-into/:targetId', (req, res) => {
  const id = Number(req.params.id), targetId = Number(req.params.targetId);
  const source = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  const target = db.prepare('SELECT * FROM tags WHERE id = ?').get(targetId);
  if (!source || !target || id === targetId) return res.status(400).json({ error: 'invalid merge' });
  db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) SELECT entry_id, ? FROM entry_tags WHERE tag_id = ?')
    .run(targetId, id);
  db.prepare('DELETE FROM entry_tags WHERE tag_id = ?').run(id);
  rewriteTagInDescriptions(source.name, target.name);
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  markDirty();
  res.json({ ok: true, merged_into: target.name });
});

// ---------- status ----------

router.get('/status', (req, res) => {
  const today = localToday();
  const settings = getSettings();
  const todayMinutes = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM entries WHERE entry_date = ?').get(today).m;
  const sync = db.prepare('SELECT * FROM sync_state WHERE id = 1').get();
  res.json({
    today,
    today_minutes: todayMinutes,
    target_minutes: Number(settings.daily_target_minutes),
    workdays: settings.workdays.split(',').filter(Boolean).map(Number),
    projects: db.prepare(`
      SELECT p.*, (SELECT MAX(entry_date) FROM entries WHERE project_id = p.id) AS last_used
      FROM projects p WHERE archived = 0 ORDER BY last_used DESC NULLS LAST, p.name`).all(),
    tags: db.prepare(TAG_LIST_SQL).all().filter((t) => !t.archived),
    settings: {
      reminders_enabled: settings.reminders_enabled === '1',
      reminder_midday: settings.reminder_midday,
      reminder_eod: settings.reminder_eod,
      sheet_id: settings.sheet_id,
    },
    sync: {
      dirty: !!sync.dirty,
      last_success_at: sync.last_success_at,
      last_error: sync.last_error,
      service_email: require('./sheets-sync').serviceEmail(),
    },
  });
});

// ---------- settings ----------

const SETTABLE = new Set(['daily_target_minutes', 'workdays', 'reminders_enabled', 'reminder_midday', 'reminder_eod', 'sheet_id', 'sheet_tab']);

router.get('/settings', (req, res) => res.json(getSettings()));

router.put('/settings', (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!SETTABLE.has(k)) return res.status(400).json({ error: `unknown setting: ${k}` });
    setSetting(k, v);
  }
  res.json(getSettings());
});

// ---------- sync ----------

router.post('/sync/now', async (req, res) => {
  const result = await require('./sheets-sync').syncNow();
  res.status(result.ok ? 200 : 400).json(result);
});

// ---------- dev ----------

router.post('/dev/notify', (req, res) => {
  require('./reminders').notify(req.body?.message || 'Test notification from TimeKeeping.');
  res.json({ ok: true });
});

module.exports = router;
