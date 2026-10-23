import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { disposableEnvironment } from '../../../../infra/docker/disposable.mjs';
import { state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const before = {};
for (const [name, args] of [['containers', ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.State}}']],
  ['volumes', ['volume', 'ls', '--format', '{{.Name}}']], ['networks', ['network', 'ls', '--format', '{{.ID}} {{.Name}}']]]) {
  before[name] = (await run('docker', args)).stdout.trim().split('\n').filter(Boolean).sort();
}
await writeFile(resolve(state.working, 'resources-before.json'), JSON.stringify(before));
const test = await disposableEnvironment({ ciMongoCompatibility: true });
const owner = test.project.slice('vip-reliability-'.length);
await writeFile(resolve(state.working, 'environment.json'), JSON.stringify({ project: test.project, owner, ...test.environment }));
const config = JSON.parse(await test.compose(['config', '--format', 'json']));
assert.ok(config.services.mongodb.volumes.some(m => m.target === '/data/configdb' && m.source === 'mongodb-config-data'));
assert.equal(config.volumes['mongodb-config-data'].labels['io.vip.disposable-owner'], owner);
assert.ok(!JSON.stringify(config).includes('vip-demo'));
const configHash = createHash('sha256').update(JSON.stringify(config)).digest('hex');
console.log(`SA-3 project: ${test.project}`);
await test.compose(['build', '--pull=false'], { timeout: 600_000 }).then(output => writeFile(resolve(state.working, 'docker-build.log'), output));
await test.compose(['create'], { timeout: 120_000 });
const target = await loadEnvironment();
const containers = await target.verify(); // Verify all mounts/resources BEFORE service tests.
await test.verifyOwnership();
await save('isolation.json', { sourceCommit: JSON.parse(await readFile(resolve(state.evidence,'baseline.json'),'utf8')).commit,
  project: test.project, owner, environment: test.environment, configSha256: configHash,
  verificationPoint: 'All containers created but services not yet started; four named labeled volumes and network checked before tests',
  mounts: containers.map(c => ({ service: c.Config.Labels['com.docker.compose.service'], mounts: c.Mounts.map(m => ({ destination: m.Destination, name: m.Name, writable: m.RW })) })),
  volumes: ['images','mongodb-data','mongodb-config-data','redis-data'].map(name=>`${test.project}_${name}`),
  retainedDemoVolumes: before.volumes.filter(name=>name.startsWith('vip-demo_')),
  unownedVolumeExcluded: '8f1d43eca2fa087394e62eeda1f2787db8cace965afb0ec44018bd75613d7b58',
  allowedDestinations: 'Owned bridge services; assigned loopback web/MongoDB/Redis ports; free native E2E ports 3003/4174; ephemeral loopback browser origin. Synthetic public document fulfilled locally only.',
  limits: { customRps: 2, customRequestsPerCase: 50, uploadStreams: 3, deterministicExistingIdempotencyRace: 8,
    artifactImageBytes: '<1 GiB', archiveBytes: '<1100 MiB', catalogExportBytes: '<1 MiB per file, <16 MiB total', noExhaustion: true },
  cleanup: 'Only generated project after exact mount/name/owner checks. Four owned data volumes survive ordinary down/up, then are removed at final down --volumes. No prune or unowned volume operation.',
});
await test.compose(['up','-d','--wait','--wait-timeout','120'], { timeout: 180_000 });
await target.verify(); await test.verifyMongoCompatibility();
await save('images.json', { project: test.project, images: containers.map(c => ({ service: c.Config.Labels['com.docker.compose.service'], imageId: c.Image })) });
console.log(`Owned stack ready: ${test.environment.CONTAINER_BASE_URL}`);
