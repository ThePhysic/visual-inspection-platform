import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
