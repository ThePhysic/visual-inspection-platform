import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { disposableEnvironment } from '../../../../infra/docker/disposable.mjs';
import { state, run, save } from './support.mjs';

const before = {};
for (const name of ['containers', 'volumes']) {
  const args = name === 'containers' ? ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.State}}']
    : ['volume', 'ls', '--format', '{{.Name}}'];
  before[name] = (await run('docker', args)).stdout.trim().split('\n').filter(Boolean).sort();
}
await writeFile(resolve(state.working, 'unrelated-before.json'), JSON.stringify(before));
const test = await disposableEnvironment({ ciMongoCompatibility: true });
const owner = test.project.slice('vip-reliability-'.length);
const environment = { project: test.project, owner, ...test.environment };
await writeFile(resolve(state.working, 'environment.json'), JSON.stringify(environment));
await save('isolation.json', { project: test.project, owner, environment,
  database: `vip_reliability_${owner}`, network: `${test.project}_default`,
  volumes: ['images', 'mongodb-data', 'redis-data'].map(name => `${test.project}_${name}`),
  retainedDemoVolumes: before.volumes.filter(name => name.startsWith('vip-demo_')),
  source: 'baseline.json; tracked application clean before setup',
  allowed: 'Owned Compose services and assigned loopback ports, native browser ports 3003/4174 if free, one ephemeral loopback test origin. No external dynamic destinations.',
  budget: { customRequestsPerSecond: 2, perCase: 50, uploadConcurrency: 3,
    deterministicExistingTests: 'Permit the two existing eight-submission injection cases on unique test DB/queues; small fixtures, not network load. Other existing suites unchanged.' },
  cleanup: 'Verify exact owner labels/services/mounts before down --volumes for this generated project only; no prune or retained-data access.' });
console.log(`SA-2 disposable project: ${test.project}`);
await test.compose(['config', '--quiet']);
await test.compose(['build'], { timeout: 600_000 }).then(output => writeFile(resolve(state.working, 'baseline-build.log'), output));
await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { timeout: 180_000 });
await test.verifyOwnership(); await test.verifyMongoCompatibility();
console.log(`Baseline ready: ${test.environment.CONTAINER_BASE_URL}`);
