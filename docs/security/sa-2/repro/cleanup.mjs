import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
const verifyOnly = process.argv[2] === '--verify-after-cleanup';
assert.ok(process.argv[2] === undefined || verifyOnly);
const before = JSON.parse(await readFile(resolve(state.working, 'unrelated-before.json'), 'utf8'));
const baseline = JSON.parse(await readFile(resolve(state.evidence, 'baseline.json'), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
for (const file of baseline.sa1) assert.equal(sha(await readFile(resolve(root, file.path))), file.sha256, 'SA-1 evidence must remain unchanged');
const index = await run('git', ['ls-files', '--stage', '-z']);
assert.equal(sha(index.stdout), baseline.indexSha256, 'Index must remain unchanged');
assert.equal((await run('git', ['diff', '--name-only', '--', 'AGENTS.md'])).stdout.trim(), '', 'Private instructions must remain unchanged');
if (!verifyOnly) {
  await test.verify();
  await test.compose(['down', '--volumes', '--remove-orphans'], { timeout: 120_000, privateLog: 'cleanup.log' });
}
const after = {};
for (const name of ['containers', 'volumes']) {
  const args = name === 'containers' ? ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.State}}'] : ['volume', 'ls', '--format', '{{.Name}}'];
  after[name] = (await run('docker', args)).stdout.trim().split('\n').filter(Boolean).sort();
  if (name === 'containers') assert.deepEqual(after[name], before[name], 'Unrelated containers changed');
  else assert.ok(before[name].every(volume => after[name].includes(volume)), 'Pre-existing volume removed');
}
const additional = after.volumes.filter(name => !before.volumes.includes(name));
const additionalVolumes = [];
for (const name of additional) {
  const [volume] = JSON.parse((await run('docker', ['volume', 'inspect', name])).stdout);
  additionalVolumes.push({ name, createdAt: volume.CreatedAt, labels: volume.Labels,
    mountedContainerCount: (await run('docker', ['ps', '-aq', '--filter', `volume=${name}`])).stdout.trim().split(/\s+/).filter(Boolean).length,
    disposition: 'Left untouched: anonymous volume has no audit owner label. Creation coincides with reliability MongoDB startup; image declares /data/configdb, but exact ownership was not retained.' });
}
for (const kind of ['container', 'volume', 'network']) {
  const args = kind === 'container' ? ['ps', '-aq'] : [kind, 'ls', '-q'];
  assert.equal((await run('docker', [...args, '--filter', `label=com.docker.compose.project=${test.project}`])).stdout.trim(), '');
}
const override = resolve(root, '.tools', `${test.project}.compose.json`);
assert.match(test.project, /^vip-reliability-[a-f0-9]{32}$/);
await unlink(override).catch(error => { if (!verifyOnly || error.code !== 'ENOENT') throw error; });
await save('preservation.json', { sa1FilesVerifiedUnchanged: baseline.sa1.length, indexUnchanged: true, privateInstructionsNotEditedByAudit: true,
  retainedDemo: { volumesBefore: before.volumes.filter(name => name.startsWith('vip-demo_')), volumesAfter: after.volumes.filter(name => name.startsWith('vip-demo_')),
    mountedQueriedOrReset: false, containersBefore: before.containers.filter(line => /\bvip-demo-/.test(line)),
    verification: 'Resource inventory only; deliberately no retained-volume byte hash or database query. No claim about unrelated external writers.' },
  unrelatedContainersEqual: true, preExistingVolumeNamesPreserved: true, additionalVolumes, project: test.project,
  cleanup: 'All five main audit containers, three named labeled volumes and network removed after ownership verification; no prune. Reliability wrapper also removed its labeled stack. One anonymous volume remains unmounted and unremoved because ownership cannot now be proved. Unique build image tags/cache retained.',
  unchangedBoundary: 'Application dependencies, lockfile, schemas, worker/review/acceptance/storage algorithms unchanged; authorized API/config/log/cache/packaging changes are in file-inventory.json.',
});
console.log(JSON.stringify({ sa1Unchanged: baseline.sa1.length, existingResourcesPreserved: true, addedAnonymousVolumesLeftUntouched: additionalVolumes.length }));
