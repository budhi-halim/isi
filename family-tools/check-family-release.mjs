import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const base = process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4173';
const output = await mkdtemp(path.join(tmpdir(), 'islandsun-family-release-'));
const paths = ['isi/','isi-share/','pl-isi/','price/','pricing-form/','sales-report/','sales-target/','exchange-rate/','isi-ext/', ...['index','sales-orders','stock-requests','sample-requests','last-production','technical-information'].map(name => `general-database/${name}.html`)];
const sizes = [[360,640],[430,740],[768,600],[1440,900],[2560,1440],[740,360]];
const results = [];

for (const channel of ['chrome','msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ viewport: { width:1440,height:900 }, permissions: ['clipboard-read','clipboard-write'] });
  const failures = [];
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  await context.addInitScript(() => {
    window.process_files = () => ({ type:'error',message:'Synthetic test result' });
    window.prepare_files = () => ({ type:'error',message:'Synthetic test result' });
    window.finalize_files = () => ({});
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.hostname === 'pyscript.net') return route.fulfill({contentType:'text/javascript',body:''});
    if (url.hostname === 'budhi-halim.github.io' && /^\/(exchange-rate|general-database)\/data\/[\w.-]+\.(json|txt)$/.test(url.pathname)) {
      return route.fulfill({body:await readFile(path.join(root,url.pathname.slice(1))),contentType:'application/json'});
    }
    return route.abort();
  });
  try {
    const headers = [];
    for (const route of paths) {
      await page.setViewportSize({width:1440,height:900});
      await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
      await page.goto(`${base}/${route}`);
      if (route === 'pl-isi/' || route.startsWith('sales-')) await page.locator('#workspace-content').waitFor({state:'visible'});
      if (['isi/','isi-share/'].includes(route)) await page.locator('#launcher-status').waitFor({state:'hidden'});
      const toggle = page.locator('#theme-toggle');
      await toggle.locator('svg').waitFor();
      assert.equal(await toggle.getAttribute('data-scheme'),'light',route);
      assert.equal(await toggle.locator('svg').evaluate(node => getComputedStyle(node).animationName),'isi-theme-sun',route);
      await toggle.focus();
      await page.keyboard.press('Space');
      assert.equal(await toggle.getAttribute('data-scheme'),'dark',route);
      assert.equal(await toggle.locator('svg').evaluate(node => getComputedStyle(node).animationName),'isi-theme-moon',route);
      await page.keyboard.press('Enter');
      assert.equal(await toggle.getAttribute('data-scheme'),'light',route);
      headers.push({route,height:(await page.locator('.isi-header').boundingBox()).height});
      await page.reload();
      for (const scheme of ['light','dark']) {
        await page.emulateMedia({colorScheme:scheme});
        for (const [width,height] of sizes) {
          await page.setViewportSize({width,height});
          const geometry = await page.evaluate(() => ({
            horizontal:document.documentElement.scrollWidth-innerWidth,
            vertical:document.documentElement.scrollHeight-innerHeight,
            fixed:document.body.matches('.isi-data-workspace,.workbook-app'),
            header:document.querySelector('.isi-header').getBoundingClientRect().height,
          }));
          assert.ok(geometry.horizontal <= 1,`${channel} ${route} ${width} horizontal ${JSON.stringify(geometry)}`);
          if (geometry.fixed) assert.ok(geometry.vertical <= 1,`${channel} ${route} ${width} vertical ${JSON.stringify(geometry)}`);
          if (width > 600 && height > 420) {
            assert.equal(await toggle.getAttribute('data-scheme'),scheme);
          } else assert.equal(await toggle.isVisible(),false);
          if (channel === 'msedge' && [360,1440].includes(width)) {
            await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished)));
            await page.screenshot({path:path.join(output,`${route.replace(/\W/g,'-')}-${width}-${scheme}.png`),fullPage:false});
          }
        }
      }
      await page.setViewportSize({width:1440,height:900});
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await toggle.locator('svg').evaluate(node=>getComputedStyle(node).animationName),'none');
      if (route === 'isi-ext/') {
        await page.getByRole('button',{name:'Copy Chrome extensions address'}).click();
        assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'chrome://extensions');
        assert.equal(await page.locator('a[download]').count(),3);
        assert.ok((await page.locator('[data-version="workspace"]').innerText()).startsWith('Version 1.4.57'));
      }
      results.push(`${channel}: ${route} — themes, keyboard, reduced motion and six viewport sizes`);
    }
    assert.ok(Math.max(...headers.map(item=>item.height))-Math.min(...headers.map(item=>item.height)) <= 1,`Header mismatch: ${JSON.stringify(headers)}`);
    assert.deepEqual(failures,[]);
  } finally { await browser.close(); }
}
await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
console.log(`PASS ${results.length} page/browser combinations; ${output}`);
