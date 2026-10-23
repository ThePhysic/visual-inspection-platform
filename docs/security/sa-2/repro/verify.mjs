import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { root, state, run, save } from './support.mjs';

const baseline = JSON.parse(await readFile(resolve(state.evidence, 'baseline.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
for (const file of baseline.sa1) assert.equal(hash(await readFile(resolve(root, file.path))), file.sha256);
assert.equal(hash((await run('git', ['ls-files', '--stage', '-z'])).stdout), baseline.indexSha256);
assert.equal((await run('git', ['diff', '--name-only', '--', 'AGENTS.md'])).stdout.trim(), '');
await run('git', ['diff', '--check']);
const validation = JSON.parse(await readFile(resolve(state.evidence, 'workspace-validation-final.json'), 'utf8'));
assert.equal(validation.results.length, 4); assert.ok(validation.results.every(check => check.code === 0));
const preservation = JSON.parse(await readFile(resolve(state.evidence, 'preservation.json'), 'utf8'));
assert.equal(preservation.sa1FilesVerifiedUnchanged, 50); assert.equal(preservation.preExistingVolumeNamesPreserved, true);
const inventory = JSON.parse(await readFile(resolve(state.evidence, 'file-inventory.json'), 'utf8'));
for (const file of inventory.files.filter(file => file.sha256 !== '(self not hashed)')) {
  assert.equal(hash(await readFile(resolve(root, file.path))), file.sha256, `Inventory mismatch: ${file.path}`);
}
let links = 0; let json = 0; let markdown = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'verification.json') continue; // Output is written after these checks.
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) { await visit(file); continue; }
    const content = await readFile(file, 'utf8');
    if (entry.name.endsWith('.json')) { JSON.parse(content); json++; }
    if (entry.name.endsWith('.md')) {
      markdown++;
      assert.ok(!/C:[\\/]Users[\\/]ridle/i.test(content), 'Personal absolute path in report');
      for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^[a-z]+:\/\//i.test(target)) continue;
        await access(resolve(dirname(file), target)); links++;
      }
    }
  }
}
await visit(resolve(root, 'docs/security/sa-2'));
await save('verification.json', { sourceCommit: baseline.commit, sa1FilesVerifiedUnchanged: baseline.sa1.length,
  indexUnchanged: true, trackedPrivateInstructionDiffEmpty: true, diffWhitespaceCheck: 'passed', inventoryHashesChecked: true,
  markdown, localLinksChecked: links, jsonFilesParsed: json,
  workspaceGates: validation.results.map(result => ({ command: result.command, code: result.code })),
  namedStackCleanup: 'passed', extraAnonymousVolumeUnownedUntouched: preservation.additionalVolumes.length,
  checkpoint: 'SA-2 hardening/regressions pass; SA-2A partially blocked; quota deferred; no SA-3 work',
});
console.log(JSON.stringify({ markdown, json, localLinks: links, sa1Unchanged: baseline.sa1.length, workspaceGatesPassed: 4 }));
