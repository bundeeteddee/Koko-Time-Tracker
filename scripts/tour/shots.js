/* Regenerates docs/screenshots/*.png from the same throwaway app the tour is
   recorded against, so the stills and the animation show one demo world.
   Read the header of record.js first — same setup, same warning.

       APP=http://localhost:4399 SHOTS=docs/screenshots node scripts/tour/shots.js
*/
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const URL = process.env.APP || 'http://localhost:4399';
const OUT = process.env.SHOTS || path.join(__dirname, 'shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
require('node:fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    defaultViewport: { width: 960, height: 900, deviceScaleFactor: 2 },
    args: ['--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();

  const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));
  const ready = async (ms = 700, sel = null) => {
    if (sel) await page.waitForSelector(sel);
    await page.evaluate(() => document.fonts.ready);
    await settle(ms);
  };
  /** Screenshot from the top of `startSel` (the card by default) to the bottom of `endSel`. */
  const clipTo = async (endSel, file, pad = 22, startSel = '.card') => {
    const clip = await page.evaluate(([e1, e2, p]) => {
      const card = document.querySelector('.card').getBoundingClientRect();
      const start = document.querySelector(e1).getBoundingClientRect();
      const end = document.querySelector(e2).getBoundingClientRect();
      return {
        x: Math.max(0, card.x - p), y: Math.max(0, window.scrollY + start.y - p),
        width: Math.min(window.innerWidth, card.width + p * 2),
        height: end.bottom - start.y + p * 2,
      };
    }, [startSel, endSel, pad]);
    await page.screenshot({ path: path.join(OUT, file), clip, captureBeyondViewport: true });
  };

  // ---- Today ----
  await page.goto(URL + '/?shot=today#today', { waitUntil: 'networkidle0' });
  await ready();
  await page.screenshot({ path: path.join(OUT, 'today.png'), fullPage: true });

  // ---- Week ----
  await page.goto(URL + '/?shot=week#week', { waitUntil: 'networkidle0' });
  await ready();
  await page.screenshot({ path: path.join(OUT, 'week.png'), fullPage: true });

  // ---- Reports ----
  await page.setViewport({ width: 960, height: 2600, deviceScaleFactor: 2 });
  await page.goto(URL + '/?shot=reports#reports', { waitUntil: 'networkidle0' });
  await ready(1600, '#range-chips .range-chip');

  const pickRange = async (label) => {
    await page.evaluate((l) => [...document.querySelectorAll('#range-chips .range-chip')]
      .find((c) => c.textContent.trim() === l).click(), label);
    await settle(1200);
  };
  const pickTag = async (tag) => {
    await page.evaluate((t) => document.querySelector(`#ti-chips .ti-chip[data-tag="${t}"]`)?.click(), tag);
    await settle(600);
  };
  const pickProject = async (name) => {
    await page.evaluate((n) => [...document.querySelectorAll('#pi-chips .ti-chip')]
      .find((c) => c.textContent.trim().startsWith(n))?.click(), name);
    await settle(600);
  };

  await pickRange('This month');
  await clipTo('.report-grid', 'reports-month.png');
  await pickTag('em');
  await clipTo('.tag-insights', 'reports-insights.png', 22, '.np-panel');
  await pickProject('Acme Bank');
  // The panel's own week window: a whole project week fits in one image, where
  // a month of Acme Bank would run to thousands of pixels.
  await page.evaluate(() => [...document.querySelectorAll('#pi-modes [data-pi-mode]')]
    .find((c) => c.dataset.piMode === 'week').click());
  await settle(900);
  await clipTo('.pi-panel', 'reports-project.png', 22, '.pi-panel');

  await pickRange('Last 12 weeks');
  await clipTo('.report-grid', 'reports-12-weeks.png');

  // ---- Quick-log popup ----
  await page.setViewport({ width: 560, height: 320, deviceScaleFactor: 2 });
  await page.goto(URL + '/quick', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.click('#q-input');
  await page.keyboard.type('1h15 investigating why FHIR bundle imports time out @Lumen ', { delay: 8 });
  await page.keyboard.type('#re', { delay: 40 });
  await settle(500);
  await page.evaluate(() => { document.documentElement.style.caretColor = 'transparent'; });
  const qClip = await page.evaluate(() => {
    const r = document.querySelector('.q').getBoundingClientRect();
    return { x: 0, y: 0, width: r.width, height: Math.ceil(r.bottom) };
  });
  await page.screenshot({ path: path.join(OUT, 'quick-log.png'), clip: qClip, captureBeyondViewport: true });

  await browser.close();
  console.log('shots written to', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
