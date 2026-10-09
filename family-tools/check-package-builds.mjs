import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { unzipSync } = require('./site-build/node_modules/fflate');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = fileURLToPath(new URL('../../isi-ext/', import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), 'islandsun-package-check-'));
const report = JSON.parse(await readFile(path.join(root, 'dist/build-info.json'), 'utf8'));
const versions = JSON.parse(await readFile(path.join(root, 'dist/extension-versions.json'), 'utf8')).extensions;
const ids = { 'Islandsun-Portal-Workspace': 'workspace', 'Islandsun-Revenue': 'revenue', 'IslandSun-AutoFeedback': 'feedback' };
assert.equal(report.packages.length, 3);

for (const item of report.packages) {
  const entries = unzipSync(await readFile(path.join(root, 'dist', item.file)));
  const folder = Object.keys(entries)[0].split('/')[0];
  const extension = path.join(output, folder);
  const exists = relative => assert.ok(entries[`${folder}/${relative}`], `${folder}: missing ${relative}`);
  for (const [name, content] of Object.entries(entries)) {
    assert.ok(name.startsWith(`${folder}/`) && !name.split('/').some(part => part.startsWith('.')));
    assert.ok(!/(?:^|\/)(?:tests?|review|diagnostics|dev|node_modules)(?:\/|$)/i.test(name));
    assert.ok(!/AGENTS\.md|\.log$/i.test(name));
    const filename = path.resolve(output, name);
    assert.ok(filename.startsWith(`${extension}${path.sep}`));
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content);
    if (name.endsWith('.css')) {
      const css = Buffer.from(content).toString('utf8');
      for (const match of css.matchAll(/(?:@import\s*["']([^"']+)["']|url\(\s*["']?([^\s"')]+)["']?\s*\))/g)) {
        const reference = match[1] || match[2];
        if (/^(?:data:|https?:|#)/.test(reference)) continue;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), reference.split(/[?#]/)[0]));
        assert.ok(entries[resolved], `${name}: missing CSS resource ${reference}`);
      }
    }
  }
  const manifest = JSON.parse(Buffer.from(entries[`${folder}/manifest.json`]).toString('utf8'));
  assert.equal(manifest.version, versions[ids[folder]].version);
  for (const relative of [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons || {}), ...(manifest.content_scripts || []).flatMap(script => [...script.js || [], ...script.css || []])]) exists(relative);
  const profile = await mkdtemp(path.join(output, 'profile-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true, viewport: { width: 400, height: 600 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP apps.islandsunindonesia.com ~NOTFOUND'] });
  try {
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension:') ? route.continue() : route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    await worker.evaluate(() => { globalThis.fetch = async () => { throw new TypeError('Offline verification fixture'); }; });
    assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), manifest.version);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL(`../${manifest.action.default_popup}`, worker.url()).href);
    await page.locator('main').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (ids[folder] === 'workspace') {
      await page.goto(new URL('../offline.html', worker.url()).href);
      await page.locator('#offline-sign-in').waitFor({ state: 'visible' });
      await page.locator('body[data-auth-ready="true"]').waitFor();
      assert.ok(await page.locator('#offline-unlock').isVisible());
      assert.equal(await page.locator('body').getAttribute('data-access'), 'locked');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${folder} ${manifest.version}: package resources, worker, popup${ids[folder] === 'workspace' ? ', protected offline login' : ''}`);
  } finally { await context.close(); }
}
console.log(`Package evidence: ${output}`);
