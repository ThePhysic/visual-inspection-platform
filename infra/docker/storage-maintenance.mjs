// Operator tool for the standard full-Compose layout. Report is the default.
// Deletion applies ONLY to stale staging, never to published images.
import assert from 'node:assert/strict';
import { command } from './disposable.mjs';

const [project, mode = 'report'] = process.argv.slice(2);
assert.match(project ?? '', /^[a-z0-9][a-z0-9_-]{0,80}$/);
assert.ok(['report', 'clean-staging-offline'].includes(mode), 'Use PROJECT [report|clean-staging-offline]');
const apiIds = (await command('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`,
  '--filter', 'label=com.docker.compose.service=api'])).split(/\s+/).filter(Boolean);
assert.equal(apiIds.length, 1, 'An existing, unambiguous API container is required (stopped is fine)');
const [api] = JSON.parse(await command('docker', ['inspect', ...apiIds]));
assert.equal(api.Config.Labels['com.docker.compose.project'], project);
const images = api.Mounts.find(mount => mount.Destination === '/data/images');
assert.equal(images?.Type, 'volume'); assert.equal(images.Name, `${project}_images`);
const networks = Object.keys(api.NetworkSettings.Networks);
assert.deepEqual(networks, [`${project}_default`]);
const [volume] = JSON.parse(await command('docker', ['volume', 'inspect', images.Name]));
assert.equal(volume.Labels['com.docker.compose.project'], project);
const mongodbUri = api.Config.Env.find(value => value.startsWith('MONGODB_URI='))?.slice('MONGODB_URI='.length);
assert.equal(new URL(mongodbUri).hostname, 'mongodb');
assert.ok(new URL(mongodbUri).pathname.length > 1);
if (mode === 'clean-staging-offline') {
  // Fail closed unless every container mounting the volume is stopped. This is
  // a maintenance boundary, not a distributed filesystem lock: the operator
  // must prevent other Docker clients from starting writers during this run.
  assert.equal(await command('docker', ['ps', '-q', '--filter', `volume=${images.Name}`]), '',
    'Stop API/worker and every image-volume consumer before staging cleanup');
}
const script = `
import { connectDatabase, createAssetModel, checkDatabase, inspectStorage, cleanStaleStaging } from '@vip/backend';
const connection = await connectDatabase(process.env.MONGODB_URI);
try {
  const assets = createAssetModel(connection);
  const catalog = { assertHealthy: () => checkDatabase(connection),
    hasStorageKey: async key => Boolean(await assets.exists({ storageKey: key })) };
  const report = ${mode === 'report'
    ? "await inspectStorage('/data/images', catalog)"
    : "await cleanStaleStaging('/data/images', catalog, async () => {})"};
  console.log(JSON.stringify(report, null, 2));
} finally { await connection.close(); }
`;
// A deterministic container name prevents concurrent maintenance invocations.
// No Compose up/down, volume deletion, recursive deletion, or orphan deletion.
await command('docker', ['run', '--rm', '-i', '--name', `${project}-storage-maintenance`, '--network', networks[0],
  '--user', '1000:1000', '--read-only', '--mount', `type=volume,src=${images.Name},dst=/data/images${mode === 'report' ? ',readonly' : ''}`,
  '--env', 'MONGODB_URI', '--workdir', '/app/apps/api', api.Config.Image, 'node', '--input-type=module', '-'], {
  input: script, env: { MONGODB_URI: mongodbUri }, echo: true,
});
