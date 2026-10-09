import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const built = process.env.ISI_PREVIEW_BUILT === '1';
const allowedRepositories = new Set(['isi', 'isi-share', 'pricing-form', 'price', 'pl-isi', 'sales-report', 'sales-target', 'isi-ext', 'general-database', 'exchange-rate']);
const allowedData = new Set(['isi/data/app_list.json', 'isi-share/data/app_list.json', 'pl-isi/data/products.json', 'pl-isi/data/product_tags.json', 'pl-isi/data/last_updated.txt', 'general-database/data/sales_orders.json', 'general-database/data/stock_requests.json', 'general-database/data/sample_requests.json', 'general-database/data/last_production.json', 'general-database/data/technical_information.json', 'exchange-rate/data/today.json', 'exchange-rate/data/history.json']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? built ? '/isi/' : '/isi/family-review/' : url.pathname);
    const parts = pathname.split('/').filter(Boolean);
    if (!allowedRepositories.has(parts[0]) || parts.some(part => part.startsWith('.') || part.includes('\\') || part.includes(':')) || (parts.includes('data') && !allowedData.has(parts.join('/')))) {
      response.writeHead(403).end('This local preview does not serve private data or repository metadata.'); return;
    }
    let target = built ? path.resolve(workspace, parts[0], 'dist', ...parts.slice(1)) : path.resolve(workspace, ...parts);
    if (!target.startsWith(`${workspace}${path.sep}`)) { response.writeHead(403).end(); return; }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404).end('Preview resource not found.'); }
});
const port = Number(process.env.ISI_PREVIEW_PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`Islandsun ${built ? 'publishing' : 'source'} preview: http://127.0.0.1:${port}/isi/`));
server.on('error', error => { console.error(`Preview server: ${error.message}`); process.exitCode = 1; });
process.on('SIGINT', () => server.close());
