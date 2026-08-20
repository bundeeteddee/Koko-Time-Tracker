/* Records docs/tour.gif — the README hero — by driving the real app in Chrome
   and writing one PNG per visual state plus the duration each should hold for.
   Pair it with build-gif.sh, which turns those into a GIF whose frame delays
   match (pauses cost one frame, not thirty).

   It LOGS FOUR REAL ENTRIES, so point it at a throwaway copy of the app, never
   the one holding your data — copy server.js/src/public to a scratch directory
   with an empty data/, run `node scripts/seed.js` there, and start it on
   another port (see CLAUDE.md). Reseed between takes: each run adds entries.

       npm install --prefix <scratch> puppeteer-core
       APP=http://localhost:4399 node scripts/tour/record.js
       scripts/tour/build-gif.sh scripts/tour/frames docs/tour.gif
*/
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const OUT = process.env.OUT || path.join(__dirname, 'frames');
const URL = process.env.APP || 'http://localhost:4399';  // a throwaway copy, not the real app
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 960, H = 700;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const frames = [];
let page;

async function shoot(dur = 0.08) {
  const file = path.join(OUT, String(frames.length).padStart(4, '0') + '.png');
  await page.screenshot({ path: file, type: 'png' });
  frames.push({ file, dur });
}

// ---- fake cursor (screenshots don't capture the real pointer) ----
const CURSOR_CSS = `
#demo-cursor { position: fixed; z-index: 99999; width: 22px; height: 22px; pointer-events: none;
  left: 0; top: 0; will-change: transform; filter: drop-shadow(0 2px 3px rgba(40,25,10,.35)); }
#demo-cursor .ring { position: absolute; left: -13px; top: -13px; width: 48px; height: 48px; border-radius: 99px;
  border: 2px solid rgba(191,91,52,.85); background: rgba(191,91,52,.18); opacity: 0; transform: scale(.4); }
#demo-cursor.click .ring { opacity: 1; transform: scale(1); }
* { caret-color: transparent !important; }
`;
const CURSOR_HTML = `<div id="demo-cursor"><div class="ring"></div>
<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 2.5 L5 19.2 L9.3 15.2 L11.9 21.4 L14.9 20.1 L12.3 14 L18.2 13.8 Z"
  fill="#241d16" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg></div>`;

async function installChrome() {
  await page.addStyleTag({ content: CURSOR_CSS });
  await page.evaluate((html) => {
    document.body.insertAdjacentHTML('beforeend', html);
    window.__cur = document.getElementById('demo-cursor');
    window.__curAt = (x, y) => { window.__cur.style.transform = `translate(${x}px, ${y}px)`; };
    window.__curAt(760, 620);
  }, CURSOR_HTML);
}

let cx = 760, cy = 620;
async function moveTo(x, y, steps = 5) {
  const [x0, y0] = [cx, cy];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); // ease in-out
    const nx = x0 + (x - x0) * e, ny = y0 + (y - y0) * e;
    await page.evaluate((a, b) => window.__curAt(a, b), nx, ny);
    await shoot(0.045);
  }
  cx = x; cy = y;
}

async function rectOf(sel, nth = 0) {
  return page.evaluate((s, n) => {
    const el = document.querySelectorAll(s)[n];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom, height: r.height };
  }, sel, nth);
}

async function clickSel(sel, { nth = 0, settle = 0.35, steps = 5 } = {}) {
  const r = await rectOf(sel, nth);
  if (!r) throw new Error('no element for ' + sel + ' #' + nth);
  await moveTo(r.x, r.y, steps);
  await page.evaluate(() => window.__cur.classList.add('click'));
  await shoot(0.11);
  await page.mouse.click(r.x, r.y);
  await page.evaluate(() => window.__cur.classList.remove('click'));
  await new Promise((r2) => setTimeout(r2, 260));
  await shoot(settle);
}

async function type(text, per = 0.07) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await shoot(per);
  }
}

async function key(k, settle = 0.35) {
  await page.keyboard.press(k);
  await new Promise((r) => setTimeout(r, 220));
  await shoot(settle);
}

/** Stepped scroll so the given element sits `margin` px below the viewport top. */
async function scrollToSel(sel, { margin = 24, steps = 7, hold = 0.05 } = {}) {
  const target = await page.evaluate((s, m) => {
    const el = document.querySelector(s);
    const y = window.scrollY + el.getBoundingClientRect().top - m;
    return Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
  }, sel, margin);
  const from = await page.evaluate(() => window.scrollY);
  if (Math.abs(target - from) < 2) return;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    await page.evaluate((y) => window.scrollTo(0, y), from + (target - from) * e);
    await shoot(hold);
  }
}

async function logEntry({ dur, projectChip, desc, tagStem }) {
  await clickSel('#f-duration', { settle: 0.25 });
  await type(dur, 0.07);
  await shoot(0.3);
  if (projectChip !== null) {
    const idx = await page.evaluate((name) => [...document.querySelectorAll('#proj-chips .chip')]
      .findIndex((c) => c.textContent.trim() === name), projectChip);
    await clickSel('#proj-chips .chip', { nth: idx, settle: 0.4 });
  }
  await clickSel('#f-desc', { settle: 0.22 });
  await type(desc, 0.055);
  await shoot(0.2);
  await type(tagStem, 0.12);          // '#te' — the autocomplete opens as it narrows
  await shoot(1.3);                   // hold on the suggestion list
  await key('Enter', 0.7);            // accept the tag
  await key('Enter', 1.4);            // log the entry
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell' === process.env.SHELL_HEADLESS ? 'shell' : true,
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
    args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
      '--disable-lcd-text', '--font-render-hinting=none'],
  });
  page = await browser.newPage();
  await page.goto(URL + '/#today', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.Chart && document.querySelector('#entries .entry-row'));
  await page.evaluate(() => { window.Chart.defaults.animation = false; window.Chart.defaults.animations = {}; });
  await new Promise((r) => setTimeout(r, 400));
  await installChrome();

  // ===== 1. TODAY =====
  await shoot(1.6);

  await logEntry({
    dur: '45m', projectChip: 'Acme Bank',
    desc: 'writing test cases for the payment retry flow ', tagStem: '#te',
  });
  await logEntry({
    dur: '1h15', projectChip: 'Lumen Health',
    desc: 'investigating why FHIR bundle imports time out ', tagStem: '#res',
  });
  await logEntry({
    dur: '30m', projectChip: 'No project',
    desc: '1:1 with Brian ', tagStem: '#1',
  });
  await logEntry({
    dur: '20m', projectChip: null,
    desc: 'collecting peer input for Brian’s review ', tagStem: '#em',
  });
  await shoot(1.2);

  // ===== 2. WEEK =====
  await clickSel('#tabs .tab', { nth: 1, settle: 2.4 });
  await clickSel('#prev-week', { settle: 2.6 });

  // ===== 3. REPORTS =====
  await clickSel('#tabs .tab', { nth: 2, settle: 1.0 });
  await page.evaluate(() => { window.Chart.defaults.animation = false; });
  await clickSel('#range-chips .range-chip', { nth: 2, settle: 2.4 }); // This month
  await scrollToSel('.report-grid');
  await shoot(2.4);

  // ---- where no-project time went ----
  await scrollToSel('.np-panel', { margin: 18 });
  await shoot(3.2);

  // ---- tag insights ----
  await scrollToSel('.tag-insights', { margin: 14 });
  await shoot(2.2);
  for (const tag of ['tests', 'research', '1on1', 'em']) {
    const idx = await page.evaluate((t) => [...document.querySelectorAll('#ti-chips .ti-chip')]
      .findIndex((c) => c.dataset.tag === t), tag);
    if (idx < 0) continue;
    await clickSel('#ti-chips .ti-chip', { nth: idx, settle: 0.3, steps: 4 });
    await scrollToSel('.tag-insights', { margin: 14, steps: 3 });
    await shoot(2.3);
  }

  // ---- project insights ----
  await scrollToSel('.pi-panel', { margin: 14 });
  await shoot(2.2);
  for (const proj of ['Lumen Health', 'Home Lab', 'Woodworking', 'Acme Bank']) {
    const idx = await page.evaluate((n) => [...document.querySelectorAll('#pi-chips .ti-chip')]
      .findIndex((c) => c.textContent.trim().startsWith(n)), proj);
    if (idx < 0) continue;
    await clickSel('#pi-chips .ti-chip', { nth: idx, settle: 0.3, steps: 4 });
    await scrollToSel('.pi-panel', { margin: 14, steps: 3 });
    await shoot(2.2);
  }
  // week / month windows for the selected project (Acme Bank, from the cycle above)
  await clickSel('#pi-modes [data-pi-mode]', { nth: 1, settle: 0.3 });   // Week
  await scrollToSel('.pi-panel', { margin: 14, steps: 3 });
  await shoot(2.4);
  await clickSel('#pi-modes [data-pi-mode]', { nth: 2, settle: 0.3 });   // Month
  await scrollToSel('.pi-panel', { margin: 14, steps: 3 });
  await shoot(2.6);
  await clickSel('#pi-prev', { settle: 0.3 });
  await scrollToSel('.pi-panel', { margin: 14, steps: 3 });
  await shoot(2.4);

  // ===== 4. back to today, for the loop =====
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(0.3);
  await clickSel('#tabs .tab', { nth: 0, settle: 2.0 });

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(frames, null, 1));
  const total = frames.reduce((a, f) => a + f.dur, 0);
  console.log(`${frames.length} frames, ${total.toFixed(1)}s`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
