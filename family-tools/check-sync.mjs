import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temporaryRoot = path.resolve(tmpdir());
const workspace = await mkdtemp(path.join(temporaryRoot, 'islandsun-sync-'));
assert.equal(path.dirname(workspace), temporaryRoot);
const source = path.join(workspace, 'isi/family');
const tool = path.join(workspace, 'isi/family-tools/sync.mjs');
const target = path.join(workspace, 'pricing-form/assets/family');
const run = (...args) => spawnSync(process.execPath, [tool, '--target=pricing-form', ...args], { encoding: 'utf8' });

try {
  await mkdir(source, { recursive: true });
  await mkdir(path.dirname(tool), { recursive: true });
  await copyFile(new URL('sync.mjs', import.meta.url), tool);
  await writeFile(path.join(source, 'example.css'), 'initial');
  assert.equal(run().status, 0);
  assert.equal(run('--check').status, 0);
  await writeFile(path.join(target, 'example.css'), 'local edit');
  assert.notEqual(run('--check').status, 0);
  assert.notEqual(run().status, 0);
  assert.equal(await readFile(path.join(target, 'example.css'), 'utf8'), 'local edit');
  await writeFile(path.join(target, 'example.css'), 'initial');
  await writeFile(path.join(source, 'example.css'), 'canonical revision');
  assert.notEqual(run('--check').status, 0);
  assert.equal(run().status, 0);
  assert.equal(await readFile(path.join(target, 'example.css'), 'utf8'), 'canonical revision');
  await rm(path.join(target, 'example.css'));
  assert.notEqual(run('--check').status, 0);
  assert.equal(run().status, 0);
  await rm(path.join(source, 'example.css'));
  assert.notEqual(run().status, 0);
  console.log('Distribution: initial sync, drift, local-edit protection, source revisions, missing assets, and removed-asset review passed.');
} finally {
  assert.equal(path.dirname(path.resolve(workspace)), temporaryRoot);
  assert.ok(path.basename(workspace).startsWith('islandsun-sync-'));
  await rm(workspace, { recursive: true, force: true });
}
