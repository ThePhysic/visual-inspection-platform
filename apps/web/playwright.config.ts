import { defineConfig, devices } from '@playwright/test';
import { apiPort, webPort, workspaceRoot, mongodbUri, redisUrl, storageDirectory } from './e2e/settings';

const environment = { MONGODB_URI: mongodbUri, REDIS_URL: redisUrl, ASSET_STORAGE_DIR: storageDirectory,
  API_HOST: '127.0.0.1', API_PORT: apiPort };
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  globalTeardown: './e2e/cleanup.ts',
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node apps/api/dist/server.js', cwd: workspaceRoot, env: environment,
      url: `http://127.0.0.1:${apiPort}/api/v1/ready`, reuseExistingServer: false, timeout: 30_000 },
    { command: 'node apps/worker/dist/main.js', cwd: workspaceRoot, env: environment,
      wait: { stdout: /Inspection worker ready; inference is simulated/ }, reuseExistingServer: false, timeout: 30_000 },
    { command: `pnpm --filter @vip/web exec vite preview --port ${webPort}`, cwd: workspaceRoot, env: environment,
      url: `http://127.0.0.1:${webPort}`, reuseExistingServer: false, timeout: 30_000 },
  ],
});
