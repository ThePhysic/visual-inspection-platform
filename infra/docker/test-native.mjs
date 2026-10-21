// Same integration and Playwright commands as CI previously ran, with explicit
// dependency startup AFTER diagnostics and the existing disposable safety guard.
import { disposableEnvironment, pnpmCommand } from './disposable.mjs';

const test = await disposableEnvironment({ ciMongoCompatibility: true });
console.log(`Isolated native CI environment: ${test.project}`);
try {
  await test.compose(['config', '--quiet']);
  await test.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'mongodb', 'redis'], { echo: true });
  await test.verifyOwnership();
  await test.verifyMongoCompatibility();
  for (const script of ['test:integration', 'test:e2e']) {
    await pnpmCommand([script], { env: test.environment, echo: true, timeout: 300_000 });
  }
  await test.verifyMongoCompatibility();
} catch (error) {
  await test.compose(['logs', '--no-color', '--tail', '80'], { echo: true }).catch(() => {});
  throw error;
} finally { await test.cleanup(); }
