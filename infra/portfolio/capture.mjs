// Authentic browser captures from fresh, ownership-verified application data.
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { disposableEnvironment, pnpmCommand, command, root } from '../docker/disposable.mjs';

const flags = process.argv.slice(2);
if (flags.length > 1 || flags.some(flag => flag !== '--ci-mongodb')) throw new Error('Only --ci-mongodb is supported');
const environment = await disposableEnvironment({ ciMongoCompatibility: flags.includes('--ci-mongodb'), cleanupBuiltImages: true });
try {
  await environment.compose(['config', '--quiet']);
  await environment.compose(['build'], { echo: true, timeout: 600_000 });
  await environment.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
  await environment.verifyOwnership(); await environment.verifyMongoCompatibility();
  await pnpmCommand(['--filter', '@vip/web', 'exec', 'playwright', 'test', '--config', 'playwright.container.config.ts', 'portfolio.spec.ts'], {
    env: { ...environment.environment, VIP_CAPTURE_PORTFOLIO: '1' }, echo: true, timeout: 180_000,
  });
  const directory = resolve(root, 'docs/screenshots');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'capture.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), sourceHead: await command('git', ['rev-parse', 'HEAD']),
    workingTreeDirty: Boolean(await command('git', ['status', '--porcelain'])),
    project: environment.project, viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1,
    browser: 'Playwright Chromium', test: 'apps/web/container-test/portfolio.spec.ts',
    files: ['inspection.png', 'review.png', 'history.png'],
    disclosure: 'Real browser, API, worker, MongoDB and Redis; original synthetic illustrations and deterministic simulated inference. No mocked HTTP, compositing or image retouching.',
  }, null, 2) + '\n');
} catch (error) {
  await environment.compose(['logs', '--no-color', '--tail', '60', 'api', 'worker'], { echo: true }).catch(() => {});
  throw error;
} finally { await environment.cleanup(); }
