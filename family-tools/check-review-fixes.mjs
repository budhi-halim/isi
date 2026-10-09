import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { filterTable, readTableState, writeTableState } from '../family/js/table-logic.js';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = 'http://127.0.0.1:4173';
const output = new URL('./evidence/review-fixes/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
const columns = [{ key: 'pic', filter: true }, { key: 'type', filter: true }];
const state = readTableState('?f-pic=A&f-pic=B&f-type=One&f-pic=A', columns);
assert.deepEqual(state.filters.pic, ['A', 'B']);
assert.deepEqual(readTableState(writeTableState(state), columns), state);
const rows = [['A', 'One'], ['B', 'One'], ['C', 'One'], ['A', 'Two']].map(([pic, type], id) => ({ id, values: { pic, type }, search: `${pic} ${type}`.toLowerCase() }));
assert.deepEqual(filterTable(rows, columns, state).rows.map(row => row.id).sort(), [0, 1]);
results.push('Multi-select OR within columns, AND between columns, repeated URL parameters, deduplication and legacy single-value URL support');

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const records = [
      { sr_date: '2026-09-01', sr_no: '001', sr_pic: 'Alpha', sr_srtype: 'One', sr_status: 'Ready' },
      { sr_date: '2026-09-02', sr_no: '002', sr_pic: 'Beta', sr_srtype: 'One', sr_status: 'Ready' },
      { sr_date: '2026-09-03', sr_no: '003', sr_pic: 'Gamma', sr_srtype: 'Two', sr_status: 'Other' },
      { sr_date: '2026-09-04', sr_no: '004', sr_pic: 'Alpha', sr_srtype: 'Two', sr_status: 'Other' }
    ];
    await page.route('**/general-database/data/sample_requests.json', route => route.fulfill({ json: { data: records } }));
    await page.goto(`${base}/general-database/sample-requests.html`);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
    const filter = label => page.locator('.workspace-multiselect').filter({ has: page.locator('summary > span:first-child', { hasText: new RegExp(`^${label}$`) }) });
    await filter('PIC').locator('summary').click();
    await page.getByRole('checkbox', { name: 'Alpha', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Beta', exact: true }).check();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
    await page.keyboard.press('Escape');
    await filter('Type').locator('summary').click(); await page.getByRole('checkbox', { name: 'One', exact: true }).check(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    assert.deepEqual(new URL(page.url()).searchParams.getAll('f-sr_pic'), ['Alpha', 'Beta']);
    await page.reload(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    await page.locator('.workspace-columns summary').click();
    await page.locator('.workspace-columns').getByRole('checkbox', { name: 'PIC', exact: true }).uncheck();
    await filter('PIC').locator('summary').click();
    assert.equal(await page.getByRole('checkbox', { name: 'Beta', exact: true }).isChecked(), true);
    await page.getByRole('checkbox', { name: 'Beta', exact: true }).uncheck(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    const visible = page.locator('.workspace-columns input:checked');
    while (await visible.count() > 1) await visible.first().uncheck();
    for (let index = 0; index < 8; index++) await visible.last().click();
    assert.equal(await visible.count(), 1);
    assert.equal(await page.locator('.isi-toast').count(), 1);
    assert.match(await page.locator('.isi-toast').innerText(), /at least one column/);
    await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
    assert.equal(new URL(page.url()).searchParams.has('f-sr_pic'), false);
    results.push(`${channel}: multi-select via keyboard/touch-friendly checkboxes; combined filters, URL reload/reset, hidden-column filtering, last-column toast deduplication/dismissal`);

    await page.goto(`${base}/pricing-form/`);
    for (let index = 0; index < 5; index++) await page.locator('#generate-document').click();
    assert.equal(await page.locator('.isi-toast').count(), 1);
    assert.ok(await page.locator('[aria-invalid="true"]').count() > 0);
    assert.ok(await page.locator('.isi-field-error').count() > 0);
    await page.locator('#reset-form').click();
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);

    // Fetch the actual public source; fixture routes are deliberately absent for rates.
    const rateRequests = [];
    page.on('request', request => { if (request.url().includes('/exchange-rate/data/')) rateRequests.push(request.url()); });
    await page.goto(`${base}/price/`);
    await page.locator('#rate-status').waitFor({ state: 'hidden', timeout: 45000 });
    assert.match(await page.locator('#rate-value').innerText(), /\d/);
    await page.goto(`${base}/exchange-rate/`);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, null, { timeout: 45000 });
    assert.equal(await page.getByRole('link', { name: 'Current JSON' }).getAttribute('href'), 'https://budhi-halim.github.io/exchange-rate/data/today.json');
    await page.goto(`${base}/pl-isi/`);
    await page.locator('#workspace-content').waitFor({ state: 'visible', timeout: 45000 });
    assert.equal(await page.locator('#productTable tbody tr').count(), 6190);
    assert.equal(await page.getByRole('columnheader').count(), 4);
    assert.equal(await page.locator('#rate-warning').isVisible(), false);
    assert.ok(rateRequests.length >= 4);
    assert.ok(rateRequests.every(url => url.startsWith('https://budhi-halim.github.io/exchange-rate/data/')));
    assert.equal(await page.locator('#searchInput').getAttribute('placeholder'), 'Search product name or code...');
    assert.equal(await page.getByText('Search help', { exact: true }).count(), 0);
    const searchBar = await page.locator('.product-filters').boundingBox(); assert.ok(searchBar.height <= 70);
    await page.evaluate(() => window.scrollTo(0, 2000));
    assert.ok((await page.locator('.product-filters').boundingBox()).y <= 1);
    await page.getByRole('button', { name: 'Back to top', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Back to top', exact: true }).click();
    await page.waitForFunction(() => scrollY === 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.getByRole('button', { name: 'Back to top', exact: true }).click();
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const query = page.locator('#searchInput');
    await query.fill('zz-no-match'); await query.fill('#o'); await query.fill('vanilla');
    await page.waitForFunction(() => document.querySelector('#productTable')?.closest('.isi-table-region').getAttribute('aria-busy') === 'false' && !document.querySelector('#noResults').hidden === false);
    await page.waitForFunction(() => [...document.querySelectorAll('#productTable tbody tr')].every(row => row.innerText.toLowerCase().includes('vanilla')) && document.querySelectorAll('#productTable tbody tr').length > 0);
    await page.locator('.product-name').first().click(); await page.locator('#production-dialog').waitFor({ state: 'visible' }); await page.keyboard.press('Escape');
    await page.locator('[data-action="copy"]').first().click(); await page.getByRole('button', { name: 'Copied', exact: true }).waitFor();
    results.push(`${channel}: live GitHub rates loaded in all three consumers; compact sticky Product List, floating top control, reduced motion, rapid worker queries, copy/detail interactions and all 6,190 rows preserved`);

    await page.route('**/pyscript.net/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    const readyWorkbook = async repo => {
      await page.goto(`${base}/${repo}/`);
      await page.evaluate(() => {
        window.process_files = () => ({ type: 'error', message: 'Fixture error' });
        window.prepare_files = () => ({ type: 'error', message: 'Fixture error' });
        window.finalize_files = () => ({}); window.dispatchEvent(new Event('py:all-done'));
      });
      await page.locator('#workspace-content').waitFor({ state: 'visible' });
    };
    for (const [width, height] of [[360, 640], [430, 740], [768, 1024], [1600, 900], [2560, 1600], [740, 360]]) {
      await page.setViewportSize({ width, height });
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const repo of ['sales-report', 'sales-target']) {
          await readyWorkbook(repo);
          assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, `${repo} vertical ${width}x${height}`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${repo} horizontal ${width}x${height}`);
          await page.locator('#processButton').click();
          assert.equal(await page.locator('.isi-toast').count(), 1);
          await page.locator('#reset-files').click();
          assert.equal(await page.locator('.isi-toast').count(), 0);
          if (channel === 'chrome' && [360, 1600, 740].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`${repo}-${width}-${scheme}.png`, output)) });
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const repo of ['pl-isi/', 'general-database/sample-requests.html']) {
      await page.goto(`${base}/${repo}`);
      if (repo === 'pl-isi/') await page.locator('#workspace-content').waitFor({ state: 'visible' });
      else await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      if (repo.startsWith('general-')) {
        await filter('Feedback').locator('summary').click();
        const bounds = await filter('Feedback').locator('.filter-panel').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 845);
      }
      if (channel === 'chrome') await page.screenshot({ path: fileURLToPath(new URL(`${repo.startsWith('pl') ? 'products' : 'viewer'}-mobile.png`, output)) });
    }
    assert.deepEqual(errors, []);
    results.push(`${channel}: workbook viewport containment in both themes at six sizes including landscape; usable actions, errors/reset, mobile table bounds and filter popover bounds`);
  } finally { await browser.close(); }
}
await writeFile(new URL('results.json', output), `${JSON.stringify(results, null, 2)}\n`);
console.log(results.join('\n'));
