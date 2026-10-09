import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { calculatePrice } from '../../price/js/logic.js';
import { filterProducts, productionMap, productTags, displayPrice, isOrdered } from '../../pl-isi/js/logic.js';
import { filterTable, readTableState, numericValue } from '../family/js/table-logic.js';
import { createGrouping, moveArea, moveGroup, removeGroup, groupingOutput } from '../family/js/workbook-logic.js';
import { normalizeExchange } from '../family/js/exchange-logic.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4174';
const output = new URL('./evidence/checkpoint-6-7/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
const json = async url => JSON.parse(await readFile(url, 'utf8'));

// === Calculation and data invariants ===
for (const usd of [0, .1, 1.25, 2.55, 19.95, 999.99]) for (const year of [2000, 2025, 2026, 2027, 2100]) for (const current of [2026, 2027]) for (const rate of [null, 15000, 16400]) {
  const value = calculatePrice(usd, year, current, rate);
  const spices = Math.round(usd * Math.pow(1 + .005, Math.max(current - year, 0)) * (1 + .1) * 10) / 10;
  const seasoning = Math.round(usd * Math.pow(1 + .015, Math.max(current - year, 0)) * (1 + .2) * 10) / 10;
  assert.deepEqual(value, { spices, seasoning, bottomIdr: rate ? Math.round(usd * rate / 1000) * 1000 : null, spicesIdr: rate ? Math.round(spices * rate / 1000) * 1000 : null, seasoningIdr: rate ? Math.round(seasoning * rate / 1000) * 1000 : null });
}
const products = await json(new URL('../../pl-isi/data/products.json', import.meta.url));
const lastProductionMap = productionMap(await json(new URL('../../general-database/data/last_production.json', import.meta.url)));
const tags = productTags(await json(new URL('../../pl-isi/data/product_tags.json', import.meta.url)));
const data = { products, lastProductionMap, tagsMap: tags.map, rawTagsList: tags.rawList, rate: 16000 };
const searchBaseline = await json(new URL('./product-search-baseline.json', import.meta.url));
for (const test of searchBaseline) {
  const result = filterProducts({ ...data, rate: test.rate }, test);
  assert.equal(result.invalid, test.invalid);
  assert.equal(result.products.length, test.count);
  assert.equal(createHash('sha256').update(JSON.stringify(result.products.map(product => product.product_code))).digest('hex'), test.hash);
}
const expected = products.filter(product => isOrdered(lastProductionMap.get(String(product.product_code || '').replace(/^\*/, '').trim().replace(/\s+/g, ' ').toLowerCase())));
for (const tag of ['o', 'or', 'ord', 'orde', 'order', 'ordere', 'ordered']) assert.deepEqual(filterProducts(data, { query: `#${tag}` }).products, expected);
assert.equal(filterProducts(data, { query: '#unknown' }).invalid, true);
assert.equal([...tags.map.values()].flat().some(tag => tag.tag === 'ordered'), false);
assert.equal(displayPrice('2.1', 16000), '2.1 (34,000)');
assert.equal(displayPrice('34000', 16000), '34,000 (2.2)');
const parser = await readFile(new URL('../../pl-isi/js/advanced_search.js', import.meta.url));
const baseline = await json(new URL('./baseline-6-7.json', import.meta.url));
assert.equal(createHash('sha256').update(parser).digest('hex'), baseline['pl-isi/js/advanced_search.js']);
for (const [relative, hash] of Object.entries(baseline).filter(([relative]) => relative.includes('/data/') || relative.endsWith('.py'))) {
  // The technical-information fetcher has separate pipeline regression coverage.
  if (relative === 'general-database/src/main.py' || relative.endsWith('/data/app_list.json')) continue;
  assert.equal(createHash('sha256').update(await readFile(new URL(`../../${relative}`, import.meta.url))).digest('hex'), hash, relative);
}
results.push('180 calculator cases; 65 original search/filter traces; full-data ordered prefixes; original parser, datasets and operational Python hashes preserved (database fetcher tested separately)');

const model = createGrouping(['A', 'B', 'C']);
moveArea(model, -1, 0, 0); moveArea(model, -1, 0, 0); moveArea(model, 0, 0, 0, 2);
assert.deepEqual(model.groups[0], ['B', 'A']);
moveGroup(model, 0, 1); removeGroup(model, 1);
assert.deepEqual(model.bench, ['C', 'B', 'A']); assert.deepEqual(groupingOutput(model), []);
const columns = [{ key: 'date', type: 'date' }, { key: 'amount', type: 'number' }, { key: 'status', filter: true }];
for (const [text, value] of [['12.500.000', 12500000], ['12,500,000', 12500000], ['12.500,25', 12500.25], ['1,250.125', 1250.125], ['12.500.1', null], ['FREE', null]]) assert.equal(numericValue(text, 'grouped'), value);
const state = { ...readTableState('?sort=amount&dir=asc&size=100&page=900&f-status=A', columns), query: 'needle' };
const rows = [10, 2, 100, null].map((value, id) => ({ id, values: { date: '2026-01-01', amount: value === null ? '' : String(value), status: 'A' }, search: 'needle' }));
const filtered = filterTable(rows, columns, state, 'date'); assert.deepEqual(filtered.rows.map(row => row.id), [1, 0, 2, 3]); assert.equal(filtered.page, 1);
const rate = { date: '2026-08-01', final: false, candidates_count: 1, generated_ts_utc: '2026-08-01T10:00:01Z', selected_source_ts: { e_rate: '2026-08-01T10:00:00Z', tt_counter: '2026-08-01T10:00:00Z', bank_notes: '2026-08-01T10:00:00Z' } };
for (const category of ['e_rate', 'tt_counter', 'bank_notes']) for (const side of ['buying', 'selling']) { rate[`${category}_${side}_rate`] = 16000; rate[`${category}_${side}_rate_buffered`] = 16500; }
const historicalRate = { date: '2026-07-31', source_ts: rate.selected_source_ts, note: 'finalized from 2 candidates', ...Object.fromEntries(Object.entries(rate).filter(([key]) => key.endsWith('_rate') || key.endsWith('_buffered'))) };
assert.equal(normalizeExchange(rate, [historicalRate]).length, 6); assert.equal(normalizeExchange(rate, [historicalRate])[0].state, 'Provisional');
results.push('Grouping order and single assignment; numeric sorting, missing values, page clamping and exchange schema');

// === Browser behavior ===
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const [name, count] of [['sales-orders', 17599], ['stock-requests', 21125], ['sample-requests', 11331], ['last-production', 836]]) {
      await page.goto(`${base}/general-database/${name}.html`);
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 25);
      assert.equal(Number((await page.locator('.workspace-footer').innerText()).split(' of ')[0].replace(/[^0-9]/g, '')), count);
      await page.getByLabel('Rows', { exact: true }).selectOption('100');
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 100);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('page') === '2');
      await page.reload(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 100);
      assert.equal(new URL(page.url()).searchParams.get('page'), '2');
      await page.getByRole('button', { name: /^View record/ }).first().click(); await page.locator('dialog').waitFor({ state: 'visible' }); await page.keyboard.press('Escape');
      await page.locator('.workspace-table-tools > summary').click();
      await page.getByLabel('Search', { exact: true }).fill('zz-no-match-zz');
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0);
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 25);
    }
    await page.route('**/exchange-rate/data/today.json', route => route.fulfill({ json: null }));
    await page.route('**/exchange-rate/data/history.json', route => route.fulfill({ json: [] }));
    await page.goto(`${base}/exchange-rate/`);
    await page.getByText('No records are available.', { exact: true }).waitFor();
    await page.locator('.workspace-table-tools > summary').click();
    await page.route('**/exchange-rate/data/today.json', route => route.fulfill({ json: rate }));
    await page.route('**/exchange-rate/data/history.json', route => route.fulfill({ json: [historicalRate] }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 6);
    await page.locator('.workspace-multiselect').filter({ has: page.locator('summary > span:first-child', { hasText: /^Period$/ }) }).locator('summary').click();
    await page.getByRole('checkbox', { name: 'Current', exact: true }).check(); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
    await page.goto(`${base}/pl-isi/`); await page.locator('#workspace-content').waitFor({ state: 'visible' });
    await page.locator('#searchInput').fill('#ord'); await page.waitForFunction(count => document.querySelectorAll('#productTable tbody tr').length === count, expected.length);
    assert.equal(await page.locator('.tag-badge').filter({ hasText: /^O$/ }).count(), 0);
    await page.locator('.product-name').first().click(); await page.locator('#production-dialog').waitFor({ state: 'visible' }); await page.keyboard.press('Escape');
    await page.locator('#reset-filters').click(); await page.waitForFunction(count => document.querySelectorAll('#productTable tbody tr').length === count, products.length);
    await page.goto(`${base}/price/`); await page.locator('#rate-status').waitFor({ state: 'hidden' });
    await page.getByLabel('Bottom price USD row 1', { exact: true }).fill('2.5'); await page.getByLabel('Year row 1', { exact: true }).fill('2026');
    await page.getByRole('button', { name: 'Calculate', exact: true }).click(); assert.equal(await page.locator('.output-spices').first().textContent(), '$2.80');
    await page.getByRole('button', { name: 'Reset', exact: true }).click(); assert.equal(await page.locator('.input-usd').first().inputValue(), '');
    for (const repo of ['isi', 'isi-share']) {
      await page.goto(`${base}/${repo}/`); await page.locator('.app-link').first().waitFor();
      const apps = await json(new URL(`../../${repo}/data/app_list.json`, import.meta.url));
      assert.deepEqual(await page.locator('.app-link h2').allTextContents(), apps.map(app => app.name));
    }
    // Delay the real readiness dependencies; all three gates must render identical content.
    const loadingSnapshots = [];
    await page.route('**/pyscript.net/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**/pl-isi/data/products.json', route => new Promise(resolve => setTimeout(resolve, 800)).then(() => route.continue()));
    for (const repo of ['pl-isi', 'sales-report', 'sales-target']) {
      await page.goto(`${base}/${repo}/`);
      loadingSnapshots.push(await page.locator('.isi-loading').innerHTML());
      assert.equal(await page.locator('#workspace-content').isVisible(), false);
    }
    assert.equal(loadingSnapshots[0], loadingSnapshots[1]); assert.equal(loadingSnapshots[1], loadingSnapshots[2]);
    for (const repo of ['sales-report', 'sales-target']) {
      await page.goto(`${base}/${repo}/`);
      await page.evaluate(() => {
        window.calls = [];
        window.process_files = async infos => { window.calls.push(infos); await new Promise(resolve => setTimeout(resolve, 250)); return { type: 'success', message: 'Complete', buffer: [80, 75, 3, 4] }; };
        window.prepare_files = async infos => { window.calls.push(infos); return { type: 'success', areas: ['Area A', 'Area B'], multi_year: true }; };
        window.finalize_files = async (...args) => { window.finalized = args; return { type: 'success', message: 'Complete', buffer: [80, 75, 3, 4] }; };
        window.dispatchEvent(new Event('py:all-done'));
      });
      await page.locator('#workspace-content').waitFor({ state: 'visible' });
      await page.locator('#processButton').click(); await page.getByText('Choose at least one XLS or XLSX file.').waitFor();
      await page.locator('#files').setInputFiles({ name: 'fixture.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from([1, 2, 3]) });
      await page.locator('#processButton').click();
      await page.evaluate(() => document.querySelector('#extractForm').dispatchEvent(new Event('submit', { cancelable: true })));
      if (repo === 'sales-target') {
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.getByLabel('Destination for Area A').selectOption('0');
        await page.getByLabel('Destination for Area B').selectOption('0');
        await page.getByRole('button', { name: 'Move Area B up', exact: true }).click();
        await page.getByRole('button', { name: 'Process and download', exact: true }).last().click();
      }
      await page.waitForFunction(() => !document.querySelector('#processButton').disabled);
      assert.equal(await page.evaluate(() => window.calls.length), 1);
      assert.deepEqual(await page.evaluate(() => window.calls[0]), [{ name: 'fixture.xlsx', data: [1, 2, 3] }]);
      if (repo === 'sales-target') assert.deepEqual(await page.evaluate(() => window.finalized.slice(1)), [[['Area B', 'Area A']], true]);
      await page.locator('#reset-files').click(); assert.equal(await page.locator('#files').inputValue(), '');
    }
    // Responsive bounds and shared theme on all integrated interfaces.
    for (const [width, height] of [[360, 740], [430, 900], [768, 1024], [1600, 900], [2560, 1600]]) {
      await page.setViewportSize({ width, height });
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const path of ['isi/', 'isi-share/', 'pl-isi/', 'price/', 'general-database/stock-requests.html', 'exchange-rate/', 'sales-report/', 'sales-target/']) {
          await page.goto(`${base}/${path}`);
          if (path.startsWith('sales-')) await page.evaluate(() => { window.process_files = () => ({}); window.prepare_files = () => ({}); window.finalize_files = () => ({}); window.dispatchEvent(new Event('py:all-done')); });
          if (['pl-isi/', 'sales-report/', 'sales-target/'].includes(path)) await page.locator('#workspace-content').waitFor({ state: 'visible' });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${path} ${width} ${scheme} overflow`);
          if (channel === 'chrome' && width === 1600 && scheme === 'dark') await page.screenshot({ path: fileURLToPath(new URL(path.replace(/[/.]/g, '-') + '.png', output)) });
        }
      }
    }
    assert.deepEqual(errors, []);
    results.push(`${channel}: full datasets, URL restore, pagination/reset, details, rates, ordered tags, calculator, launchers, identical gates, duplicate-start guard, grouping and responsive themes`);
  } finally { await browser.close(); }
}
await writeFile(new URL('results.json', output), `${JSON.stringify(results, null, 2)}\n`);
console.log(results.join('\n'));
