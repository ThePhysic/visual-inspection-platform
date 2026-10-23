import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { disposableEnvironment } from '../../../../infra/docker/disposable.mjs';
import { state, run, save } from './support.mjs';

const before = {};
for (const name of ['containers', 'volumes']) {
  const args = name === 'containers' ? ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.State}}']
    : ['volume', 'ls', '--format', '{{.Name}}'];
  before[name] = (await run('docker', args)).stdout.trim().split('\n').filter(Boolean).sort();
}
await writeFile(resolve(state.working, 'unrelated-before.json'), JSON.stringify(before, null, 2));
const test = await disposableEnvironment({ ciMongoCompatibility: true });
const owner = test.project.slice('vip-reliability-'.length);
const environment = { project: test.project, owner, ...test.environment };
await writeFile(resolve(state.working, 'environment.json'), JSON.stringify(environment, null, 2));
const baseline = JSON.parse(await readFile(resolve(state.evidence, 'source-baseline.json'), 'utf8'));
await save('isolation.json', { sourceCommit: baseline.commit, sourceManifest: baseline.manifestSha256,
  project: test.project, owner, volumes: ['images', 'mongodb-data', 'redis-data'].map(name => `${test.project}_${name}`),
  network: `${test.project}_default`, database: `vip_reliability_${owner}`, environment,
  configuration: ['compose.yaml', 'compose.ci.yaml', 'generated audit-only ownership/namespace/loopback-port override'],
  retainedDemo: { containers: before.containers.filter(line => /\bvip-demo-/.test(line)), volumes: before.volumes.filter(name => name.startsWith('vip-demo_')), mountedByAudit: false },
  bounds: { requestsPerSecond: 2, requestsPerCase: 50, simultaneousUploadsOnly: 3, callbacks: 'none',
    networkTargets: 'assigned loopback web/Mongo/Redis; owned Compose bridge services; local controlled browser origin. No external dynamic target.',
    staticScannerNetwork: 'none', packageLookup: 'npm registry package metadata only' },
  cleanup: 'Verify owner labels, expected service/mount/volume/network identities; down --volumes only this generated project. Never mount or remove vip-demo resources.' });
console.log(`Audit project recorded: ${test.project}`);
await test.compose(['config', '--quiet']);
console.log('Building the unchanged application into uniquely named audit images');
await test.compose(['build'], { timeout: 600_000 }).then(output => writeFile(resolve(state.working, 'docker-build.log'), output));
console.log('Starting the five audit-owned services');
await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { timeout: 180_000 });
await test.verifyOwnership();
await test.verifyMongoCompatibility();
console.log(`Audit stack ready: ${test.environment.CONTAINER_BASE_URL}`);
