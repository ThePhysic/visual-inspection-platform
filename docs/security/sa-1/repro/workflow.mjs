import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { root, state, pnpm, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';
const test = await loadEnvironment();
await test.verify();
for (const port of [3003, 4174]) {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
  await new Promise(done => server.close(done));
}
await save('workflow-boundaries.json', { nativeLoopbackPorts: [3003, 4174], dependencies: 'Only the audit-owned MongoDB/Redis server ports',
  storage: '.data/browser-tests/<generated run ID> with existing exact-root cleanup guards',
  redis: 'Audit-owned Redis database 15', reuseExistingServer: false, sourceChanged: false });
const result = await pnpm(['--filter', '@vip/web', 'exec', 'playwright', 'test'], { env: {
  MONGODB_TEST_URI: test.MONGODB_TEST_URI, REDIS_TEST_URL: test.REDIS_TEST_URL,
  PLAYWRIGHT_BROWSERS_PATH: resolve(root, '.tools/playwright-browsers') },
  allowed: [0, 1], timeout: 300_000, privateLog: 'browser-workflow.log' });
const summary = (result.stdout + result.stderr).split('\n').filter(line => /passed|failed|skipped|Error:|error TS/.test(line)).slice(-30);
await save('browser-workflow.json', { command: 'pnpm --filter @vip/web exec playwright test', exitCode: result.code,
  durationMs: result.durationMs, summary, reportsPrivate: state.working.replace(root, '<workspace>') });
console.log(JSON.stringify({ exitCode: result.code, summary }));
