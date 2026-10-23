import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
await test.verify();
const baseline = JSON.parse(await readFile(resolve(state.evidence, 'source-baseline.json'), 'utf8'));
for (const file of baseline.files) {
  assert.equal(createHash('sha256').update(await readFile(resolve(root, file.path))).digest('hex'), file.sha256, `Source changed: ${file.path}`);
  assert.equal(createHash('sha256').update(await readFile(resolve(state.snapshot, file.path))).digest('hex'), file.sha256, `Snapshot changed: ${file.path}`);
}
await run('git', ['diff', '--exit-code']);
await run('git', ['diff', '--cached', '--exit-code']);
const before = JSON.parse(await readFile(resolve(state.working, 'unrelated-before.json'), 'utf8'));
// The only destructive operation targets the verified generated project.
await test.compose(['down', '--volumes', '--remove-orphans'], { timeout: 120_000 });
const after = {};
for (const name of ['containers', 'volumes']) {
  const args = name === 'containers' ? ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.State}}'] : ['volume', 'ls', '--format', '{{.Name}}'];
  after[name] = (await run('docker', args)).stdout.trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(after[name], before[name], `Unrelated ${name} inventory changed`);
}
for (const kind of ['container', 'volume', 'network']) {
  const args = kind === 'container' ? ['ps', '-aq'] : [kind, 'ls', '-q'];
  assert.equal((await run('docker', [...args, '--filter', `label=com.docker.compose.project=${test.project}`])).stdout.trim(), '');
}
await unlink(resolve(root, '.tools', `${test.project}.compose.json`));
await save('preservation.json', { project: test.project, verifiedOwner: test.owner,
  applicationFilesCompared: baseline.files.length, originalAndScannerSnapshotHashesUnchanged: true,
  trackedFilesUnchanged: true, indexUnchanged: true, auditContainersVolumesNetworkRemoved: true,
  unrelatedContainerIdentityAndStateInventoryUnchanged: true, unrelatedVolumeInventoryUnchanged: true,
  retainedDemo: { volumes: after.volumes.filter(name => name.startsWith('vip-demo_')), containers: [],
    mountedReadOrWrittenByAudit: false, byteLevelDataHash: 'Not acquired; retained data was never mounted or queried' },
  retainedAuditArtifacts: 'Local private scanner caches/logs/snapshot and generated build image tags remain; no broad prune or image deletion.' });
console.log('Owned stack removed; original source, index and unrelated resource inventories unchanged');
