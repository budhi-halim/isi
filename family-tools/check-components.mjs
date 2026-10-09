import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require(process.env.SHARP_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const output = fileURLToPath(new URL('../family-review/evidence/', import.meta.url));
await mkdir(output, { recursive: true });
const results = [];
for (const kind of ['family', 'revenue', 'feedback']) for (const size of [16, 32, 48, 128, 180]) {
  const image = sharp(fileURLToPath(new URL(`../family/assets/icons/${kind}-${size}.png`, import.meta.url)));
  const meta = await image.metadata();
  assert.equal(meta.width, size);
  assert.equal(meta.height, size);
  assert.equal(meta.hasAlpha, true);
  const raw = await image.ensureAlpha().raw().toBuffer();
  assert.equal(raw[3], 0, 'Corner pixel should remain transparent');
}
results.push('Three logos, five PNG sizes each: dimensions and transparency verified');
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'light' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/isi/family-review/');
    await page.locator('#restart-loading').click();
    assert.equal(await page.locator('#loaded-content').getAttribute('inert'), '');
    await page.waitForFunction(() => !document.querySelector('#loaded-content').hidden);
    assert.equal(await page.locator('#loaded-content').getAttribute('aria-busy'), 'false');
    await page.locator('#show-dialog').click();
    assert.equal(await page.locator('#sample-dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sample-dialog').isVisible(), false);
    await page.locator('#show-error').click();
    await page.locator('#show-error').click();
    assert.equal(await page.locator('.isi-toast').count(), 1, 'Duplicate notifications should replace existing entry');
    await page.locator('#show-success').click();
    assert.equal(await page.locator('.isi-toast').count(), 2);
    await page.locator('.isi-toast button').evaluateAll(buttons => buttons.forEach(button => button.click()));
    await page.locator('#sample-search').fill('missing');
    assert.equal(await page.locator('#sample-empty').isVisible(), true);
    await page.locator('#sample-search').fill('');
    const help = page.locator('[data-tooltip]');
    await help.focus();
    assert.equal(await page.locator('[role="tooltip"]').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[role="tooltip"]').count(), 0);
    await page.locator('#theme-toggle').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#theme-toggle').getAttribute('data-scheme'), 'dark');
    await page.reload();
    assert.equal(await page.locator('#theme-toggle').getAttribute('data-scheme'), 'light');
    await page.evaluate(async () => {
      const { createReadinessGate } = await import('../family/js/readiness.js');
      const host = document.createElement('div');
      const content = document.createElement('div');
      document.body.append(host, content);
      let resolveLoad;
      let renders = 0;
      let loads = 0;
      const gate = createReadinessGate({ host, content, logoUrl: '../family/assets/icons/family.svg', load: () => { loads++; return new Promise(resolve => { resolveLoad = resolve; }); }, onReady: () => { renders++; } });
      const first = gate.start();
      await gate.start();
      if (loads !== 1 || !content.inert || !content.hidden) throw new Error('Readiness single-run guard failed');
      gate.destroy();
      resolveLoad('late result');
      await first;
      if (renders !== 0) throw new Error('Stale readiness result rendered');
      host.remove(); content.remove();
      const nextHost = document.createElement('div');
      const nextContent = document.createElement('div');
      document.body.append(nextHost, nextContent);
      let fail = true;
      const retry = createReadinessGate({ host: nextHost, content: nextContent, logoUrl: '../family/assets/icons/family.svg', load: async () => { if (fail) throw new Error('private internal detail'); return 'ok'; }, onReady: data => { nextContent.textContent = data; } });
      if (await retry.start()) throw new Error('Failure not reported');
      if (!nextContent.inert || nextHost.textContent.includes('private internal')) throw new Error('Failure surface incorrect');
      fail = false;
      if (!await retry.start() || nextContent.textContent !== 'ok' || nextContent.inert) throw new Error('Retry failed');
      retry.destroy(); nextHost.remove(); nextContent.remove();
    });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [360, 768, 1600]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${channel}-${scheme}-${width}.png`), fullPage: true });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#restart-loading').click();
    assert.equal(await page.locator('.isi-spinner').first().evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.deepEqual(errors, []);
    const mobile = await browser.newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await mobile.goto('http://127.0.0.1:4173/isi/family-review/');
    await mobile.locator('[data-tooltip]').tap();
    assert.equal(await mobile.locator('[role="tooltip"]').isVisible(), true);
    const rect = await mobile.locator('[role="tooltip"]').boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 360);
    await mobile.locator('[data-tooltip]').tap();
    assert.equal(await mobile.locator('[role="tooltip"]').count(), 0);
    await mobile.close();
    await page.close();
    results.push(`${channel}: dialog, switch keyboard/reload, deduplicated notices, filtering, tooltip focus/Escape/touch/edges, readiness lock/retry/stale/duplicate guards, responsive light/dark, reduced motion passed`);
  } finally { await browser.close(); }
}
await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(results.join('\n'));
