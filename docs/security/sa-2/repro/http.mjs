import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { root, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const phase = process.argv[2]; assert.ok(['before', 'after'].includes(phase));
const test = await loadEnvironment(); await test.verify();
const mongoose = createRequire(resolve(root, 'apps/api/package.json'))('mongoose');
const db = await mongoose.createConnection(test.MONGODB_TEST_URI, { dbName: `vip_reliability_${test.owner}` }).asPromise();
const png = await readFile(resolve(root, 'fixtures/inspections/panel.png'));
const boundary = 'SA2-synthetic-boundary';
const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
const target = new URL(test.CONTAINER_BASE_URL);
async function call(path, method = 'GET', headers = {}, payload) {
  await pause(550);
  return new Promise((done, reject) => {
    const req = request(new URL(path, target), { method, headers: { ...headers, ...(payload ? { 'content-length': payload.length } : {}) } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('HTTP deadline'))); req.on('error', reject); req.end(payload);
  });
}
const results = [];
try {
  for (const [name, origin, host, expected] of [
    ['native no Origin', undefined, target.host, 201], ['same origin', target.origin, target.host, 201],
    ['null Origin', 'null', target.host, 403], ['malformed Origin', 'invalid', target.host, 403],
    ['mismatched port', 'http://127.0.0.1:1', target.host, 403], ['alias mismatch', `http://localhost:${target.port}`, target.host, 403],
    ['scheme mismatch', `https://${target.host}`, target.host, 403], ['path in Origin', target.origin + '/', target.host, 403],
    ['multiple Origins', target.origin + ',http://unrelated.invalid', target.host, 403],
    ['unexpected Host', undefined, 'sa2-unrelated.invalid', 421],
  ]) {
    const before = await db.collection('assets').countDocuments();
    const response = await call('/api/v1/assets', 'POST', { Host: host, 'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(origin === undefined ? {} : { Origin: origin }) }, body);
    const after = await db.collection('assets').countDocuments();
    const wanted = phase === 'before' ? 201 : expected;
    results.push({ name, origin: origin ?? '(absent)', host, status: response.status, expected: wanted, assetEffect: after - before,
      responseDisclosure: response.headers['access-control-allow-origin'] ?? '(absent)' });
    assert.equal(response.status, wanted, name);
    assert.equal(after - before, wanted === 201 ? 1 : 0, name);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  const asset = await db.collection('assets').findOne({});
  const content = await call(`/api/v1/assets/${asset._id}/content`);
  assert.equal(content.status, 200);
  assert.equal(content.headers['cache-control'], phase === 'before' ? 'public, max-age=31536000, immutable' : 'private, no-store');
  assert.equal(content.headers.etag, `"${asset.sha256}"`);
  assert.equal(content.headers['content-type'], asset.mimeType);
  const rootResponse = await call('/');
  assert.equal(rootResponse.headers['x-frame-options'], phase === 'after' ? 'DENY' : undefined);
  for (const path of ['/inspections/synthetic', '/assets/missing.js', '/api/v1/health']) {
    const response = await call(path);
    if (phase === 'after') {
      assert.equal(response.headers['x-frame-options'], 'DENY');
      assert.ok(response.headers['content-security-policy'].includes("frame-ancestors 'none'"));
    }
    results.push({ name: 'framing headers ' + path, status: response.status, xFrameOptions: response.headers['x-frame-options'] ?? '(absent)' });
  }
  const canary = `SA2_${phase.toUpperCase()}_QUERY_CANARY`;
  await call('/api/v1/health?marker=' + canary);
  await pause(600);
  const logs = {};
  for (const service of ['api', 'web']) {
    const log = (await test.compose(['logs', '--no-color', '--tail', '200', service])).stdout;
    logs[service] = { queryCanaryPresent: log.includes(canary), requestCorrelationPresent: /requestId|req-[a-z0-9]+/.test(log) };
    assert.equal(logs[service].queryCanaryPresent, phase === 'before', service);
  }
  const storage = JSON.parse((await test.compose(['exec', '-T', 'api', 'node', '--input-type=module', '-'], {
    input: "import {readdir} from 'node:fs/promises'; const names=await readdir('/data/images'); console.log(JSON.stringify({canonical:names.filter(n=>/^[a-f0-9-]{36}\\.(png|jpg)$/.test(n)).length,staging:names.filter(n=>n.startsWith('.upload-')).length}));",
  })).stdout);
  assert.equal(storage.staging, 0);
  await save(`http-${phase}.json`, { phase, target: target.origin, cases: results, content: { cache: content.headers['cache-control'], etag: content.headers.etag,
    mime: content.headers['content-type'], byteLength: Number(content.headers['content-length']) }, logs, storage, assertions: 'All explicit assertions in repro/http.mjs completed' });
  console.log(JSON.stringify({ phase, cases: results.length, logs, storage }));
} finally { await db.close(); }
