// Run on stdin inside the worker, with cwd /app/apps/worker.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

assert.notEqual(process.getuid(), 0);
assert.equal(process.env.NODE_ENV, 'production');
assert.equal(process.env.ASSET_STORAGE_DIR, '/data/images');
assert.equal(new URL(process.env.MONGODB_URI).hostname, 'mongodb');
assert.equal(new URL(process.env.REDIS_URL).hostname, 'redis');
const require = createRequire(`${process.cwd()}/package.json`);
for (const dependency of ['typescript', 'tsx', 'vite', 'vitest', 'sharp']) {
  assert.throws(() => require.resolve(dependency), { code: 'MODULE_NOT_FOUND' });
}
for (const path of ['/app/.env', '/app/.git', '/app/.tools', '/app/apps/worker/src', '/app/packages/backend/src']) await assert.rejects(access(path));
const probe = `/data/images/.worker-probe-${randomUUID()}`;
try {
  await assert.rejects(writeFile(probe, '', { flag: 'wx' }), { code: 'EROFS' });
} finally {
  // If a misconfigured writable mount let the probe through, remove only this
  // check's own file. Never enumerate or remove stored images.
  await unlink(probe).catch(error => { if (!['ENOENT', 'EROFS'].includes(error.code)) throw error; });
}
console.log('Worker runtime check passed: non-root, production-only dependencies, shared images mounted read-only.');
