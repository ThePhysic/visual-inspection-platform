import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

// Bounded browser verification against an already-running full Compose stack.
// No managed host API/worker servers or native test database teardown.
export default defineConfig({
  testDir: './container-test', workers: 1, fullyParallel: false,
  timeout: 60_000, expect: { timeout: 20_000 }, retries: 0,
  forbidOnly: Boolean(process.env.CI), reporter: 'list',
  use: { baseURL: process.env.CONTAINER_BASE_URL ?? 'http://127.0.0.1:8080', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
