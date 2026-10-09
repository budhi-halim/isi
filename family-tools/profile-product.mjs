import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.route('**/exchange-rate/data/today.json', route => route.fulfill({ json: { tt_counter_selling_rate_buffered: 16000 } }));
  await page.addInitScript(() => {
    window.longTasks = [];
    new PerformanceObserver(list => window.longTasks.push(...list.getEntries().map(entry => ({ at: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
  });
  await page.goto(`${process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4173'}/pl-isi/`);
  await page.locator('#workspace-content').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#productTable').closest('.isi-table-region').getAttribute('aria-busy') === 'false', { timeout: 60000 });
  const startup = await page.evaluate(() => ({ tasks: window.longTasks, elements: document.querySelectorAll('*').length }));
  await page.evaluate(() => { window.longTasks = []; });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const scroll = await page.evaluate(async () => {
    const gaps = []; let previous = performance.now();
    for (let index = 0; index < 180; index++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now(); gaps.push(now - previous); previous = now;
      window.scrollBy(0, 80);
    }
    return { maxFrame: Math.max(...gaps), p95Frame: gaps.sort((a, b) => a - b)[Math.floor(gaps.length * .95)], tasks: window.longTasks };
  });
  const { profile } = await cdp.send('Profiler.stop');
  const counts = new Map();
  for (const id of profile.samples) counts.set(id, (counts.get(id) || 0) + 1);
  console.log(profile.nodes.map(node => ({ fn: node.callFrame.functionName, url: node.callFrame.url, hits: counts.get(node.id) || 0 })).sort((a, b) => b.hits - a.hits).slice(0, 12));
  await page.evaluate(() => window.scrollTo(0, 0));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 650 }] });
  for (let index = 1; index <= 16; index++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 650 - index * 32 }] });
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchY = await page.evaluate(() => scrollY);
  assert.ok(touchY > 300, `Touch swipe must move the page (${touchY})`);
  const find = await page.evaluate(() => {
    const text = document.querySelector('#productTable tbody:last-child tr:last-child td:nth-child(3) span').textContent;
    return { found: window.find(text, false, false, true), text };
  });
  assert.equal(find.found, true, 'Browser find must retain off-screen products');
  await page.locator('#productTable tbody tr').last().locator('.product-name').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'copy');
  assert.equal(await page.getByRole('columnheader').count(), 4);
  const result = { startup, scroll, touchY, find, offscreenKeyboard: true };
  await mkdir(new URL('./evidence/review-fixes/', import.meta.url), { recursive: true });
  await writeFile(new URL(`./evidence/review-fixes/product-${process.argv[2] || 'profile'}.json`, import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
