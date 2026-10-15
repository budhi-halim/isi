import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const version = '1.3.11';
const source = path.resolve(fileURLToPath(new URL('../family/', import.meta.url)));
const workspace = path.dirname(path.dirname(source));
const targets = ['isi-share', 'pricing-form', 'price', 'pl-isi', 'sales-report', 'sales-target', 'general-database', 'exchange-rate', 'isi-ext/Islandsun-Revenue', 'isi-ext/IslandSun-AutoFeedback', 'isi-ext'];
const args = process.argv.slice(2);
const check = args.includes('--check');
const requested = args.find(value => value.startsWith('--target='))?.slice(9);
if (args.some(value => value !== '--check' && !value.startsWith('--target=')) || (requested && !targets.includes(requested))) throw new Error('Use --check and/or --target=<listed repository>.');
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const files = {};

async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) await collect(path.join(directory, entry.name), `${relative}/`);
    else if (relative !== 'family-manifest.json') files[relative] = await readFile(path.join(directory, entry.name));
  }
}
await collect(source);
const manifest = { version, design: 'A — Refined Forms', files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([name, content]) => [name, hash(content)])) };
const manifestContent = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
const readOptional = async filename => { try { return await readFile(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const sourceManifest = await readOptional(path.join(source, 'family-manifest.json'));
if (check && !sourceManifest?.equals(manifestContent)) throw new Error('Canonical manifest differs. Run sync after reviewing source changes.');
if (!check) await writeFile(path.join(source, 'family-manifest.json'), manifestContent);
files['family-manifest.json'] = manifestContent;
let failures = 0;
for (const target of requested ? [requested] : targets) {
  const directory = path.resolve(workspace, target, 'assets/family');
  const oldManifestBuffer = await readOptional(path.join(directory, 'family-manifest.json'));
  const oldManifest = oldManifestBuffer ? JSON.parse(oldManifestBuffer) : null;
  for (const name of Object.keys(oldManifest?.files || {})) {
    if (Object.hasOwn(files, name)) continue;
    throw new Error(`${target}: previously managed asset ${name} is no longer canonical. Review and remove it and its manifest entry before synchronizing.`);
  }
  const pending = [];
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(directory, name);
    const existing = await readOptional(destination);
    if (existing?.equals(content)) continue;
    if (check) { console.error(`${target}: differs or missing: ${name}`); failures++; continue; }
    if (existing && name !== 'family-manifest.json' && (!oldManifest?.files[name] || hash(existing) !== oldManifest.files[name])) throw new Error(`${target}/${name} has local edits. Reconcile them in the canonical family before synchronizing.`);
    pending.push([destination, content]);
  }
  for (const [destination, content] of pending) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  console.log(`${check ? 'Checked' : 'Synchronized'} ${target}: ${version}`);
}
if (failures) process.exitCode = 1;
