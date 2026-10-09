import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4174';
const records = [
  { so_date: '2026-02-03', so_no: '0002', so_customer: '<b>Fixture Alpha</b><img src="x" onerror="window.injected=true">', so_status: 'approve', so_jenis: 'REGULER', so_total_spb: '100', view: '<a href="javascript:alert(1)">Unsafe</a>' },
  { so_date: '2026-01-02', so_no: '0001', so_customer: 'Fixture Beta', so_status: 'pending', so_jenis: 'REGULER', so_total_spb: '2', view: '<a href="http://apps.islandsunindonesia.com:81/islandsun/sales-order/edit/1">View</a>' },
  { so_date: '2026-02-01', so_no: '0003', so_customer: 'Fixture Gamma', so_status: 'approve', so_jenis: 'REGULER', so_total_spb: '10' },
  { so_no: '0004', so_customer: null, so_status: 'approve', so_total_spb: null }
];
const results = [];
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 740 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    let mode = 'ok';
    await page.route('**/general-database/data/sales_orders.json', route => {
      if (mode === 'failed') return route.fulfill({ status: 503, body: '' });
      if (mode === 'malformed') return route.fulfill({ contentType: 'application/json', body: '{' });
      return route.fulfill({ json: { data: records } });
    });
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        set onmessage(callback) {
          super.onmessage = event => {
            const stale = window.delayAlpha && event.data.rows?.length === 1 && event.data.rows[0].values.so_customer.includes('Alpha');
            setTimeout(() => callback(event), stale ? 800 : 0);
          };
        }
      };
    });
    await page.goto(`${base}/general-database/sales-orders.html`);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('tbody img').count(), 0);
    await page.getByRole('button', { name: 'SPB total', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('tbody tr td:nth-child(2)')?.textContent === '0001');
    await page.locator('.workspace-multiselect').filter({ has: page.locator('summary > span:first-child', { hasText: /^Status$/ }) }).locator('summary').click();
    await page.getByRole('checkbox', { name: 'approve', exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByLabel('From', { exact: true }).fill('2026-02-02');
    await page.getByLabel('Search', { exact: true }).fill('Alpha');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    const url = page.url(); await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1); assert.equal(page.url(), url);
    await page.getByRole('button', { name: /^View record/ }).click();
    assert.equal(await page.getByRole('link', { name: 'Open in Islandsun portal' }).count(), 0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Reset', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
    await page.getByLabel('Search', { exact: true }).fill('Beta'); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    await page.getByRole('button', { name: /^View record/ }).click();
    assert.match(await page.getByRole('link', { name: 'Open in Islandsun portal' }).getAttribute('href'), /sales-order\/edit\/1$/);
    await page.keyboard.press('Escape');
    mode = 'failed'; await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.locator('#viewer > [role="status"]').getByText('Refresh failed. Previously loaded records are still shown.').waitFor(); assert.equal(await page.locator('tbody tr').count(), 1);
    mode = 'malformed'; await page.reload(); await page.locator('#viewer > [role="status"]').filter({ hasText: 'Data is unavailable or has an unsupported format. Try again later.' }).waitFor();
    mode = 'ok'; await page.getByRole('button', { name: 'Try again' }).click(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    // Force stale worker replies to arrive last; the current query must retain ownership.
    await page.evaluate(() => {
      window.delayAlpha = true;
      const search = document.querySelector('input[type="search"]');
      search.value = 'Alpha'; search.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(190);
    await page.getByLabel('Search', { exact: true }).fill('Gamma');
    await page.waitForFunction(() => document.querySelector('tbody tr td:nth-child(3)')?.textContent === 'Fixture Gamma');
    await page.waitForTimeout(850);
    assert.equal(await page.locator('tbody tr td:nth-child(3)').textContent(), 'Fixture Gamma');
    await page.getByText('Columns', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'PO', exact: true }).uncheck();
    await page.waitForFunction(() => !new URL(location.href).searchParams.get('columns').split(',').includes('so_po_no'));
    await page.reload(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    assert.equal(await page.getByRole('columnheader', { name: 'PO', exact: true }).count(), 0);

    // Product data failures must not turn unknown production into unordered products.
    let productionFails = true;
    await page.route('**/general-database/data/last_production.json', route => productionFails ? route.fulfill({ status: 503, body: '' }) : route.continue());
    await page.goto(`${base}/pl-isi/`); await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    assert.equal(await page.locator('#workspace-content').isVisible(), false);
    productionFails = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await page.locator('#workspace-content').waitFor({ state: 'visible' });
    await page.locator('#searchInput').fill('#o'); await page.waitForFunction(() => document.querySelectorAll('#productTable tbody tr').length === 820);
    const code = await page.locator('.product-code span').first().innerText();
    await page.getByRole('button', { name: 'Copy product code', exact: true }).first().click();
    await page.getByRole('button', { name: 'Copied', exact: true }).first().waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);

    await page.route('**/pyscript.net/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(`${base}/sales-target/`);
    await page.evaluate(() => {
      window.prepare_files = async () => ({ type: 'success', areas: ['One', 'Two'], multi_year: true });
      window.finalize_files = async () => { window.finalizations = (window.finalizations || 0) + 1; return { type: 'error', message: '<p>Fixture validation</p><img src=x onerror="window.injected=true">' }; };
      window.dispatchEvent(new Event('py:all-done'));
    });
    await page.locator('#workspace-content').waitFor({ state: 'visible' });
    await page.locator('#files').setInputFiles({ name: 'fixture.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from([1]) });
    await page.locator('#processButton').click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#processButton').disabled);
    assert.equal(await page.evaluate(() => window.finalizations), undefined);
    await page.locator('#processButton').click(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#processButton').disabled);
    await page.locator('#processButton').click(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Process and download', exact: true }).last().click();
    await page.getByText('Fixture validation', { exact: true }).waitFor(); assert.equal(await page.evaluate(() => window.injected), undefined);
    // The Python message sink itself is inert before JavaScript receives a result.
    await page.evaluate(() => { document.getElementById('message').innerHTML = '<img src=x onerror="window.injected=true">'; });
    await page.waitForTimeout(50); assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.deepEqual(errors, []);
    results.push(`${channel}: combined filters, numeric order, URL columns, safe HTML/portal links, missing values, refresh/malformed/retry, rapid search, loading failure/recovery, copying, cancellation/restart and inert Python messages`);
  } finally { await browser.close(); }
}
await writeFile(new URL('./evidence/checkpoint-6-7/boundary-results.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
console.log(results.join('\n'));
