/* TimeKeeping SPA — translated from the Claude Design mock (PersonalTimeKeeping App.dc.html). */

const WARM = ['#bf5b34', '#c9922e', '#7d8c4a', '#a86b8a', '#6a7ba8', '#9c6b4a', '#c77d52', '#b0895a'];

const S = {
  view: 'today',
  status: null,          // /api/status payload
  formDate: null,
  formProject: undefined, // undefined = not initialized yet; null = "No project"
  dayEntries: [],
  acOpen: false,
  acIndex: 0,
  editingId: null,
  weekAnchor: null,
  weekEntries: [],
  reportRange: 'this-week',
  customStart: '',
  customEnd: '',
  allProjects: [],
  allTags: [],
  settingsMap: {},
  editingProject: null,
  editingTag: null,
  mergeOpen: null,
  charts: {},
};

// ---------- utils (ported from the mock) ----------

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const todayISO = () => iso(new Date());
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); }
function dow(isoDate) { return new Date(isoDate + 'T00:00:00').getDay(); }
function startOfWeek(isoDate) { return addDays(isoDate, -((dow(isoDate) + 6) % 7)); }
function fmtDate(isoDate, opts) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
}

function parseDur(s) {
  s = (s || '').trim().toLowerCase();
  if (!s) return 0;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return (+m[1]) * 60 + (+m[2]);
  if ((m = s.match(/^(\d+)h(\d{1,2})$/))) return (+m[1]) * 60 + (+m[2]);
  if ((m = s.match(/^(\d*\.\d+)\s*h?$/))) return Math.round(parseFloat(m[1]) * 60);
  let mins = 0, ok = false;
  const re = /(\d+)\s*(h|m)/g;
  let r;
  while ((r = re.exec(s))) { ok = true; mins += r[2] === 'h' ? (+r[1]) * 60 : (+r[1]); }
  if (ok) return mins;
  if ((m = s.match(/^(\d+)$/))) return +m[1];
  return 0;
}
function fmtDur(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return h + 'h' + String(m).padStart(2, '0');
  if (h) return h + 'h';
  return m + 'm';
}
function fmtH(mins) { return (Math.round(mins / 60 * 10) / 10) + 'h'; }

const TAG_RE = /#[a-z0-9][a-z0-9-]*/gi;
function tagsIn(desc) {
  const out = [];
  for (const m of (desc || '').matchAll(TAG_RE)) out.push(m[0].slice(1).toLowerCase());
  return out;
}
function segmentize(desc) {
  const parts = [];
  let last = 0;
  for (const m of (desc || '').matchAll(TAG_RE)) {
    if (m.index > last) parts.push({ text: desc.slice(last, m.index), tag: false });
    parts.push({ text: m[0], tag: true });
    last = m.index + m[0].length;
  }
  if (last < (desc || '').length) parts.push({ text: desc.slice(last), tag: false });
  if (!parts.length) parts.push({ text: desc || '', tag: false });
  return parts;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function segmentsHTML(desc) {
  return segmentize(desc).map((seg) =>
    seg.tag ? `<span class="tag-pill">${esc(seg.text)}</span>` : esc(seg.text)).join('');
}

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ---------- data loading ----------

async function loadStatus() { S.status = await api('/status'); }
async function loadDay() {
  S.dayEntries = await api(`/entries?from=${S.formDate}&to=${S.formDate}`);
}
async function loadWeek() {
  const start = startOfWeek(S.weekAnchor);
  S.weekEntries = await api(`/entries?from=${start}&to=${addDays(start, 6)}`);
}
async function loadSettingsData() {
  [S.allProjects, S.allTags, S.settingsMap] = await Promise.all([
    api('/projects?include_archived=1'), api('/tags'), api('/settings'),
  ]);
}

// ---------- tabs ----------

const TABS = [['today', 'Today'], ['week', 'Week'], ['reports', 'Reports'], ['settings', 'Settings']];

function renderTabs() {
  $('tabs').innerHTML = TABS.map(([k, label]) =>
    `<span class="tab${S.view === k ? ' active' : ''}" data-tab="${k}">${label}</span>`).join('');
  for (const el of document.querySelectorAll('#tabs .tab')) {
    el.onclick = () => switchView(el.dataset.tab);
  }
  for (const [k] of TABS) $('view-' + k).hidden = S.view !== k;
}

async function switchView(view) {
  S.view = view;
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  renderTabs();
  if (view === 'today') { await Promise.all([loadStatus(), loadDay()]); renderToday(); }
  if (view === 'week') { S.weekAnchor = S.weekAnchor || S.status.today; await loadWeek(); renderWeek(); }
  if (view === 'reports') { await refreshReports(); }
  if (view === 'settings') { await Promise.all([loadSettingsData(), loadStatus()]); renderSettings(); }
}

// ---------- TODAY ----------

function projChipsHTML(selId, extraClass) {
  const chips = S.status.projects.map((p) => {
    const sel = selId === p.id;
    return `<span class="chip${sel ? ' sel' : ''} ${extraClass}" data-proj="${p.id}"
      style="${sel ? `background:${p.color}` : ''}">
      <span class="dot" style="background:${sel ? 'rgba(255,255,255,.85)' : p.color}"></span>${esc(p.name)}</span>`;
  });
  const selNone = selId === null;
  chips.push(`<span class="chip${selNone ? ' sel' : ''} ${extraClass}" data-proj="none"
    style="${selNone ? 'background:#8a8272' : ''}">
    <span class="dot" style="background:${selNone ? 'rgba(255,255,255,.85)' : '#b8ab95'}"></span>No project</span>`);
  return chips.join('');
}

function renderToday() {
  const fd = S.formDate;
  const st = S.status;
  if (S.formProject === undefined) S.formProject = st.projects.length ? st.projects[0].id : null;

  $('date-label').textContent =
    (fd === st.today ? 'Today' : fmtDate(fd, { weekday: 'long' })) + ' · ' + fmtDate(fd, { month: 'short', day: 'numeric' });

  const logged = S.dayEntries.reduce((a, e) => a + e.minutes, 0);
  const isTargetDay = st.workdays.includes(dow(fd));
  $('prog-logged').textContent = fmtH(logged);
  $('prog-target').textContent = isTargetDay ? '/ ' + fmtH(st.target_minutes) : 'logged';
  $('prog-remain').textContent = !isTargetDay ? 'no target today'
    : (logged >= st.target_minutes ? 'target reached' : fmtH(st.target_minutes - logged) + ' to target');
  $('prog-fill').style.width = (isTargetDay ? Math.min(100, logged / st.target_minutes * 100) : (logged > 0 ? 100 : 0)) + '%';

  $('proj-chips').innerHTML = projChipsHTML(S.formProject, 'form-proj');
  for (const el of document.querySelectorAll('.form-proj')) {
    el.onclick = () => { S.formProject = el.dataset.proj === 'none' ? null : Number(el.dataset.proj); renderToday(); };
  }

  $('recent-tags').innerHTML = st.tags.slice(0, 5).map((t) =>
    `<span class="tag-chip" data-tag="${esc(t.name)}">#${esc(t.name)}</span>`).join('');
  for (const el of document.querySelectorAll('#recent-tags .tag-chip')) {
    el.onclick = () => {
      const input = $('f-desc');
      const d = input.value;
      input.value = (d && !d.endsWith(' ') ? d + ' ' : d) + '#' + el.dataset.tag + ' ';
      input.focus();
      renderAc();
    };
  }

  $('list-title').textContent = fd === st.today ? 'Today' : fmtDate(fd, { weekday: 'long', month: 'short', day: 'numeric' });
  $('list-meta').textContent = `${S.dayEntries.length} ${S.dayEntries.length === 1 ? 'entry' : 'entries'} · ${fmtH(logged)}`;
  renderEntries();
}

function renderEntries() {
  const box = $('entries');
  if (!S.dayEntries.length) {
    box.innerHTML = '<div class="empty-state">Nothing logged yet. Add your first entry above.</div>';
    return;
  }
  box.innerHTML = S.dayEntries.map((e) => {
    if (S.editingId === e.id) {
      return `<div class="entry-row" data-id="${e.id}">
        <div class="entry-edit">
          <div class="row">
            <input class="tk-input dur-input" id="edit-dur" value="${esc(fmtDur(e.minutes))}">
            <div class="chips" id="edit-chips">${projChipsHTML(S.editProject, 'edit-proj')}</div>
          </div>
          <input class="tk-input desc-input" id="edit-desc" value="${esc(e.description)}">
          <div class="row">
            <span class="btn-dark sm tk-chip" id="edit-save">Save</span>
            <span class="btn-light tk-chip" id="edit-cancel">Cancel</span>
          </div>
        </div>
      </div>`;
    }
    const proj = e.project_id ? `<span class="entry-proj"><span class="dot" style="background:${e.project_color}"></span>${esc(e.project_name)} ·</span>` : '';
    return `<div class="entry-row" data-id="${e.id}">
      <div class="entry-view">
        <span class="entry-dur">${fmtDur(e.minutes)}</span>
        <div class="entry-body">${proj}${segmentsHTML(e.description)}</div>
        <span class="entry-acts"><span data-act="edit">✎</span><span data-act="delete">✕</span></span>
      </div>
    </div>`;
  }).join('');

  for (const el of box.querySelectorAll('[data-act]')) {
    const id = Number(el.closest('.entry-row').dataset.id);
    const entry = S.dayEntries.find((x) => x.id === id);
    el.onclick = async () => {
      if (el.dataset.act === 'edit') {
        S.editingId = id;
        S.editProject = entry.project_id ?? null;
        renderEntries();
      } else {
        await api('/entries/' + id, { method: 'DELETE' });
        await Promise.all([loadStatus(), loadDay()]);
        renderToday();
      }
    };
  }
  if (S.editingId !== null) {
    for (const el of box.querySelectorAll('.edit-proj')) {
      el.onclick = () => {
        S.editProject = el.dataset.proj === 'none' ? null : Number(el.dataset.proj);
        $('edit-chips').innerHTML = projChipsHTML(S.editProject, 'edit-proj');
        for (const el2 of box.querySelectorAll('.edit-proj')) el2.onclick = el.onclick;
      };
    }
    $('edit-cancel').onclick = () => { S.editingId = null; renderEntries(); };
    $('edit-save').onclick = async () => {
      const minutes = parseDur($('edit-dur').value);
      if (minutes <= 0) return;
      await api('/entries/' + S.editingId, {
        method: 'PUT',
        body: { entry_date: S.formDate, minutes, project_id: S.editProject, description: $('edit-desc').value.trim() },
      });
      S.editingId = null;
      await Promise.all([loadStatus(), loadDay()]);
      renderToday();
    };
  }
}

// ---------- autocomplete ----------

function acData() {
  const m = $('f-desc').value.match(/#([a-z0-9-]*)$/i);
  if (!m) return { active: false, query: '', items: [], showCreate: false };
  const q = m[1].toLowerCase();
  const items = S.status.tags.filter((t) => t.name.includes(q)).slice(0, 5);
  const exact = S.status.tags.some((t) => t.name === q);
  return { active: true, query: q, items, showCreate: q.length > 0 && !exact };
}

function renderAc() {
  const box = $('ac');
  const ad = acData();
  const open = S.acOpen && ad.active && (ad.items.length > 0 || ad.showCreate);
  box.hidden = !open;
  if (!open) return;
  const total = ad.items.length + (ad.showCreate ? 1 : 0);
  if (S.acIndex >= total) S.acIndex = 0;
  box.innerHTML = ad.items.map((t, i) =>
    `<div class="ac-item${S.acIndex === i ? ' hl' : ''}" data-i="${i}">
      <span>#${esc(t.name)}</span><span class="uses">${t.uses} ${t.uses === 1 ? 'use' : 'uses'}</span>
    </div>`).join('') +
    (ad.showCreate
      ? `<div class="ac-create${S.acIndex === ad.items.length ? ' hl' : ''}" data-i="${ad.items.length}">
          <span class="plus">+</span>Create new tag <b>#${esc(ad.query)}</b></div>`
      : '');
}

// Highlight moves without rebuilding the dropdown: a rebuild under the cursor
// destroys the node mid-click and the selection never lands.
function updateAcHighlight() {
  for (const el of $('ac').querySelectorAll('[data-i]')) {
    el.classList.toggle('hl', Number(el.dataset.i) === S.acIndex);
  }
}

function acceptAc(i) {
  const ad = acData();
  if (!ad.active) return;
  const name = i < ad.items.length ? ad.items[i].name : ad.query;
  const input = $('f-desc');
  input.value = input.value.replace(/#([a-z0-9-]*)$/i, '#' + name + ' ');
  S.acOpen = false;
  S.acIndex = 0;
  renderAc();
  input.focus();
}

async function submitEntry() {
  const minutes = parseDur($('f-duration').value);
  if (minutes <= 0) { $('f-duration').focus(); return; }
  await api('/entries', {
    method: 'POST',
    body: { entry_date: S.formDate, minutes, project_id: S.formProject, description: $('f-desc').value.trim() },
  });
  $('f-duration').value = '';
  $('f-desc').value = '';
  S.acOpen = false;
  renderAc();
  await Promise.all([loadStatus(), loadDay()]);
  renderToday();
  $('f-duration').focus();
}

function wireTodayForm() {
  $('prev-day').onclick = async () => { S.formDate = addDays(S.formDate, -1); S.editingId = null; await loadDay(); renderToday(); };
  $('next-day').onclick = async () => { S.formDate = addDays(S.formDate, 1); S.editingId = null; await loadDay(); renderToday(); };
  $('log-btn').onclick = submitEntry;
  $('f-duration').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitEntry(); } });
  const acBox = $('ac');
  acBox.addEventListener('mousedown', (e) => {
    const item = e.target.closest('[data-i]');
    if (!item) return;
    e.preventDefault(); // keep focus in the input
    acceptAc(Number(item.dataset.i));
  });
  acBox.addEventListener('mouseover', (e) => {
    const item = e.target.closest('[data-i]');
    if (!item) return;
    S.acIndex = Number(item.dataset.i);
    updateAcHighlight();
  });
  const desc = $('f-desc');
  desc.addEventListener('input', () => { S.acOpen = true; S.acIndex = 0; renderAc(); });
  desc.addEventListener('focus', () => { S.acOpen = true; renderAc(); });
  desc.addEventListener('blur', () => setTimeout(() => { S.acOpen = false; renderAc(); }, 120));
  desc.addEventListener('keydown', (e) => {
    const ad = acData();
    const open = S.acOpen && ad.active && (ad.items.length > 0 || ad.showCreate);
    if (open) {
      const total = ad.items.length + (ad.showCreate ? 1 : 0);
      if (e.key === 'ArrowDown') { e.preventDefault(); S.acIndex = (S.acIndex + 1) % total; updateAcHighlight(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); S.acIndex = (S.acIndex - 1 + total) % total; updateAcHighlight(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptAc(S.acIndex); return; }
      if (e.key === 'Escape') { S.acOpen = false; renderAc(); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); submitEntry(); }
  });
}

// ---------- WEEK ----------

function renderWeek() {
  const st = S.status;
  const start = startOfWeek(S.weekAnchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  $('week-label').textContent = fmtDate(start, { month: 'short', day: 'numeric' }) + ' – ' + fmtDate(addDays(start, 6), { month: 'short', day: 'numeric' });
  const weekTotal = S.weekEntries.reduce((a, e) => a + e.minutes, 0);
  $('week-total').textContent = fmtH(weekTotal);

  $('week-days').innerHTML = days.map((ds) => {
    const es = S.weekEntries.filter((e) => e.entry_date === ds);
    const tot = es.reduce((a, e) => a + e.minutes, 0);
    const weekend = dow(ds) === 0 || dow(ds) === 6;
    const isTargetDay = st.workdays.includes(dow(ds));
    const pct = isTargetDay ? Math.min(100, tot / st.target_minutes * 100) : (tot > 0 ? 100 : 0);
    const isToday = ds === st.today;
    const barColor = weekend ? '#b8ab95' : (tot >= st.target_minutes ? '#7d8c4a' : '#bf5b34');
    const summary = es.map((e) => {
      const label = e.project_name || (tagsIn(e.description)[0] ? '#' + tagsIn(e.description)[0] : '—');
      return fmtDur(e.minutes) + ' ' + esc(label);
    }).join(' &nbsp;·&nbsp; ');
    return `<div class="day-row${isToday ? ' today' : ''}" data-date="${ds}">
      <div class="day-col">
        <div class="day-name">${fmtDate(ds, { weekday: 'long' })}</div>
        <div class="day-date">${fmtDate(ds, { month: 'short', day: 'numeric' })}</div>
      </div>
      <div class="day-mid">
        <div class="day-bar"><div class="day-fill" style="width:${pct}%;background:${barColor}"></div></div>
        ${es.length ? `<div class="day-summary">${summary}</div>` : ''}
      </div>
      <div class="day-total" style="color:${tot > 0 ? '#2d2822' : '#c3b7a2'}">${tot > 0 ? fmtH(tot) : '—'}</div>
    </div>`;
  }).join('');

  for (const el of document.querySelectorAll('.day-row')) {
    el.onclick = async () => {
      S.formDate = el.dataset.date;
      S.editingId = null;
      await loadDay();
      switchView('today');
    };
  }
}

function wireWeek() {
  $('prev-week').onclick = async () => { S.weekAnchor = addDays(startOfWeek(S.weekAnchor), -7); await loadWeek(); renderWeek(); };
  $('next-week').onclick = async () => { S.weekAnchor = addDays(startOfWeek(S.weekAnchor), 7); await loadWeek(); renderWeek(); };
}

// ---------- REPORTS ----------

const RANGE_LABELS = {
  'this-week': 'This week', 'last-week': 'Last week', 'this-month': 'This month',
  'last-month': 'Last month', 'last-12-weeks': 'Last 12 weeks', custom: 'Custom',
};

function rangeDates() {
  const T = S.status.today;
  const mon = startOfWeek(T);
  const d = new Date(T + 'T00:00:00');
  switch (S.reportRange) {
    case 'this-week': return { start: mon, end: addDays(mon, 6) };
    case 'last-week': return { start: addDays(mon, -7), end: addDays(mon, -1) };
    case 'this-month': return { start: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    case 'last-month': return { start: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), end: iso(new Date(d.getFullYear(), d.getMonth(), 0)) };
    case 'last-12-weeks': return { start: addDays(mon, -77), end: addDays(mon, 6) };
    case 'custom': return { start: S.customStart || T, end: S.customEnd || T };
    default: return { start: mon, end: addDays(mon, 6) };
  }
}

async function refreshReports() {
  if (!S.status) await loadStatus();
  if (!S.customStart) { S.customStart = addDays(S.status.today, -30); S.customEnd = S.status.today; }
  const { start, end } = rangeDates();
  const [entries, projects, trend, untracked] = await Promise.all([
    api(`/entries?from=${start}&to=${end}`),
    api('/projects?include_archived=1'),
    api('/reports/trends?period=week&count=12'),
    api(`/reports/untracked?from=${start}&to=${end}`),
  ]);
  renderReports({ start, end, entries, projects, trend, untracked });
}

function renderReports({ start, end, entries, projects, trend, untracked }) {
  $('range-chips').innerHTML = Object.entries(RANGE_LABELS).map(([k, label]) =>
    `<span class="range-chip${S.reportRange === k ? ' sel' : ''}" data-range="${k}">${label}</span>`).join('');
  for (const el of document.querySelectorAll('.range-chip')) {
    el.onclick = () => { S.reportRange = el.dataset.range; refreshReports(); };
  }
  $('custom-range').hidden = S.reportRange !== 'custom';
  $('custom-start').value = S.customStart;
  $('custom-end').value = S.customEnd;

  const total = entries.reduce((a, e) => a + e.minutes, 0);
  const dayCount = new Set(entries.map((e) => e.entry_date)).size;
  $('range-summary').innerHTML =
    `Showing <b style="color:#2d2822">${fmtDate(start, { month: 'short', day: 'numeric' })} – ${fmtDate(end, { month: 'short', day: 'numeric' })}</b>` +
    ` · ${fmtH(total)} logged across ${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;

  drawCharts(entries, projects, trend);

  $('unt-total').textContent = fmtH(untracked.total_shortfall_minutes);
  $('unt-rows').innerHTML = untracked.days.length
    ? untracked.days.map((u) =>
      `<div class="unt-row"><span class="d">${fmtDate(u.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <span class="s"><span class="d">${fmtH(u.logged_minutes)} of ${fmtH(untracked.target_minutes)} · </span>${fmtH(u.shortfall_minutes)} short</span></div>`).join('')
    : '<div class="unt-none">Every workday in range hit its target. Nice.</div>';
}

function drawCharts(ents, projects, trend) {
  const C = window.Chart;
  if (!C) { setTimeout(() => drawCharts(ents, projects, trend), 100); return; }
  Object.values(S.charts).forEach((c) => { try { c.destroy(); } catch (e) { /* canvas gone */ } });
  S.charts = {};
  C.defaults.font.family = 'system-ui, sans-serif';
  C.defaults.color = '#8a8272';
  const mk = (id, cfg) => { const el = $(id); if (el) S.charts[id] = new C(el, cfg); };

  // time by project — doughnut
  const pm = {};
  ents.forEach((e) => { const k = e.project_id || 'none'; pm[k] = (pm[k] || 0) + e.minutes; });
  const pl = [], pd = [], pc = [];
  projects.forEach((p) => { if (pm[p.id]) { pl.push(p.name); pd.push(+(pm[p.id] / 60).toFixed(2)); pc.push(p.color); } });
  if (pm.none) { pl.push('No project'); pd.push(+(pm.none / 60).toFixed(2)); pc.push('#b8ab95'); }
  mk('rp-project', {
    type: 'doughnut',
    data: { labels: pl, datasets: [{ data: pd, backgroundColor: pc, borderColor: '#faf6ee', borderWidth: 2 }] },
    options: {
      maintainAspectRatio: false, cutout: '60%', animation: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 12 } } },
        tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + c.parsed + 'h' } },
      },
    },
  });

  // time by tag — horizontal bar
  const tm = {};
  let untagged = 0;
  ents.forEach((e) => {
    const t = [...new Set(tagsIn(e.description))];
    if (!t.length) untagged += e.minutes;
    else t.forEach((n) => { tm[n] = (tm[n] || 0) + e.minutes; });
  });
  const ta = Object.entries(tm).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const tl = ta.map((t) => '#' + t.k), td = ta.map((t) => +(t.v / 60).toFixed(2));
  if (untagged > 0) { tl.push('untagged'); td.push(+(untagged / 60).toFixed(2)); }
  mk('rp-tag', {
    type: 'bar',
    data: { labels: tl, datasets: [{ data: td, backgroundColor: tl.map((l, i) => l === 'untagged' ? '#c7bca6' : WARM[i % WARM.length]), borderRadius: 4 }] },
    options: {
      maintainAspectRatio: false, indexAxis: 'y', animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + c.parsed.x + 'h' } } },
      scales: {
        x: { grid: { color: '#e5dac6' }, ticks: { callback: (v) => v + 'h', font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 12 } } },
      },
    },
  });

  // tags within project — stacked horizontal
  const top = ta.slice(0, 5).map((t) => t.k);
  const usedProjects = projects.filter((p) => pm[p.id]);
  const cats = [...usedProjects.map((p) => p.id), 'none'];
  const clab = [...usedProjects.map((p) => p.name), 'No project'];
  const ds = top.map((tag, i) => ({
    label: '#' + tag,
    backgroundColor: WARM[i % WARM.length],
    borderRadius: 3,
    data: cats.map((cid) => {
      let sum = 0;
      ents.forEach((e) => { if ((e.project_id || 'none') === cid && tagsIn(e.description).includes(tag)) sum += e.minutes; });
      return +(sum / 60).toFixed(2);
    }),
  }));
  mk('rp-tagproj', {
    type: 'bar',
    data: { labels: clab, datasets: ds },
    options: {
      maintainAspectRatio: false, indexAxis: 'y', animation: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, font: { size: 10.5 }, padding: 8 } } },
      scales: {
        x: { stacked: true, grid: { color: '#e5dac6' }, ticks: { callback: (v) => v + 'h', font: { size: 11 } } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12 } } },
      },
    },
  });

  // weekly trend
  mk('rp-trend', {
    type: 'line',
    data: {
      labels: trend.map((w) => fmtDate(w.week_start, { month: 'short', day: 'numeric' })),
      datasets: [{
        data: trend.map((w) => +(w.minutes / 60).toFixed(1)),
        borderColor: '#bf5b34', backgroundColor: 'rgba(191,91,52,.13)', fill: true,
        tension: .32, pointRadius: 2.5, pointBackgroundColor: '#bf5b34',
      }],
    },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + c.parsed.y + 'h' } } },
      scales: {
        y: { grid: { color: '#e5dac6' }, ticks: { callback: (v) => v + 'h', font: { size: 11 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      },
    },
  });
}

function wireReports() {
  $('custom-start').onchange = (e) => { S.customStart = e.target.value; refreshReports(); };
  $('custom-end').onchange = (e) => { S.customEnd = e.target.value; refreshReports(); };
}

// ---------- SETTINGS ----------

async function saveSettings(patch) {
  S.settingsMap = await api('/settings', { method: 'PUT', body: patch });
}

function renderSettings() {
  renderProjectTable();
  renderTagTable();
  renderPrefs();
  renderSheets();
}

function renderProjectTable() {
  const box = $('proj-table');
  box.innerHTML = S.allProjects.map((p) => {
    if (S.editingProject === p.id) {
      return `<div class="st-row" data-id="${p.id}">
        <span class="dot" style="background:${p.color}"></span>
        <input class="tk-input" id="proj-draft" value="${esc(p.name)}">
        <span class="st-acts">
          <span class="act strong" data-act="save">save</span>
          <span class="act" data-act="cancel">cancel</span>
        </span>
      </div>`;
    }
    return `<div class="st-row" data-id="${p.id}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="name${p.archived ? ' archived' : ''}">${esc(p.name)}${p.archived ? '<span class="arch-note">archived</span>' : ''}</span>
      <span class="st-acts">
        <span class="act warm" data-act="rename">rename</span>
        <span class="act" data-act="archive">${p.archived ? 'unarchive' : 'archive'}</span>
      </span>
    </div>`;
  }).join('') + `
    <div class="st-add">
      <input class="tk-input" id="new-project" placeholder="New project name…">
      <span class="btn-dark sm tk-chip" id="add-project">Add</span>
    </div>`;

  for (const el of box.querySelectorAll('[data-act]')) {
    const id = Number(el.closest('.st-row').dataset.id);
    const proj = S.allProjects.find((p) => p.id === id);
    el.onclick = async () => {
      const act = el.dataset.act;
      if (act === 'rename') { S.editingProject = id; renderProjectTable(); $('proj-draft').focus(); }
      if (act === 'cancel') { S.editingProject = null; renderProjectTable(); }
      if (act === 'save') {
        const name = $('proj-draft').value.trim();
        if (!name) return;
        await api('/projects/' + id, { method: 'PUT', body: { name } });
        S.editingProject = null;
        await Promise.all([loadSettingsData(), loadStatus()]);
        renderProjectTable();
      }
      if (act === 'archive') {
        await api('/projects/' + id, { method: 'PUT', body: { archived: !proj.archived } });
        await Promise.all([loadSettingsData(), loadStatus()]);
        renderProjectTable();
      }
    };
  }
  const addProject = async () => {
    const name = $('new-project').value.trim();
    if (!name) return;
    await api('/projects', { method: 'POST', body: { name } });
    await Promise.all([loadSettingsData(), loadStatus()]);
    renderProjectTable();
  };
  $('add-project').onclick = addProject;
  $('new-project').addEventListener('keydown', (e) => { if (e.key === 'Enter') addProject(); });
}

function renderTagTable() {
  const box = $('tag-table');
  box.innerHTML = S.allTags.map((t) => {
    if (S.editingTag === t.id) {
      return `<div class="st-row" data-id="${t.id}">
        <input class="tk-input" id="tag-draft" value="${esc(t.name)}">
        <span class="st-acts">
          <span class="act strong" data-act="save">save</span>
          <span class="act" data-act="cancel">cancel</span>
        </span>
      </div>`;
    }
    const mergeMenu = S.mergeOpen === t.id
      ? `<div class="merge-menu"><div class="mm-head">merge into…</div>${
        S.allTags.filter((x) => x.id !== t.id).map((x) =>
          `<div class="mm-item" data-target="${x.id}">#${esc(x.name)}</div>`).join('')}</div>`
      : '';
    return `<div class="st-row" data-id="${t.id}">
      <span class="name${t.archived ? ' archived' : ''}">
        <span class="tag-pill">#${esc(t.name)}</span>
        <span class="uses">${t.uses} ${t.uses === 1 ? 'use' : 'uses'}</span>
        ${t.archived ? '<span class="arch-note">· archived</span>' : ''}
      </span>
      <span class="st-acts">
        <span class="act warm" data-act="rename">rename</span>
        <span class="merge-wrap"><span class="act" data-act="merge">merge ▾</span>${mergeMenu}</span>
        <span class="act" data-act="archive">${t.archived ? 'unarchive' : 'archive'}</span>
      </span>
    </div>`;
  }).join('');

  for (const el of box.querySelectorAll('[data-act]')) {
    const id = Number(el.closest('.st-row').dataset.id);
    const tag = S.allTags.find((t) => t.id === id);
    el.onclick = async () => {
      const act = el.dataset.act;
      if (act === 'rename') { S.editingTag = id; S.mergeOpen = null; renderTagTable(); $('tag-draft').focus(); }
      if (act === 'cancel') { S.editingTag = null; renderTagTable(); }
      if (act === 'save') {
        const name = $('tag-draft').value.trim();
        if (!name) return;
        try {
          await api('/tags/' + id, { method: 'PUT', body: { name } });
        } catch (err) { alert(err.message); return; }
        S.editingTag = null;
        await Promise.all([loadSettingsData(), loadStatus()]);
        renderTagTable();
      }
      if (act === 'archive') {
        await api('/tags/' + id, { method: 'PUT', body: { archived: !tag.archived } });
        await Promise.all([loadSettingsData(), loadStatus()]);
        renderTagTable();
      }
      if (act === 'merge') { S.mergeOpen = S.mergeOpen === id ? null : id; renderTagTable(); }
    };
  }
  for (const el of box.querySelectorAll('.mm-item')) {
    const sourceId = Number(el.closest('.st-row').dataset.id);
    el.onclick = async (ev) => {
      ev.stopPropagation();
      await api(`/tags/${sourceId}/merge-into/${el.dataset.target}`, { method: 'POST' });
      S.mergeOpen = null;
      await Promise.all([loadSettingsData(), loadStatus()]);
      renderTagTable();
    };
  }
}

function renderPrefs() {
  const s = S.settingsMap;
  $('s-target').value = (Number(s.daily_target_minutes) / 60).toString();
  $('s-target').onchange = async (e) => {
    const h = parseFloat(e.target.value);
    if (!isNaN(h) && h > 0) await saveSettings({ daily_target_minutes: Math.round(h * 60) });
    renderPrefs();
  };

  const workdays = s.workdays.split(',').filter(Boolean).map(Number);
  $('workday-chips').innerHTML = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']]
    .map(([n, label]) => `<span class="wd-chip${workdays.includes(n) ? ' on' : ''}" data-day="${n}">${label}</span>`).join('');
  for (const el of document.querySelectorAll('.wd-chip')) {
    el.onclick = async () => {
      const n = Number(el.dataset.day);
      const next = workdays.includes(n) ? workdays.filter((x) => x !== n) : [...workdays, n];
      await saveSettings({ workdays: next.sort().join(',') });
      renderPrefs();
    };
  }

  const enabled = s.reminders_enabled === '1';
  $('rem-toggle').className = 'toggle tk-chip' + (enabled ? ' on' : '');
  $('rem-midday-row').className = 'setting-row' + (enabled ? '' : ' dim');
  $('rem-eod-row').className = 'setting-row' + (enabled ? '' : ' dim');
  $('rem-toggle').onclick = async () => { await saveSettings({ reminders_enabled: enabled ? '0' : '1' }); renderPrefs(); };
  $('s-midday').value = s.reminder_midday;
  $('s-eod').value = s.reminder_eod;
  $('s-midday').onchange = (e) => saveSettings({ reminder_midday: e.target.value });
  $('s-eod').onchange = (e) => saveSettings({ reminder_eod: e.target.value });
}

function renderSheets() {
  const st = S.status;
  $('s-sheet').value = S.settingsMap.sheet_id || '';
  $('s-sheet').onchange = (e) => saveSettings({ sheet_id: e.target.value.trim() });
  $('svc-email').textContent = st.sync.service_email || 'set up data/service-account.json (see README)';
  $('copy-email').onclick = async () => {
    if (!st.sync.service_email) return;
    try { await navigator.clipboard.writeText(st.sync.service_email); } catch (e) { /* clipboard unavailable */ }
    $('copy-email').textContent = 'Copied ✓';
    setTimeout(() => { $('copy-email').textContent = 'Copy'; }, 1600);
  };
  $('last-sync').textContent = st.sync.last_success_at
    ? new Date(st.sync.last_success_at + 'Z').toLocaleString()
    : (st.sync.last_error ? 'error: ' + st.sync.last_error : 'never');
  $('sync-now').onclick = async () => {
    $('sync-now').textContent = 'Syncing…';
    try {
      await api('/sync/now', { method: 'POST' });
    } catch (err) {
      alert('Sync failed: ' + err.message);
    }
    $('sync-now').textContent = 'Sync now';
    await loadStatus();
    renderSheets();
  };
}

// ---------- init ----------

async function init() {
  await loadStatus();
  S.formDate = S.status.today;
  S.weekAnchor = S.status.today;
  await loadDay();
  wireTodayForm();
  wireWeek();
  wireReports();
  const hash = location.hash.slice(1);
  if (TABS.some(([k]) => k === hash) && hash !== 'today') {
    await switchView(hash);
  } else {
    renderTabs();
    renderToday();
  }
}

init();
