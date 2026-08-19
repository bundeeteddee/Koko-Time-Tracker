// The quick-log popup: one text field with #tag and @project completion, opened
// from the menu bar as a small chromeless Chrome window.
//
// It posts the raw line to /api/quick rather than parsing and posting fields,
// so this page stays a front end to the same endpoint the plugin and curl use.
// The live preview calls parseQuick() — the server's own parser, loaded here as
// a plain script — so what you see is what the server will do, not a guess.

const $ = (id) => document.getElementById(id);

function setHint(text, isError) {
  const el = $('q-hint');
  el.textContent = text;
  el.classList.toggle('err', !!isError);
}

const S = {
  projects: [],
  tags: [],
  acOpen: false,
  acIndex: 0,
  submitting: false,
};

// ---------- window sizing ----------

const WIDTH = 560;

// Grows and shrinks with the suggestion list. Chrome ignores --window-size on
// the command line when it's already running, so the page has to do this
// itself; resizeTo works because this is a single-tab app window.
function sizeWindow() {
  const inner = document.querySelector('.q').offsetHeight;
  const chrome = window.outerHeight - window.innerHeight;
  // Headless and normal-tab contexts report no window chrome; resizing there
  // would either do nothing useful or fight the user's own window.
  if (chrome <= 0) return;
  window.resizeTo(WIDTH, inner + chrome);
}

// ---------- completion ----------

// The token under the caret, not at the end of the line, so completion still
// works when you go back to fix a tag mid-sentence.
function tokenAtCaret() {
  const input = $('q-input');
  const upto = input.value.slice(0, input.selectionStart);
  const m = upto.match(/([#@])([^\s#@]*)$/);
  if (!m) return null;
  return { kind: m[1], query: m[2].toLowerCase(), start: input.selectionStart - m[0].length };
}

function acData() {
  const t = tokenAtCaret();
  if (!t) return { active: false, items: [], showCreate: false };

  if (t.kind === '#') {
    const items = S.tags.filter((x) => x.name.includes(t.query)).slice(0, 5);
    const exact = S.tags.some((x) => x.name === t.query);
    // Offering to create a project here would be wrong — projects are managed
    // explicitly — but a tag genuinely comes into being when you log it.
    return { ...t, active: true, items, showCreate: t.query.length > 0 && !exact };
  }
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = norm(t.query);
  const items = S.projects.filter((p) => norm(p.name).includes(q)).slice(0, 5);
  return { ...t, active: true, items, showCreate: false };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderAc() {
  const box = $('ac');
  const ad = acData();
  const open = S.acOpen && ad.active && (ad.items.length > 0 || ad.showCreate);
  const wasOpen = !box.hidden;
  box.hidden = !open;

  if (open) {
    const total = ad.items.length + (ad.showCreate ? 1 : 0);
    if (S.acIndex >= total) S.acIndex = 0;
    box.innerHTML = ad.items.map((it, i) => {
      const label = ad.kind === '#' ? '#' + esc(it.name) : esc(it.name);
      const meta = ad.kind === '#'
        ? `${it.uses} ${it.uses === 1 ? 'use' : 'uses'}`
        : (it.last_used ? 'last used ' + esc(it.last_used) : 'unused');
      return `<div class="ac-item${S.acIndex === i ? ' hl' : ''}" data-i="${i}">
        <span>${label}</span><span class="uses">${meta}</span></div>`;
    }).join('') + (ad.showCreate
      ? `<div class="ac-create${S.acIndex === ad.items.length ? ' hl' : ''}" data-i="${ad.items.length}">
          <span class="plus">+</span>New tag <b>#${esc(ad.query)}</b>&nbsp;<span class="ac-note">· created when you log</span></div>`
      : '');
  }
  // Enter means "take this suggestion" while the list is up and "log it" when
  // it isn't, so the hint has to say which one is about to happen.
  if (open) setHint('⏎ to select · esc to dismiss', false);
  else if (wasOpen) setHint('⏎ to log · esc to close', false);

  if (open || wasOpen) sizeWindow();
}

// Highlight moves without rebuilding the list: rebuilding under the cursor
// destroys the node mid-click and the selection never lands.
function updateAcHighlight() {
  for (const el of $('ac').querySelectorAll('[data-i]')) {
    el.classList.toggle('hl', Number(el.dataset.i) === S.acIndex);
  }
}

function acceptAc(i) {
  const ad = acData();
  if (!ad.active) return;
  let name;
  if (i < ad.items.length) name = ad.items[i].name;
  else name = ad.query;

  const input = $('q-input');
  // A project name with spaces has to be quoted or the parser stops at the
  // first space, so quote exactly when it matters.
  const insert = ad.kind === '@' && /\s/.test(name) ? `@"${name}"` : ad.kind + name;
  const before = input.value.slice(0, ad.start);
  const after = input.value.slice(input.selectionStart);
  // Only add the trailing space when there isn't one already, so completing a
  // token that sits mid-line doesn't leave a double space behind.
  const sep = /^\s/.test(after) ? '' : ' ';
  input.value = before + insert + sep + after;
  const caret = (before + insert + sep).length;
  input.setSelectionRange(caret, caret);

  S.acOpen = false;
  S.acIndex = 0;
  renderAc();
  renderPreview();
  input.focus();
}

// ---------- preview ----------

function renderPreview() {
  const box = $('q-preview');
  const parsed = parseQuick($('q-input').value);

  if (parsed.error) {
    box.innerHTML = $('q-input').value.trim()
      ? `<span class="muted">${esc(parsed.error)}</span>`
      : '';
    return;
  }

  let project;
  if (parsed.project) {
    const r = resolveProject(S.projects, parsed.project);
    project = r.error ? `<span class="muted">${esc(r.error)}</span>` : `<span class="proj">${esc(r.project.name)}</span>`;
  } else if (S.projects.length) {
    project = `<span class="proj">${esc(S.projects[0].name)}</span>`;
  } else {
    project = '<span class="muted">No project</span>';
  }

  const tags = (parsed.description.match(/#[a-z0-9-]+/gi) || [])
    .map((t) => `<span class="pill">${esc(t)}</span>`).join('');

  box.innerHTML = `<span class="dur">${esc(fmtDur(parsed.minutes))}</span>${project}${tags}`;
}

// ---------- submit ----------

async function submit() {
  const text = $('q-input').value.trim();
  if (!text || S.submitting) return;
  S.submitting = true;
  setHint('Logging…', false);
  try {
    const res = await fetch('/api/quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const body = await res.json();
    if (!res.ok) {
      setHint(body.error || 'Could not log that', true);
      S.submitting = false;
      return;
    }
    window.close();
    // Reachable if the window can't close itself (opened as a normal tab rather
    // than an app window) — leave something on screen rather than a blank form.
    setHint('Logged ' + fmtDur(body.minutes) + ' — you can close this window', false);
    $('q-input').value = '';
    renderPreview();
    S.submitting = false;
  } catch (e) {
    setHint('Koko is not responding', true);
    S.submitting = false;
  }
}

// ---------- wiring ----------

function onKeyDown(e) {
  const ad = acData();
  const total = ad.active ? ad.items.length + (ad.showCreate ? 1 : 0) : 0;
  const open = S.acOpen && total > 0;

  if (e.key === 'Escape') {
    e.preventDefault();
    if (open) { S.acOpen = false; renderAc(); } else { window.close(); }
    return;
  }
  if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    S.acIndex = (S.acIndex + (e.key === 'ArrowDown' ? 1 : total - 1)) % total;
    updateAcHighlight();
    return;
  }
  if (open && (e.key === 'Enter' || e.key === 'Tab')) {
    e.preventDefault();
    acceptAc(S.acIndex);
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    submit();
  }
}

function onInput() {
  S.acOpen = true;
  S.acIndex = 0;
  renderAc();
  renderPreview();
}

async function init() {
  const input = $('q-input');
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  // Moving the caret with the mouse or arrows changes which token is being
  // completed, so the list has to follow it.
  input.addEventListener('click', () => { renderAc(); });

  const box = $('ac');
  box.addEventListener('mousemove', (e) => {
    const el = e.target.closest('[data-i]');
    if (el && Number(el.dataset.i) !== S.acIndex) { S.acIndex = Number(el.dataset.i); updateAcHighlight(); }
  });
  // mousedown, not click: the input keeps focus and the selection lands before
  // any blur handling can tear the list down.
  box.addEventListener('mousedown', (e) => {
    const el = e.target.closest('[data-i]');
    if (!el) return;
    e.preventDefault();
    acceptAc(Number(el.dataset.i));
  });

  // Loaded before focus: it's a localhost round trip, and the alternative is a
  // window where the field accepts typing but has nothing to suggest yet.
  try {
    const st = await (await fetch('/api/status')).json();
    S.projects = st.projects || [];
    S.tags = st.tags || [];
  } catch (e) {
    setHint('Koko is not responding', true);
  }

  sizeWindow();
  input.focus();
  // Instrument Serif lands after first paint and changes the preview's height,
  // so size once more when the fonts have settled.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeWindow);
}

document.addEventListener('DOMContentLoaded', init);
