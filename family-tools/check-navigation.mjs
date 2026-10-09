import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = 'http://127.0.0.1:4173';

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/\/(isi|isi-share)\/data\/app_list.json/.test(url)) return route.fulfill({ json: [{ name: 'Pricing Form', url: `${base}/pricing-form/` }] });
    return url.startsWith(base) ? route.continue() : route.abort();
  });
  try {
    const launcher = await context.newPage();
    await launcher.goto(`${base}/isi/`);
    await launcher.waitForFunction(() => document.querySelector('.app-link')?.href.includes('isi-launch='));
    const launchUrl = await launcher.locator('.app-link').getAttribute('href');
    const opened = context.waitForEvent('page');
    await launcher.locator('.app-link').click();
    const app = await opened;
    await app.waitForLoadState();
    await app.waitForFunction(() => document.querySelector('[data-family-home]')?.href.endsWith('/isi/'));
    assert.ok(!app.url().includes('isi-launch='));
    assert.equal(await app.locator('h1').evaluate(element => getComputedStyle(element).userSelect), 'none');
    assert.equal(await app.locator('#customer-name').evaluate(element => getComputedStyle(element).userSelect), 'text');
    assert.equal(await app.locator('#a4-document').evaluate(element => getComputedStyle(element).userSelect), 'none');
    await app.locator('#customer-name').fill('Selectable input');
    await app.keyboard.press('Control+a');
    assert.equal(await app.locator('#customer-name').evaluate(input => input.selectionEnd - input.selectionStart), 16);
    await app.reload();
    await app.locator('[data-family-home]').first().waitFor();
    assert.ok((await app.locator('[data-family-home]').first().getAttribute('href')).endsWith('/isi-share/'));
    const forged = await context.newPage();
    await forged.goto(`${base}/pricing-form/?isi-launch=00000000-0000-0000-0000-000000000000`);
    await forged.waitForTimeout(2200);
    assert.ok((await forged.locator('[data-family-home]').first().getAttribute('href')).endsWith('/isi-share/'));
    const shared = await context.newPage();
    await shared.goto(`${base}/isi-share/`);
    await shared.waitForFunction(() => document.querySelector('.app-link')?.href.includes('isi-launch='));
    const sharedApp = await context.newPage();
    await sharedApp.goto(await shared.locator('.app-link').getAttribute('href'));
    await sharedApp.waitForTimeout(200);
    assert.ok((await sharedApp.locator('[data-family-home]').first().getAttribute('href')).endsWith('/isi-share/'));
    await launcher.close();
    const expired = await context.newPage();
    await expired.goto(launchUrl);
    await expired.waitForTimeout(2200);
    assert.ok((await expired.locator('[data-family-home]').first().getAttribute('href')).endsWith('/isi-share/'));
    const unavailable = await context.newPage();
    await unavailable.addInitScript(() => { window.BroadcastChannel = undefined; });
    await unavailable.goto(launchUrl);
    assert.ok((await unavailable.locator('[data-family-home]').first().getAttribute('href')).endsWith('/isi-share/'));
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(launchUrl);
    await freshPage.waitForTimeout(2200);
    assert.ok((await freshPage.locator('[data-family-home]').first().getAttribute('href')).endsWith('/isi-share/'));
    await freshContext.close();
    for (const name of ['price', 'pl-isi', 'sales-report', 'sales-target']) {
      const other = await context.newPage();
      await other.goto(`${base}/${name}/`);
      assert.equal(await other.locator('body').evaluate(body => getComputedStyle(body).userSelect), 'none');
      const editable = other.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"])').first();
      if (await editable.count()) assert.equal(await editable.evaluate(input => getComputedStyle(input).userSelect), 'text');
      await other.evaluate(origin => { const home = document.createElement('a'); home.id = 'fixture-home'; home.href = `${origin}/isi/`; home.textContent = 'All apps'; document.body.append(home); }, base);
      await other.waitForFunction(() => document.querySelector('#fixture-home').href.endsWith('/isi-share/'));
      await other.close();
    }
    console.log(`${channel}: confirmed internal launch; shared/direct/reload/forged/closed-launcher/new-session/unsupported-channel fallback; editable inputs and nonselectable pricing chrome/document passed`);
    console.log(`${channel}: selection and default navigation integration in Price Calculator, Product List, Sales Report, and Sales Target passed; their existing data/runtime workflows were not exercised`);
  } finally { await browser.close(); }
}
