import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const canonical = fileURLToPath(new URL('./site-build/', import.meta.url));
const sites = {
  isi: { extra: ['family', 'data/app_list.json'] },
  'isi-share': { extra: ['data/app_list.json'] },
  'general-database': { extra: ['sales-orders.html', 'stock-requests.html', 'sample-requests.html', 'last-production.html', 'technical-information.html', ...['sales_orders','stock_requests','sample_requests','last_production','technical_information'].map(name => `data/${name}.json`)], workflow: 'Fetch JSON Data' },
  'exchange-rate': { extra: ['data/today.json', 'data/history.json', 'data/candidates.json'], workflow: 'Fetch Exchange Rate' },
  'pl-isi': { extra: ['data/products.json', 'data/product_tags.json', 'data/last_updated.txt'], workflow: 'Product scrape' },
  price: {},
  'pricing-form': {},
  'sales-report': { extra: ['py/main.py', 'config.json'] },
  'sales-target': { extra: ['py/main.py', 'config.json'] },
  'isi-ext': { extra: ['extension-versions.json'], extensions: [
    { directory: 'Islandsun-Portal-Workspace', include: ['manifest.json','popup.html','offline.html','offline-parser.html','content.js','css','js','assets'] },
    { directory: 'Islandsun-Revenue', include: ['manifest.json','popup.html','popup.js','scraper.html','scraper.js','xlsx.full.min.js','css','js','assets'] },
    { directory: 'IslandSun-AutoFeedback', include: ['manifest.json','popup.html','content.js','css','js','assets'] },
  ] },
};

for (const [name, site] of Object.entries(sites)) {
  const root = path.join(workspace, name);
  const include = ['index.html'];
  for (const folder of ['css','js','assets']) {
    try { await access(path.join(root, folder)); include.push(folder); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  include.push(...site.extra || []);
  await writeFile(path.join(root, 'site-build.json'), JSON.stringify({ schema: 1, include, ...(site.extensions ? { extensions: site.extensions } : {}) }, null, 2) + '\n');
  const tools = name === 'isi' ? 'family-tools/site-build' : 'tools/site-build';
  if (name !== 'isi') {
    await mkdir(path.join(root, tools), { recursive: true });
    for (const filename of ['build.mjs','package.json','package-lock.json','README.md']) {
      await writeFile(path.join(root, tools, filename), await readFile(path.join(canonical, filename)));
    }
  }
  const dataTrigger = site.workflow ? `  workflow_run:\n    workflows: [${JSON.stringify(site.workflow)}]\n    types: [completed]\n    branches: [master]\n` : '';
  const deploymentUrl = '${{ steps.deployment.outputs.page_url }}';
  const workflow = `name: Publish site

on:
  push:
    branches: [master]
  workflow_dispatch:
${dataTrigger}
permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: master
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: ${tools}/package-lock.json
      - name: Install build tools
        run: npm ci --prefix ${tools} --ignore-scripts --no-audit --no-fund
      - name: Build minified site
        run: node ${tools}/build.mjs
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist
  deploy:
    needs: build
    permissions:
      pages: write
      id-token: write
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${deploymentUrl}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
`;
  await mkdir(path.join(root, '.github/workflows'), { recursive: true });
  await writeFile(path.join(root, '.github/workflows/pages.yml'), workflow);
  const ignoreFile = path.join(root, '.gitignore');
  let ignore = await readFile(ignoreFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return ''; });
  const rules = ['!/site-build.json','!/.github/','!/.github/workflows/','!/.github/workflows/pages.yml','/dist/','/.site-build-*/',`/${tools}/node_modules/`];
  if (name !== 'isi') rules.unshift('!/tools/','!/tools/site-build/','!/tools/site-build/**');
  for (const rule of rules) if (!ignore.split(/\r?\n/).includes(rule)) ignore += `\n${rule}`;
  await writeFile(ignoreFile, ignore.trimEnd() + '\n');
  console.log(`Prepared ${name} publishing configuration`);
}
