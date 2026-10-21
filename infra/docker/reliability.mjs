// Runs only on stdin in the disposable API container. No application fault API.
import assert from 'node:assert/strict';
import { readFile, writeFile, utimes } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { connectDatabase, createInspectionModel, createAssetModel, checkDatabase,
  inspectStorage, LocalImageStorage, MINIMUM_CLEANUP_AGE_MS } from '@vip/backend';

assert.match(new URL(process.env.MONGODB_URI).pathname, /^\/vip_reliability_[a-f0-9]{32}$/);
assert.equal(process.env.ASSET_STORAGE_DIR, '/data/images');
const phase = process.argv[2];
const state = JSON.parse(await readFile('/data/images/.container-smoke.json', 'utf8'));
async function json(path, status = 200, options = {}) {
  const response = await fetch(`http://web:8080${path}`, { ...options, signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
async function until(check, message, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(200);
  }
  throw new Error(message);
}
const submit = () => json('/api/v1/inspections', 202, { method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ assetId: state.asset.id }) });
if (phase === 'redis-down') {
  await until(async () => (await json('/api/v1/ready')).dependencies.redis === 'unavailable', 'Redis outage not reported');
  await json('/api/v1/health');
  const accepted = await submit();
  const connection = await connectDatabase(process.env.MONGODB_URI);
  try {
    const record = await createInspectionModel(connection).findById(accepted.id).lean().orFail();
    assert.equal(record.status, 'queued'); assert.equal(record.attemptCount, 0);
  } finally { await connection.close(); }
  await writeFile('/data/images/.reliability-accepted.json', JSON.stringify(accepted), { flag: 'wx', mode: 0o600 });
} else if (phase === 'redis-recovered' || phase === 'result-recovered') {
  const accepted = JSON.parse(await readFile(phase === 'redis-recovered'
    ? '/data/images/.reliability-accepted.json' : '/data/images/.result-persistence-window.json', 'utf8'));
  await until(async () => {
    const inspection = await json(accepted.url);
    assert.notEqual(inspection.status, 'failed', JSON.stringify(inspection.failure));
    return inspection.status === 'completed';
  }, 'Durable acceptance was not recovered');
  if (phase === 'result-recovered') {
    const connection = await connectDatabase(process.env.MONGODB_URI);
    try {
      const completed = await createInspectionModel(connection).findById(accepted.id).lean().orFail();
      assert.equal(completed.attemptCount, 2);
    } finally { await connection.close(); }
  }
} else if (phase === 'mongo-down') {
  const ready = await json('/api/v1/ready', 503);
  assert.equal(ready.error.code, 'DATABASE_FAILURE');
  await json('/api/v1/health');
  const rejected = await json('/api/v1/inspections', 503, { method: 'POST', headers: {
    'content-type': 'application/json', 'idempotency-key': randomUUID(),
  }, body: JSON.stringify({ assetId: state.asset.id }) });
  assert.equal(rejected.error.code, 'DATABASE_FAILURE');
  assert.doesNotMatch(JSON.stringify(rejected), /mongodb:\/\/|\/data\/images|stack/);
} else if (phase === 'storage') {
  const connection = await connectDatabase(process.env.MONGODB_URI);
  try {
    const assets = createAssetModel(connection);
    const storage = new LocalImageStorage('/data/images');
    const stage = await storage.stage();
    const orphan = `${randomUUID()}.png`;
    await writeFile(stage.input, 'abandoned staging fixture');
    await writeFile(`/data/images/${orphan}`, 'orphan fixture');
    const old = new Date(Date.now() - MINIMUM_CLEANUP_AGE_MS * 2);
    for (const file of [stage.input, stage.directory, `/data/images/${orphan}`]) await utimes(file, old, old);
    const report = await inspectStorage(storage.directory, { assertHealthy: () => checkDatabase(connection),
      hasStorageKey: async key => Boolean(await assets.exists({ storageKey: key })) });
    assert.ok(report.staleStaging.includes(stage.directory.split('/').at(-1)));
    assert.ok(report.orphanCandidates.includes(orphan));
    assert.equal(await readFile(`/data/images/${orphan}`, 'utf8'), 'orphan fixture');
  } finally { await connection.close(); }
} else throw new Error('Unknown isolated reliability phase');
console.log(`Reliability phase passed: ${phase}`);
