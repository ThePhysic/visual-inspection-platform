import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { crc32 } from 'node:zlib';
import { root, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
await test.verify();
const require = createRequire(resolve(root, 'apps/api/package.json'));
const mongoose = require('mongoose');
const sharp = require('sharp');
const db = await mongoose.createConnection(test.MONGODB_TEST_URI, { dbName: `vip_reliability_${test.owner}` }).asPromise();
const assets = db.collection('assets'); const inspections = db.collection('inspections');
const png = await readFile(resolve(root, 'fixtures/inspections/panel.png'));
const target = test.CONTAINER_BASE_URL;
const cases = []; const requests = [];
let lastRequest = 0;
async function http(path, options = {}) {
  await pause(Math.max(0, lastRequest + 550 - Date.now()));
  lastRequest = Date.now();
  const response = await fetch(target + path, { ...options, signal: AbortSignal.timeout(15000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  let body; try { body = JSON.parse(bytes.toString()); } catch { body = undefined; }
  requests.push({ method: options.method ?? 'GET', path, status: response.status, bytes: bytes.length });
  return { status: response.status, headers: Object.fromEntries(response.headers), body, bytes };
}
const boundary = 'sa1-synthetic-boundary';
function multipart(bytes = png, { name = 'image', filename = 'fixture.png', mime = 'image/png', extra = '' } = {}) {
  return Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`), bytes,
    Buffer.from(`\r\n${extra}--${boundary}--\r\n`)]);
}
const upload = (bytes = png, options = {}) => http('/api/v1/assets', { method: 'POST',
  headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: multipart(bytes, options) });
async function snapshot() {
  const result = await test.compose(['exec', '-T', 'api', 'node', '-e',
    "const fs=require('node:fs');const a=fs.readdirSync('/data/images');console.log(JSON.stringify({files:a.length,staging:a.filter(n=>n.startsWith('.upload-')).length,bytes:a.filter(n=>!n.startsWith('.')).reduce((s,n)=>s+fs.statSync('/data/images/'+n).size,0)}))"]);
  return { assets: await assets.countDocuments(), inspections: await inspections.countDocuments(), storage: JSON.parse(result.stdout) };
}
function check(name, expected, response) {
  cases.push({ name, expectedStatus: expected, status: response.status, code: response.body?.error?.code ?? null,
    passed: response.status === expected });
}
function heldUpload() {
  const req = httpRequest(new URL(target + '/api/v1/assets'), { method: 'POST', headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Transfer-Encoding': 'chunked' } });
  req.on('error', () => {}); req.on('response', response => response.resume());
  req.setTimeout(5000, () => req.destroy());
  req.write(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="partial.png"\r\nContent-Type: image/png\r\n\r\n`));
  req.write(png.subarray(0, 32));
  return req;
}
try {
  const before = await snapshot();
  const valid = await upload(png, { filename: '../../SA1_ESCAPE.png', mime: 'text/html' });
  check('actual PNG overrides hostile filename and declared MIME', 201, valid);
  assert.ok(valid.body?.id);
  const content = await http(valid.body.contentUrl);
  check('canonical content retrieval', 200, content);
  cases.push({ name: 'canonical content security headers', passed: content.headers['x-content-type-options'] === 'nosniff',
    mime: content.headers['content-type'], cache: content.headers['cache-control'], etag: content.headers.etag,
    publicAssetFields: Object.keys(valid.body).sort(), hiddenInternalFields: !/storageKey|requestKey|attemptId|leaseExpiresAt/.test(JSON.stringify(valid.body)) });
  for (const [name, bytes, expected, options] of [
    ['unsupported SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 415, {}],
    ['truncated PNG', png.subarray(0, 20), 422, {}],
    ['unknown file field', png, 400, { name: 'other' }],
    ['unknown source', png, 400, { extra: `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\nSA1_UNKNOWN\r\n` }],
    ['second file', png, 400, { extra: `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="second.png"\r\n\r\nx\r\n` }],
    ['10 MiB plus one byte', Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 + 1 - png.length)]), 413, {}],
  ]) check(name, expected, await upload(bytes, options));
  const dimensionHeader = Buffer.from(png);
  dimensionHeader.writeUInt32BE(5001, 16); dimensionHeader.writeUInt32BE(4000, 20);
  dimensionHeader.writeUInt32BE(crc32(dimensionHeader.subarray(12, 29)), 29);
  check('20,004,000 pixel header rejected before decoding inconsistent tiny fixture', 413, await upload(dimensionHeader));
  const animation = Buffer.alloc(20); animation.writeUInt32BE(8, 0); animation.write('acTL', 4); animation.writeUInt32BE(2, 8);
  animation.writeUInt32BE(crc32(animation.subarray(4, 16)), 16);
  check('APNG declaration', 415, await upload(Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)])));
  const metadataJpeg = await sharp({ create: { width: 8, height: 5, channels: 3, background: '#123456' } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Artist: 'SA1_SYNTHETIC_METADATA' } } }).jpeg().toBuffer();
  const oriented = await upload(metadataJpeg);
  check('EXIF-bearing JPEG accepted', 201, oriented);
  const orientedContent = await http(oriented.body.contentUrl);
  const metadata = await sharp(orientedContent.bytes).metadata();
  cases.push({ name: 'auto orientation and metadata stripping', passed: oriented.body.width === 5 && oriented.body.height === 8 && !metadata.exif,
    width: oriented.body.width, height: oriented.body.height, exifPresent: Boolean(metadata.exif), iccPresent: Boolean(metadata.icc) });
  const rejectedState = await snapshot();
  cases.push({ name: 'rejected uploads leave no staging', passed: rejectedState.storage.staging === 0, state: rejectedState });
  const abort = heldUpload(); await pause(700); abort.destroy(); await pause(900);
  const afterAbort = await snapshot();
  cases.push({ name: 'genuine interrupted upload cleanup', passed: afterAbort.storage.staging === 0 && afterAbort.assets === rejectedState.assets, before: rejectedState, after: afterAbort });
  const held = [heldUpload(), heldUpload()];
  try {
    await pause(700);
    const during = await snapshot();
    const third = await upload();
    check('third simultaneous upload receives backpressure', 503, third);
    cases.push({ name: 'two incomplete uploads occupy two staging slots', passed: during.storage.staging === 2, staging: during.storage.staging });
  } finally { held.forEach(req => req.destroy()); }
  await pause(900);
  cases.push({ name: 'admission slots released after abort', passed: (await snapshot()).storage.staging === 0 });
  for (const query of ['limit=51', 'limit=00', 'limit=1&limit=2', 'status[$ne]=failed', 'cursor=bad', 'unexpected=SA1_CANARY']) {
    check(`history rejects ${query}`, 400, await http('/api/v1/inspections?' + query));
  }
  check('invalid object ID', 400, await http('/api/v1/assets/not-an-id'));
  check('nonexistent object ID', 404, await http('/api/v1/assets/000000000000000000000000'));
  for (const path of ['/metrics', '/queue']) {
    const response = await http(path);
    cases.push({ name: `nginx ${path} is SPA fallback, not operator data`, passed: response.status === 200
      && response.headers['content-type'].startsWith('text/html') && response.bytes.includes(Buffer.from('<div id="root">')) });
  }
  check('public operator-prefixed route absent', 404, await http('/api/v1/metrics'));
  const baseBody = { assetId: valid.body.id };
  const submit = (body, key) => http('/api/v1/inspections', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  const beforeInvalid = await inspections.countDocuments();
  check('injected lifecycle/result fields', 400, await submit({ ...baseBody, status: 'completed', result: {} }, 'sa1-forged-result'));
  check('operator-shaped asset ID', 400, await submit({ assetId: { $ne: null } }, 'sa1-operator'));
  cases.push({ name: 'rejected creation has no persisted side effect', passed: await inspections.countDocuments() === beforeInvalid });
  const first = await submit(baseBody, 'sa1-idempotency');
  const repeated = await submit(baseBody, 'sa1-idempotency');
  cases.push({ name: 'persistent idempotency replay', passed: first.status === 202 && repeated.status === 202 && first.body.id === repeated.body.id });
  check('semantic key conflict', 409, await submit({ assetId: oriented.body.id }, 'sa1-idempotency'));
  // Bounded polling: at most 12 requests, 550 ms spacing.
  let detail;
  for (let i = 0; i < 12; i++) { detail = await http(`/api/v1/inspections/${first.body.id}`); if (detail.body.status === 'completed') break; }
  assert.equal(detail.body.status, 'completed');
  const originalResult = JSON.stringify(detail.body.result);
  const review = { contractVersion: 'v1', taxonomyVersion: 'mock-v1', expectedRevision: 0, expectedWriteSequence: 0,
    operationId: randomUUID(), annotations: detail.body.result.detections.map(item => ({ id: `prediction:${item.id}`, origin: 'prediction',
      predictionId: item.id, classId: item.classId, disposition: 'accepted', boundingBox: item.boundingBox })) };
  const put = body => http(`/api/v1/inspections/${first.body.id}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  check('forged review confidence', 400, await put({ ...review, annotations: review.annotations.map(item => ({ ...item, confidence: 1 })) }));
  const saved = await put(review); check('valid review', 200, saved);
  check('stale review rejected', 409, await put({ ...review, operationId: randomUUID() }));
  const final = await http(`/api/v1/inspections/${first.body.id}`);
  cases.push({ name: 'review writes preserve original result and omit internals', passed: JSON.stringify(final.body.result) === originalResult && !/reviewControl|requestKey|requestFingerprint|attemptId|leaseExpiresAt/.test(JSON.stringify(final.body)),
    responseFields: Object.keys(final.body).sort() });
  const growthBefore = await snapshot();
  for (let i = 0; i < 3; i++) await upload();
  for (let i = 0; i < 6; i++) check(`bounded distinct inspection ${i + 1}`, 202, await submit(baseBody, `sa1-growth-${i}`));
  const growthAfter = await snapshot();
  cases.push({ name: 'bounded repeated valid requests demonstrate retained growth', passed: growthAfter.assets - growthBefore.assets === 3 && growthAfter.inspections - growthBefore.inspections === 6,
    before: growthBefore, after: growthAfter, limitation: 'No exhaustion or global capacity/retention guarantee tested' });
  const readyBefore = await snapshot();
  for (let i = 0; i < 5; i++) check(`readiness probe ${i + 1}`, 200, await http('/api/v1/ready'));
  const readyAfter = await snapshot();
  cases.push({ name: 'readiness probes leave no persistent growth', passed: JSON.stringify(readyBefore) === JSON.stringify(readyAfter), before: readyBefore, after: readyAfter });
  const after = await snapshot();
  await save('http-resources.json', { before, after, cases, requests, passed: cases.filter(item => item.passed).length,
    failed: cases.filter(item => !item.passed).length, sharp: sharp.versions, requestLimitPerCase: 50, spacingMs: 550 });
  console.log(JSON.stringify({ cases: cases.length, passed: cases.filter(item => item.passed).length, failed: cases.filter(item => !item.passed).length, requests: requests.length }));
} finally { await db.close(); }
