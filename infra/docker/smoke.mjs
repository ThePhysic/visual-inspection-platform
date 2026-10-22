// Run on stdin inside the API container, with cwd /app/apps/api. No host Node
// installation or test dependencies are needed. Use a disposable Compose project.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { connectDatabase, createInspectionModel } from '@vip/backend';
import { MOCK_CONFIGURATION, isInferenceResult, isInspectionHistoryResponse } from '@vip/contracts';

assert.equal(process.env.NODE_ENV, 'production');
assert.equal(process.env.ASSET_STORAGE_DIR, '/data/images');
assert.equal(new URL(process.env.MONGODB_URI).hostname, 'mongodb');
assert.equal(new URL(process.env.REDIS_URL).hostname, 'redis');
assert.notEqual(process.getuid(), 0);
const checkpoint = '/data/images/.container-smoke.json';
const phase = process.argv[2];
assert.ok(['create', 'verify'].includes(phase), 'Use create or verify');
const require = createRequire(`${process.cwd()}/package.json`);
for (const dependency of ['typescript', 'tsx', 'vite', 'vitest', '@playwright/test']) {
  assert.throws(() => require.resolve(dependency), { code: 'MODULE_NOT_FOUND' });
}
for (const path of ['/app/.env', '/app/.git', '/app/.tools', '/app/apps/api/src', '/app/packages/backend/src']) {
  await assert.rejects(access(path));
}

const origin = 'http://web:8080';
async function json(path, status = 200, options = {}) {
  const response = await fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, status, `${options.method ?? 'GET'} ${path}: ${await response.clone().text()}`);
  return { response, body: await response.json() };
}
async function completed(id) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { body } = await json(`/api/v1/inspections/${id}`);
    assert.notEqual(body.status, 'failed', `Inspection failed: ${JSON.stringify(body.failure)}`);
    if (body.status === 'completed') { assert.ok(isInferenceResult(body.result)); return body; }
    await pause(200); // bounded condition polling, not a fixed completion delay
  }
  throw new Error('Container worker did not complete inspection before the deadline');
}
async function inspect(assetId) {
  const { response, body } = await json('/api/v1/inspections', 202, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ assetId }),
  });
  assert.equal(response.headers.get('location'), body.url);
  return completed(body.id);
}
async function verifyStored(state) {
  const { body } = await json(`/api/v1/inspections/${state.inspectionId}`);
  assert.deepEqual(body.result, state.result);
  assert.deepEqual(body.review, state.review);
  const content = await fetch(`${origin}${state.asset.contentUrl}`);
  assert.equal(content.status, 200); assert.equal(content.headers.get('content-type'), 'image/png');
  assert.equal(createHash('sha256').update(new Uint8Array(await content.arrayBuffer())).digest('hex'), state.asset.sha256);
  const history = (await json('/api/v1/inspections?status=completed&limit=50')).body;
  assert.ok(isInspectionHistoryResponse(history));
  assert.ok(history.items.some(item => item.id === state.inspectionId && item.hasReview && item.reviewRevision === 1));
  assert.equal((await json(`/api/v1/inspections/${state.retryId}`)).body.retriedFrom, state.parentId);
  const parent = (await json(`/api/v1/inspections/${state.parentId}`)).body;
  assert.equal(parent.status, 'failed'); assert.equal(parent.latestRetryId, state.retryId);
}

const ready = (await json('/api/v1/ready')).body;
assert.equal(ready.dependencies.mongodb, 'ok'); assert.equal(ready.dependencies.storage, 'ok'); assert.equal(ready.dependencies.redis, 'ok');
await json('/api/v1/health');
// Operator metrics stay on each process's loopback listener, off the web proxy.
await json('/api/v1/metrics', 404);
const operator = await fetch('http://127.0.0.1:9464/metrics');
assert.equal(operator.status, 200);
assert.match(await operator.text(), /vip_http_requests_total/);
const queueSnapshot = await fetch('http://127.0.0.1:9464/queue');
assert.equal(queueSnapshot.status, 200);
const counts = await queueSnapshot.json();
assert.ok(counts.redisJobs && counts.mongoInspections);
const root = await fetch(origin); assert.equal(root.status, 200);
assert.match(root.headers.get('cache-control'), /no-cache/);
const html = await root.text(); assert.match(html, /id="root"/);
const deep = await fetch(`${origin}/inspections/0123456789abcdef01234567`);
assert.equal(deep.status, 200); assert.equal(await deep.text(), html);
const entry = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
const javascript = await fetch(`${origin}${entry}`); assert.match(javascript.headers.get('cache-control'), /immutable/);
assert.doesNotMatch(await javascript.text(), /mongodb:\/\/|redis:\/\/|ASSET_STORAGE_DIR/);
assert.equal((await fetch(`${origin}/assets/does-not-exist.js`)).status, 404);

if (phase === 'create') {
  // Refuse to replace an existing checkpoint or erase another smoke run's data.
  await assert.rejects(access(checkpoint), 'A checkpoint exists; run verify or use a fresh project');
  // The documented synthetic panel fixture, embedded so runtime images need no fixtures.
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAb0lEQVR42u3XMQEAIAzEwMphRz+W3gJI6NKNG2LgtlSS+3MFAAAAAAAAAAAAAAAAAAAAAGg7a48GAAAAAAAAAAAAAAAAMwQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDxHl9l/Iekblu4AAAAAElFTkSuQmCC', 'base64');
  const form = new FormData(); form.append('image', new Blob([bytes], { type: 'image/png' }), 'panel.png'); form.append('source', 'api');
  const asset = (await json('/api/v1/assets', 201, { method: 'POST', body: form })).body;
  assert.equal(asset.width, 64); assert.equal(asset.height, 64);
  const original = await inspect(asset.id); assert.equal(original.result.detections.length, 1);
  const request = { contractVersion: 'v1', taxonomyVersion: 'mock-v1', operationId: randomUUID(), expectedRevision: 0, expectedWriteSequence: 0,
    annotations: original.result.detections.map(prediction => ({ origin: 'prediction', id: `prediction:${prediction.id}`, predictionId: prediction.id,
      classId: 'edge-defect', disposition: 'rejected', boundingBox: prediction.boundingBox })) };
  const { body: saved } = await json(`/api/v1/inspections/${original.id}/review`, 200, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  });
  assert.equal(saved.review.revision, 1);
  // Seed only a terminal failure fixture; recovery itself uses the real endpoints
  // and worker. No production provider fault switch or retry changes are added.
  const connection = await connectDatabase(process.env.MONGODB_URI);
  let parentId;
  try {
    const parent = await createInspectionModel(connection).create({ assetId: asset.id, requested: MOCK_CONFIGURATION,
      status: 'failed', completedAt: new Date(), attemptCount: 1, requestScope: 'container-smoke', requestKey: randomUUID(),
      requestFingerprint: 'fixture', requestId: 'fixture', failure: { code: 'INFERENCE_FAILED', message: 'Simulated inference failed.' } });
    parentId = parent._id.toString();
  } finally { await connection.close(); }
  const retryKey = randomUUID();
  const retryOptions = { method: 'POST', headers: { 'Idempotency-Key': retryKey } };
  const retry = (await json(`/api/v1/inspections/${parentId}/retry`, 202, retryOptions)).body;
  assert.equal((await json(`/api/v1/inspections/${parentId}/retry`, 202, retryOptions)).body.id, retry.id);
  await completed(retry.id);
  const state = { asset, inspectionId: original.id, result: original.result, review: saved.review, parentId, retryId: retry.id };
  await verifyStored(state);
  const first = (await json('/api/v1/inspections?status=completed&limit=1')).body;
  assert.ok(first.hasMore && first.nextCursor);
  const next = (await json(`/api/v1/inspections?status=completed&limit=1&cursor=${first.nextCursor}`)).body;
  assert.notEqual(first.items[0].id, next.items[0].id);
  const invalid = await json(`/api/v1/inspections?status=failed&cursor=${first.nextCursor}`, 400);
  assert.equal(invalid.body.error.code, 'INVALID_CURSOR');
  // A file just over 10 MiB still fits nginx's overhead allowance and reaches
  // authoritative API validation, returning the original JSON error envelope.
  const oversized = new FormData(); oversized.append('image', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), 'large.png');
  assert.equal((await json('/api/v1/assets', 413, { method: 'POST', body: oversized })).body.error.code, 'UPLOAD_TOO_LARGE');
  await writeFile(checkpoint, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  console.log('Container smoke create passed: proxy, upload, inference, review, history, retry, and runtime packaging.');
} else {
  const state = JSON.parse(await readFile(checkpoint, 'utf8'));
  await verifyStored(state);
  // Reusing the persisted asset proves the read-only worker still reads the
  // shared canonical image after restart or complete Compose down/up.
  await inspect(state.asset.id);
  console.log('Container smoke verify passed: persisted data/images/reviews and new worker execution.');
}
