// Test-only pre-commit barrier delivered on stdin to a disposable API container.
// Normal consumers are stopped by the ownership-verified host harness.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { connectDatabase, createAssetModel, createInspectionModel, LocalImageStorage,
  MockInferenceProvider, createInspectionProcessor } from '@vip/backend';

assert.match(new URL(process.env.MONGODB_URI).pathname, /^\/vip_reliability_[a-f0-9]{32}$/);
const state = JSON.parse(await readFile('/data/images/.container-smoke.json', 'utf8'));
const connection = await connectDatabase(process.env.MONGODB_URI);
try {
  const assets = createAssetModel(connection); const inspections = createInspectionModel(connection);
  const response = await fetch('http://web:8080/api/v1/inspections', { method: 'POST', headers: {
    'content-type': 'application/json', 'idempotency-key': randomUUID(),
  }, body: JSON.stringify({ assetId: state.asset.id }), signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  const release = `/tmp/vip-result-release-${randomUUID()}`;
  await writeFile('/data/images/.result-persistence-window.json', JSON.stringify(accepted), { flag: 'wx', mode: 0o600 });
  const update = inspections.collection.updateOne.bind(inspections.collection);
  inspections.collection.updateOne = async (...args) => {
    if (!Array.isArray(args[1]) && args[1].$set?.status === 'completed') {
      console.log(`VIP_BEFORE_COMPLETION ${release}`);
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (await readFile(release, 'utf8').then(() => true, () => false)) break;
        await pause(100);
      }
      assert.ok(Date.now() < deadline, 'Pre-commit barrier timed out');
    }
    return update(...args);
  };
  const processor = createInspectionProcessor({ assets, inspections, storage: new LocalImageStorage('/data/images'),
    provider: new MockInferenceProvider(), logger: { info() {}, warn() {}, error() {} } });
  await assert.rejects(processor({ id: 'isolated-precommit', data: {
    payloadVersion: 'v1', inspectionId: accepted.id, generation: 0,
  } }), /DATABASE_UNAVAILABLE/);
  console.log('MongoDB interruption during result persistence did not falsely succeed.');
} finally { await connection.close(); }
