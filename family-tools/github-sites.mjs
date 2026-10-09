import { spawnSync } from 'node:child_process';

const repositories = ['isi','isi-share','general-database','exchange-rate','pl-isi','price','pricing-form','sales-report','sales-target','isi-ext'];
const [operation = 'status', selected] = process.argv.slice(2);
if (!['status','create-extension-repository','enable-pages','runs','dispatch'].includes(operation) || (selected && !repositories.includes(selected))) throw new Error('Unsupported operation or repository');
const credential = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true });
if (credential.status !== 0) throw new Error('GitHub authentication is unavailable through the configured Git credential helper');
const fields = Object.fromEntries(credential.stdout.split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
if (!fields.password) throw new Error('No GitHub credential was returned');

async function request(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${fields.password}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Islandsun-site-release', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok && response.status !== 404) throw new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}: ${data?.message || 'Request failed'}`);
  return { status: response.status, data };
}

if (operation === 'create-extension-repository') {
  const existing = await request('/repos/budhi-halim/isi-ext');
  if (existing.status === 404) {
    const account = await request('/user');
    if (account.data?.login !== 'budhi-halim') throw new Error('The Git account does not own the requested repository');
    const created = await request('/user/repos', 'POST', { name: 'isi-ext', description: 'Islandsun browser extensions, downloads and setup guide.', private: false, auto_init: false });
    console.log(JSON.stringify({ repository: created.data.full_name, url: created.data.html_url, created: true }));
  } else console.log(JSON.stringify({ repository: existing.data.full_name, created: false }));
} else {
  for (const repo of selected ? [selected] : repositories) {
    const base = `/repos/budhi-halim/${repo}`;
    if (operation === 'runs') {
      const { data } = await request(`${base}/actions/workflows/pages.yml/runs?per_page=3`);
      console.log(JSON.stringify({ repo, runs: (data?.workflow_runs || []).map(run => ({ id: run.id, status: run.status, conclusion: run.conclusion, sha: run.head_sha, url: run.html_url })) }));
      continue;
    }
    if (operation === 'dispatch') {
      await request(`${base}/actions/workflows/pages.yml/dispatches`, 'POST', { ref: 'master' });
      console.log(JSON.stringify({ repo, dispatched: true }));
      continue;
    }
    const metadata = await request(base);
    if (metadata.status === 404) { console.log(JSON.stringify({ repo, exists: false })); continue; }
    const pages = await request(`${base}/pages`);
    if (operation === 'enable-pages') {
      await request(`${base}/pages`, pages.status === 404 ? 'POST' : 'PUT', { build_type: 'workflow' });
      console.log(JSON.stringify({ repo, pages: 'workflow' }));
    } else console.log(JSON.stringify({ repo, exists: true, private: metadata.data.private, branch: metadata.data.default_branch, pages: pages.status === 404 ? null : { buildType: pages.data.build_type, url: pages.data.html_url, source: pages.data.source } }));
  }
}
