import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const { expect } = require(`${playwrightPath}/test`);
const baseline = process.argv.includes('--baseline');
const base = process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4173';
const evidence = new URL('./evidence/product-scroll/', import.meta.url);
await mkdir(evidence, { recursive: true });
const results = [];

async function touchWithTimeout(page, x, y) {
  let timer;
  try {
    await Promise.race([
      page.touchscreen.tap(x, y),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Touch activation did not return within 15 seconds')), 15000); })
    ]);
  } finally { clearTimeout(timer); }
}

for (const mobile of [true, false]) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.route('**/exchange-rate/data/today.json', route => route.fulfill({ json: { tt_counter_selling_rate_buffered: 18500 } }));
    await page.addInitScript(() => {
      window.scrollTrace = { calls: [], tasks: [], events: [] };
      const scrollTo = window.scrollTo.bind(window);
      window.scrollTo = (...args) => {
        const at = performance.now(); scrollTo(...args);
        window.scrollTrace.calls.push({ type: 'scrollTo', at, duration: performance.now() - at, args });
      };
      const focus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function (...args) {
        const at = performance.now(); focus.apply(this, args);
        window.scrollTrace.calls.push({ type: 'focus', target: this.id || this.getAttribute('aria-label'), at, duration: performance.now() - at });
      };
      new PerformanceObserver(list => window.scrollTrace.tasks.push(...list.getEntries().map(entry => ({ at: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask' });
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(type, event => {
        if (event.target.closest('.workspace-back-top')) window.scrollTrace.events.push({ type, at: performance.now(), y: scrollY, pointerType: event.pointerType });
      }, true);
    });
    await page.goto(`${base}/pl-isi/`);
    await expect(page.locator('#workspace-content')).toBeVisible({ timeout: 60000 });
    console.log(`${mobile ? 'mobile' : 'desktop'}: loaded`);
    const count = await page.locator('#productTable tbody tr').count();
    assert.ok(count > 6000);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const control = page.locator('.workspace-back-top');
    for (const mode of ['settled', 'moving']) {
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 180000, behavior: 'instant' }); });
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000);
      await expect.poll(() => control.getAttribute('data-state')).toBe('visible');
      await page.waitForTimeout(280);
      console.log(`${mobile ? 'mobile' : 'desktop'}: ${mode} position ready`);
      const box = await control.boundingBox();
      await page.evaluate(() => { window.scrollTrace = { calls: [], tasks: [], events: [] }; });
      if (mode === 'moving') {
        await page.evaluate(async () => {
          window.scrollBy({ top: 50000, behavior: 'smooth' });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
      }
      if (mobile) await touchWithTimeout(page, box.x + box.width / 2, box.y + box.height / 2);
      else await control.click();
      console.log(`${mobile ? 'mobile' : 'desktop'}: ${mode} activated`);
      await expect.poll(() => page.evaluate(() => scrollY), { timeout: 12000 }).toBeLessThan(2).catch(async error => {
        console.log(JSON.stringify(await page.evaluate(() => ({ ...window.scrollTrace, y: scrollY }))));
        throw error;
      });
      const result = await page.evaluate(() => ({ ...window.scrollTrace, y: scrollY, focused: document.activeElement?.id, elapsed: performance.now() - window.scrollTrace.events[0]?.at }));
      result.mobile = mobile; result.mode = mode;
      results.push(result);
      await writeFile(new URL(`${baseline ? 'before' : 'after'}.json`, evidence), JSON.stringify(results, null, 2));
      console.log(JSON.stringify(result));
      if (!baseline) {
        assert.equal(result.focused === 'searchInput', false, 'Pointer activation must not focus the search field');
        if (mobile) {
          if (mode === 'moving') assert.ok(result.events[0].y < 230000, 'Tap must arrive before the previous scroll finishes');
          assert.ok(result.calls.every(call => call.type !== 'scrollTo' || call.args[0]?.behavior === 'instant'), 'Touch must cancel scrolling without traversing the full table');
          assert.ok(result.elapsed < 2500, `Touch return took ${result.elapsed}ms`);
          await page.waitForTimeout(120);
          assert.equal(await page.evaluate(() => scrollY), 0, 'A residual frame must not displace the completed return');
        }
      }
    }
    if (!baseline && mobile) {
      await page.evaluate(() => window.scrollTo({ top: 12000, behavior: 'instant' }));
      await expect.poll(() => control.getAttribute('data-state')).toBe('visible').catch(async error => {
        console.log(JSON.stringify(await page.evaluate(() => ({ ...window.scrollTrace, y: scrollY, height: document.documentElement.scrollHeight }))));
        throw error;
      });
      await page.waitForTimeout(250);
      const box = await control.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 60, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.ok(await page.evaluate(() => scrollY > innerHeight), 'Dragging/cancelling a touch is not a button activation');
      await page.touchscreen.tap(x, y);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
      await page.waitForTimeout(120);
      results.push({ mobile, cancelledGestureThenRetap: true });
      await page.evaluate(() => window.scrollTo({ top: 180000, behavior: 'instant' }));
      await expect.poll(() => control.getAttribute('data-state')).toBe('visible');
      await page.waitForTimeout(250);
      const flingBox = await control.boundingBox();
      await cdp.send('Input.synthesizeScrollGesture', { x: 160, y: 620, yDistance: -450, speed: 1800, gestureSourceType: 'touch', preventFling: false });
      const flingY = await page.evaluate(() => scrollY);
      await touchWithTimeout(page, flingBox.x + flingBox.width / 2, flingBox.y + flingBox.height / 2);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
      await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => scrollY), 0);
      results.push({ mobile, touchFlingThenTap: true, flingY });
      const newInputY = await page.evaluate(async () => {
        const control = document.querySelector('.workspace-back-top');
        control.dispatchEvent(new PointerEvent('click', { pointerType: 'touch', detail: 1 }));
        window.dispatchEvent(new WheelEvent('wheel'));
        window.scrollTo({ top: 1200, behavior: 'instant' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return scrollY;
      });
      assert.equal(newInputY, 1200, 'Return finalization must yield to a new scroll gesture');
      results.push({ mobile, newInputCancelsFinalization: true });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    }
    if (!baseline && !mobile) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        await page.emulateMedia({ reducedMotion });
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 12000, behavior: 'instant' }); });
        await expect.poll(() => control.getAttribute('data-state')).toBe('visible');
        await control.focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'searchInput');
      }
      results.push({ mobile, keyboardAndReducedMotion: true });
    }
    if (mobile) {
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme });
        const row = page.locator('#productTable tbody tr').first();
        await row.locator('.product-name').tap();
        await expect(page.locator('#production-popup')).toBeVisible();
        const colors = await row.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, highlight: getComputedStyle(node).webkitTapHighlightColor }));
        if (!baseline) assert.deepEqual(colors, { background: 'rgba(0, 0, 0, 0)', highlight: 'rgba(0, 0, 0, 0)' });
        results.push({ mobile, colorScheme, rowColors: colors });
        await page.screenshot({ path: fileURLToPath(new URL(`${baseline ? 'before' : 'after'}-tap-${colorScheme}.png`, evidence)) });
        await page.locator('h1').tap();
      }
    }
  } finally { await browser.close(); }
}
await writeFile(new URL(`${baseline ? 'before' : 'after'}.json`, evidence), JSON.stringify(results, null, 2));
console.log(`${baseline ? 'BASELINE' : 'PASS'} stationary/moving return, touch fling, gesture cancellation, keyboard/reduced motion, and light/dark popup colors`);
