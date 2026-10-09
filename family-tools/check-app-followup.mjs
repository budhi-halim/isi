import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const { expect } = require(`${playwrightPath}/test`);
const base = process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4173';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('./evidence/app-followup/', import.meta.url));
await mkdir(output, { recursive: true });
const readJson = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const today = await readJson('exchange-rate/data/today.json');
const history = await readJson('exchange-rate/data/history.json');
const products = await readJson('pl-isi/data/products.json');
const { filterProducts, productTags, productionMap, formatProductionDate } = await import('../../pl-isi/js/logic.js');
const tags = productTags(await readJson('pl-isi/data/product_tags.json'));
const production = productionMap(await readJson('general-database/data/last_production.json'));
const snapshot = { products, rate: today.tt_counter_selling_rate_buffered, lastProductionMap: production, tagsMap: tags.map, rawTagsList: tags.rawList };
const results = [];
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function bounded(page, selector, label) {
  const box = await page.locator(selector).boundingBox();
  const size = page.viewportSize();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, `${label}: ${JSON.stringify(box)}`);
}
async function singlePage(page, label) {
  const box = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
  assert.ok(box.width <= box.w + 1 && box.height <= box.h + 1, `${label}: ${JSON.stringify(box)}`);
}

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  let failRates = false, delayRates = false, reads = 0;
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'budhi-halim.github.io' && /^\/exchange-rate\/data\/(today|history)\.json$/.test(url.pathname)) {
      reads++;
      if (delayRates) await new Promise(resolve => setTimeout(resolve, 300));
      return route.fulfill(failRates ? { status: 503, body: 'Unavailable' } : { json: url.pathname.endsWith('today.json') ? today : history });
    }
    return url.origin === base ? route.continue() : route.abort();
  });
  try {
    const page = await context.newPage();
    for (const name of ['isi', 'isi-share']) {
      const apps = await readJson(`${name}/data/app_list.json`);
      await page.goto(`${base}/${name}/`);
      await expect(page.locator('.app-link')).toHaveCount(apps.length);
      assert.equal(await page.locator('.app-link p').count(), 0);
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const [width, height] of [[320, 640], [390, 844], [768, 600], [1440, 900]]) {
          await page.setViewportSize({ width, height });
          await frames(page);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          if (width < 600) assert.equal(await page.locator('#appGrid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 4);
          for (const link of await page.locator('.app-link').all()) {
            assert.ok((await link.textContent()).trim());
            assert.equal(await link.getAttribute('target'), '_blank');
          }
          if (width === 390) await page.screenshot({ path: path.join(output, `${channel}-${name}-${scheme}.png`) });
        }
      }
      await page.locator('.app-link').first().focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelectorAll('.app-link')[1]), true);
    }
    results.push(`${channel}: launcher membership, four-column mobile grid, descriptions removed, keyboard and both themes`);

    const timeoutPage = await context.newPage();
    await timeoutPage.addInitScript(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = duration => timeout(duration === 45000 ? 100 : duration);
    });
    delayRates = true;
    await timeoutPage.goto(`${base}/exchange-rate/`);
    await expect(timeoutPage.locator('#rate-status')).toContainText('could not be loaded');
    await expect(timeoutPage.locator('#refresh-rates')).toBeEnabled();
    delayRates = false;
    await timeoutPage.locator('#refresh-rates').click();
    await expect(timeoutPage.locator('.chart-series')).toHaveCount(4);
    await timeoutPage.close();
    await page.bringToFront();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/exchange-rate/`);
    await expect(page.locator('.chart-series')).toHaveCount(4);
    await expect(page.locator('#graph-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#current-rates dd')).toHaveCount(12);
    for (const value of await page.locator('#current-rates dd').allTextContents()) assert.match(value, /^\d[\d,.]*$/);
    await expect(page.locator('#current-date')).toContainText(today.date.slice(0, 4));
    await page.locator('.rate-chart').focus();
    await page.keyboard.press('End');
    await expect(page.locator('.chart-inspection')).toBeVisible();
    await expect(page.locator('.chart-inspection')).toContainText(today.tt_counter_selling_rate_buffered.toLocaleString('en-US'));
    await page.keyboard.press('Escape');
    await expect(page.locator('.chart-inspection')).toBeHidden();
    await page.selectOption('#chart-duration', '7');
    await frames(page);
    const recent = await page.locator('#chart-caption').textContent();
    assert.match(recent, /[1-7] daily observations/);
    await page.selectOption('#chart-duration', 'all');
    await frames(page);
    assert.notEqual(await page.locator('#chart-caption').textContent(), recent);
    await page.locator('#series-control summary').click();
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(page.locator('#series-control .filter-value')).toHaveText('None');
    await expect(page.locator('.chart-empty')).toHaveText('Choose a series to display.');
    for (const checkbox of await page.locator('#series-control input[type=checkbox]').all()) await checkbox.check();
    await expect(page.locator('.chart-series')).toHaveCount(12);
    await page.keyboard.press('Escape');
    await page.selectOption('#chart-duration', 'custom');
    await page.locator('#chart-from').fill('2099-02-01');
    await page.locator('#chart-to').fill('2099-02-10');
    await page.locator('#chart-to').blur();
    await expect(page.locator('.chart-empty')).toHaveText('No rates in this date range.');
    await page.locator('#chart-from').fill('2099-03-01');
    await page.locator('#chart-from').blur();
    await expect(page.locator('#range-error')).toBeVisible();
    await page.locator('#chart-from').fill(today.date);
    await page.locator('#chart-to').fill(today.date);
    await page.locator('#chart-to').blur();
    await expect(page.locator('#range-error')).toBeHidden();
    await expect(page.locator('.chart-marker')).toHaveCount(12);
    await page.selectOption('#chart-duration', '90');
    const beforeTable = reads;
    await page.locator('#graph-tab').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#table-tab')).toBeFocused();
    await expect(page.locator('#viewer tbody tr')).not.toHaveCount(0);
    assert.equal(reads, beforeTable, 'Table uses the already-loaded snapshot');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('#viewer .workspace-footer')).toContainText('2 /');
    await page.getByText('Filters and columns', { exact: true }).click();
    await page.locator('#viewer input[type=search]').first().fill('TT counter');
    await expect(page.locator('#viewer tbody tr').first()).toContainText('TT counter');
    await page.getByText('Filters and columns', { exact: true }).click();
    await page.locator('#graph-tab').click();
    const retained = await page.locator('#current-rates').innerText();
    failRates = true;
    await page.locator('#refresh-rates').click();
    await expect(page.locator('#rate-status')).toContainText('Previously loaded');
    assert.equal(await page.locator('#current-rates').innerText(), retained);
    failRates = false; delayRates = true;
    const beforeRetry = reads;
    await page.locator('#refresh-rates').evaluate(button => { button.click(); button.click(); button.click(); });
    await expect(page.locator('#rate-status')).toBeHidden();
    assert.equal(reads - beforeRetry, 2, 'Refresh must be single-flight');
    delayRates = false;
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const [width, height] of [[320, 320], [360, 640], [390, 844], [740, 360], [768, 600], [1440, 900], [2560, 1440]]) {
        await page.setViewportSize({ width, height });
        for (const duration of ['90', 'custom']) {
          await page.selectOption('#chart-duration', duration);
          await frames(page);
          await singlePage(page, `graph ${width}×${height}`);
          await bounded(page, '#chart-host', `${duration} graph ${width}×${height}`);
          await bounded(page, '#refresh-rates', `refresh ${width}×${height}`);
          assert.ok((await page.locator('.rate-chart').getAttribute('viewBox'))?.endsWith(String((await page.locator('#chart-host').boundingBox()).height)));
          if (width === 390 && duration === '90') await page.screenshot({ path: path.join(output, `${channel}-graph-${scheme}.png`) });
        }
        await page.locator('#series-control summary').scrollIntoViewIfNeeded();
        await page.locator('#series-control summary').click();
        await frames(page);
        await bounded(page, '#series-control .filter-panel', `series ${width}×${height}`);
        await page.keyboard.press('Escape');
        await page.locator('#table-tab').click();
        await frames(page);
        await singlePage(page, `table ${width}×${height}`);
        await bounded(page, '#viewer .workspace-footer', `table footer ${width}×${height}`);
        await page.locator('#graph-tab').click();
      }
    }
    await page.locator('#table-tab').click();
    await page.reload();
    await expect(page.locator('#graph-tab')).toHaveAttribute('aria-selected', 'true');
    results.push(`${channel}: graph defaults, all numeric rates, series, dates, keyboard inspection, table, errors/retry, duplicate prevention, seven 100svh sizes and both themes`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/pl-isi/`);
    const region = page.locator('#productTable').locator('..');
    await expect(region).toHaveAttribute('aria-busy', 'false', { timeout: 60000 });
    await expect(page.locator('#workspace-content')).toBeVisible();
    await expect(page.locator('#productTable tbody tr')).toHaveCount(products.length);
    const first = page.locator('#productTable tbody tr').first();
    await page.mouse.move(0, 0);
    await first.locator('.product-name').hover();
    await expect.poll(() => page.locator('#production-popup').isVisible()).toBe(true);
    await first.locator('.product-name').click();
    await expect.poll(() => page.locator('#production-popup').isVisible()).toBe(true);
    assert.equal(await page.locator('dialog').count(), 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#production-popup')).toBeHidden();
    const code = await first.locator('.product-code span').innerText();
    await first.locator('[data-action=copy]').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
    for (const query of ['chicken', 'corn | cheese', '#ordered', 'nonexistentuniqueword', '(']) {
      await page.locator('#searchInput').fill(query);
      const expected = filterProducts(snapshot, { query });
      await expect(page.locator('#result-count')).toHaveText(`${expected.products.length.toLocaleString()} products`);
      await expect(region).toHaveAttribute('aria-busy', 'false');
      await expect.poll(() => page.locator('#invalidQuery').isVisible()).toBe(expected.invalid);
      assert.deepEqual(await page.locator('#productTable tbody tr .product-code span').allTextContents(), expected.products.map(product => product.product_code || ''));
    }
    await page.locator('#searchInput').evaluate(input => {
      for (const text of ['a', '', 'chicken', 'corn', 'cheese']) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    const lastExpected = filterProducts(snapshot, { query: 'cheese' });
    await expect(page.locator('#result-count')).toHaveText(`${lastExpected.products.length.toLocaleString()} products`);
    await expect(region).toHaveAttribute('aria-busy', 'false');
    assert.deepEqual(await page.locator('#productTable tbody tr .product-code span').allTextContents(), lastExpected.products.map(product => product.product_code || ''));
    results.push(`${channel}: full product DOM, desktop hover/pin, clipboard, original parser/order/tags and latest rapid search wins`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); await browser.close(); }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.route('https://budhi-halim.github.io/exchange-rate/data/*.json', route => route.fulfill({ json: route.request().url().endsWith('today.json') ? today : history }));
  const page = await context.newPage();
  await page.goto(`${base}/pl-isi/`);
  await expect(page.locator('#productTable').locator('..')).toHaveAttribute('aria-busy', 'false', { timeout: 60000 });
  const first = page.locator('#productTable tbody tr').first();
  const box = await first.locator('.product-name').boundingBox();
  await page.touchscreen.tap(box.x + 20, box.y + 15);
  await expect(page.locator('#production-popup')).toBeVisible();
  await bounded(page, '#production-popup', 'mobile production popup');
  const expected = production.get(String(products[0].product_code).replace(/^\*/, '').trim().toLowerCase());
  await expect(page.locator('#production-popup')).toContainText(formatProductionDate(expected?.date) || 'No data');
  await page.screenshot({ path: path.join(output, 'product-mobile-popup.png') });
  assert.equal(await first.evaluate(row => Boolean(row.closest('[inert]'))), false);
  assert.equal(await page.locator('dialog').count(), 0);
  await page.touchscreen.tap(box.x + 20, box.y + 15);
  await expect(page.locator('#production-popup')).toBeHidden();
  await page.touchscreen.tap(box.x + 20, box.y + 15);
  await page.evaluate(() => scrollBy(0, 120));
  await expect(page.locator('#production-popup')).toBeHidden();
  await page.screenshot({ path: path.join(output, 'product-mobile.png') });
  await page.goto(`${base}/exchange-rate/`);
  await expect(page.locator('.chart-series')).toHaveCount(4);
  const chart = await page.locator('#chart-host').boundingBox();
  await page.touchscreen.tap(chart.x + chart.width * .8, chart.y + chart.height * .5);
  await expect(page.locator('.chart-inspection')).toBeVisible();
  await bounded(page, '.chart-inspection', 'mobile graph inspection');
  await page.touchscreen.tap(20, 25);
  await expect(page.locator('.chart-inspection')).toBeHidden();
  results.push('Chrome touch: production popup at tapped row, no modal/inert background, repeated tap/scroll dismissal; graph tap/outside dismissal');
} finally { await browser.close(); }
await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`PASS: ${results.join('\n')}`);
