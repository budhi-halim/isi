import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4174';
const output = new URL('./evidence/checkpoint-6-7/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.ISI_BROWSER || 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.log('Browser diagnostic:', error.message.slice(0, 160)));
  for (const repo of ['sales-report', 'sales-target']) {
    await page.goto(`${base}/${repo}/`);
    await page.locator('#workspace-content').waitFor({ state: 'visible', timeout: 100000 });
    assert.equal(await page.locator('#processButton').isEnabled(), true);
    await page.locator('#files').setInputFiles(fileURLToPath(new URL('input-fixture.xlsx', output)));
    const download = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#processButton').click();
    if (repo === 'sales-target') {
      await page.getByLabel('Destination for Jakarta').selectOption('0');
      await page.getByLabel('Destination for Bandung').selectOption('0');
      await page.getByRole('button', { name: 'Move Bandung up', exact: true }).click();
      await page.getByRole('button', { name: 'Process and download', exact: true }).last().click();
    }
    const file = await download;
    await file.saveAs(fileURLToPath(new URL(`${repo}-browser-output.xlsx`, output)));
    await page.waitForFunction(() => !document.querySelector('#processButton').disabled);
    assert.match(await page.locator('#workbook-message').innerText(), /successfully/);
    results.push(`${repo}: real PyScript startup, fixture processing, workbook download and reset readiness`);
    console.log(results.at(-1));
  }
  await writeFile(new URL('pyscript-results.json', output), `${JSON.stringify(results, null, 2)}\n`);
} finally { await browser.close(); }
