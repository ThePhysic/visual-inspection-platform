import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { root, state, run, pnpm, save } from './support.mjs';

const directory = resolve(root, 'docs/security/sa-1');
async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(item => item.isDirectory() ? walk(resolve(path, item.name)) : resolve(path, item.name)))).flat();
}
const files = (await walk(directory)).filter(path => !path.endsWith('package-verification.json')).sort();
const hashes = [];
let links = 0; let markdown = 0; let json = 0;
for (const path of files) {
  const bytes = await readFile(path);
  const body = bytes.toString('utf8');
  assert.ok(!body.includes(root), `Personal absolute path in ${path.slice(directory.length + 1)}`);
  assert.ok(body.endsWith('\n'));
  assert.ok(!/ +$/m.test(body));
  if (path.endsWith('.json')) { JSON.parse(body); json++; }
  if (path.endsWith('.md')) {
    markdown++;
    assert.equal((body.match(/^```/gm) ?? []).length % 2, 0);
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https?:\/\//.test(match[1]) || match[1].startsWith('#')) continue;
      const target = resolve(dirname(path), match[1].split('#')[0]);
      assert.ok(target.startsWith(root + sep));
      if (target === resolve(state.evidence, 'package-verification.json')) { links++; continue; }
      await readdir(dirname(target));
      await readFile(target).catch(async error => { if (error.code !== 'EISDIR') { const { stat } = await import('node:fs/promises'); assert.ok((await stat(target)).isDirectory()); } });
      links++;
    }
  }
  hashes.push({ path: path.slice(directory.length + 1).replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex') });
}
const baseline = JSON.parse(await readFile(resolve(state.evidence, 'source-baseline.json'), 'utf8'));
for (const file of baseline.files) assert.equal(createHash('sha256').update(await readFile(resolve(root, file.path))).digest('hex'), file.sha256);
await run('git', ['diff', '--check']); await run('git', ['diff', '--exit-code']); await run('git', ['diff', '--cached', '--exit-code']);
const status = (await run('git', ['status', '--porcelain=v1', '--untracked-files=all'])).stdout.trim().split('\n').filter(Boolean);
for (const line of status) assert.ok(line.startsWith('?? docs/security/sa-1/'), 'Change outside assessment package');
const lint = await pnpm(['lint'], { privateLog: 'final-lint.log' });
await save('package-verification.json', { date: new Date().toISOString(), files: files.length, markdown, json, localLinksChecked: links,
  sourceHashesUnchanged: baseline.fileCount, existingTrackedDiffAndIndexUnchanged: true, onlyNewAssessmentFiles: true,
  lint: { command: '& ./.tools/pnpm.cmd lint', exitCode: lint.code, durationMs: lint.durationMs },
  externalLinksAndMermaidRendering: 'not comprehensively validated', artifactHashes: hashes,
  excludedFromHashManifest: ['evidence/package-verification.json (self)'] });
console.log(JSON.stringify({ files: files.length, markdown, json, links, lint: lint.code, sourceHashesUnchanged: baseline.fileCount }));
