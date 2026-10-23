import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { state, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';
const test = await loadEnvironment();
await test.verify();
const cases = [];
for (const path of ['/metrics', '/queue']) {
  const response = await fetch(test.CONTAINER_BASE_URL + path);
  const body = await response.text();
  cases.push({ path, status: response.status, contentType: response.headers.get('content-type'),
    passed: response.status === 200 && body.includes('<div id="root">') && !body.includes('vip_http_requests_total{'),
    interpretation: 'nginx SPA fallback; direct Fastify route and operator evidence are recorded in runtime.json' });
  await pause(550);
}
const log = (await test.compose(['logs', '--no-color', '--tail', '1000', 'api'])).stdout;
const incoming = [];
const completed = new Map();
for (const line of log.split('\n')) {
  try {
    const entry = JSON.parse(line.slice(line.indexOf('{')));
    if (entry.req && entry.req.method === 'OPTIONS') incoming.push({ id: entry.requestId, method: entry.req.method, path: entry.req.url });
    if (entry.res) completed.set(entry.requestId, entry.res.statusCode);
  } catch { /* Non-JSON Compose prefixes are irrelevant to selected synthetic events. */ }
}
const original = JSON.parse(await readFile(resolve(state.evidence, 'http-resources.json'), 'utf8'));
await save('http-followup.json', { cases, passed: cases.filter(item => item.passed).length,
  original: { passed: original.passed, failed: original.failed, falsePositiveCaseNames: original.cases.filter(item => !item.passed).map(item => item.name) },
  serverObservedPreflights: incoming.map(item => ({ ...item, status: completed.get(item.id) })),
  note: 'Original expectation failures retained. Follow-up corrects their interpretation without changing application behavior.' });
console.log(JSON.stringify({ cases, preflights: incoming.map(item => ({ ...item, status: completed.get(item.id) })) }));
