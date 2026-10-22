import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { disposableEnvironment, pnpmCommand, command, root } from './disposable.mjs';

const flags = new Set(process.argv.slice(2));
if ([...flags].some(flag => !['--native', '--browser', '--ci-mongodb'].includes(flag))) throw new Error('Use optional --native / --browser / --ci-mongodb');
const test = await disposableEnvironment({ ciMongoCompatibility: flags.has('--ci-mongodb') });
console.log(`Isolated reliability environment: ${test.project}`);
async function workerUnavailable(dependency) {
  await test.compose(['exec', '-T', 'worker', 'node', '--input-type=module', '-', dependency], {
    input: await readFile(resolve(root, 'infra/docker/check-worker-health.mjs'), 'utf8'), echo: true,
  });
}
async function workerRecovered() {
  // Compose up --wait can reject an already-unhealthy running container before
  // its next periodic probe. Observe recovery first; never restart to mask it.
  await test.verifyOwnership();
  const id = await test.compose(['ps', '-q', '--no-trunc', 'worker']);
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error(`Expected one owned worker (identifier length ${id.length})`);
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const health = await command('docker', ['inspect', '--format', '{{.State.Health.Status}}', id], { timeout: 5000 });
    if (health === 'healthy') return;
    await pause(250); // Bounded state polling, not an assumed recovery delay.
  }
  throw new Error('Worker did not regain Docker health after dependency recovery');
}
try {
  await test.compose(['config', '--quiet']);
  await test.compose(['build'], { echo: true, timeout: 600_000 });
  await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
  await test.verifyOwnership();
  await test.verifyMongoCompatibility();
  if (flags.has('--native')) {
    // Run existing real DB/queue suites against this project's private ports.
    // Native Playwright uses its own random DB, queue DB15 and storage directory.
    for (const script of ['test:integration', 'test:e2e']) {
      await pnpmCommand([script], { env: test.environment, echo: true, timeout: 300_000 });
    }
  }
  await test.inside('smoke.mjs', 'create');
  await test.compose(['exec', '-T', '-w', '/app/apps/worker', 'worker', 'node', '--input-type=module', '-'], {
    input: await readFile(resolve(root, 'infra/docker/check-worker.mjs'), 'utf8'), echo: true,
  });
  if (flags.has('--browser')) {
    // Uses installed host Playwright, never mocks the containerized API/worker.
    await pnpmCommand(['--filter', '@vip/web', 'exec', 'playwright', 'test', '--config', 'playwright.container.config.ts'], {
      env: test.environment, echo: true, timeout: 180_000,
    });
  }
  await test.disruptive(['stop', 'redis']);
  await test.inside('reliability.mjs', 'redis-down');
  await workerUnavailable('redis');
  // Restart API while Redis is still down: durable intent survives process loss.
  await test.disruptive(['restart', 'api']);
  await test.disruptive(['start', 'redis']);
  await workerRecovered();
  await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
  await test.inside('reliability.mjs', 'redis-recovered');
  await test.disruptive(['stop', 'worker']);
  const barrier = Promise.withResolvers();
  const persistence = test.compose(['exec', '-T', '-w', '/app/apps/api', 'api', 'node', '--input-type=module', '-'], {
    input: await readFile(resolve(root, 'infra/docker/persistence-window.mjs'), 'utf8'), echo: true,
    onOutput(output) { const match = output.match(/VIP_BEFORE_COMPLETION (\/tmp\/vip-result-release-[a-f0-9-]+)/); if (match) barrier.resolve(match[1]); },
  });
  // Observe the exact write boundary before disrupting this owned database.
  const releasePath = await Promise.race([barrier.promise, persistence.then(() => { throw new Error('Pre-commit barrier missing'); })]);
  await test.disruptive(['stop', 'mongodb']);
  await test.compose(['exec', '-T', 'api', 'node', '-e', "require('node:fs').writeFileSync(process.argv[1], 'release')", releasePath]);
  await persistence;
  await test.inside('reliability.mjs', 'mongo-down');
  await test.disruptive(['start', 'mongodb']);
  await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
  await test.inside('reliability.mjs', 'result-recovered');
  await test.inside('smoke.mjs', 'verify');
  await test.disruptive(['restart', 'api', 'worker']);
  await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
  await test.inside('smoke.mjs', 'verify');
  await test.inside('reliability.mjs', 'storage');
  // Prove the operator tool refuses a live image-volume consumer, then enforce
  // its offline boundary for this disposable environment only.
  await test.verifyOwnership();
  let refusedLiveCleanup = false;
  try { await pnpmCommand(['storage:maintenance', test.project, 'clean-staging-offline']); }
  catch (error) {
    if (!String(error).includes('Stop API/worker and every image-volume consumer')) throw error;
    refusedLiveCleanup = true;
  }
  if (!refusedLiveCleanup) throw new Error('Staging cleanup accepted running writers');
  await test.disruptive(['stop', 'api', 'worker']);
  await pnpmCommand(['storage:maintenance', test.project, 'clean-staging-offline'], { echo: true });
  await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
  await test.inside('smoke.mjs', 'verify');
  await test.compose(['exec', '-T', 'redis', 'redis-cli', 'SET', 'vip-reliability-marker', test.project]);
  await test.disruptive(['down']); // Preserve this test's volumes for recreation.
  await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
  await test.inside('smoke.mjs', 'verify');
  if (await test.compose(['exec', '-T', 'redis', 'redis-cli', 'GET', 'vip-reliability-marker']) !== test.project) {
    throw new Error('Redis persistence marker lost');
  }
  await test.verifyMongoCompatibility();
  console.log('Container reliability passed: acceptance during Redis outage, MongoDB rejection/recovery, restarts, recreation, storage report.');
} catch (error) {
  await test.compose(['logs', '--no-color', '--tail', '80'], { echo: true }).catch(() => {});
  throw error;
} finally { await test.cleanup(); }
