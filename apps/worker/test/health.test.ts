import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consumerHealthy, startHealthFile, type ConsumerState } from '../src/health.js';

const state: ConsumerState = { mongodb: true, redis: true, running: true, oldestActiveAt: null, lastCompletedAt: null };
async function cleanDirectory(directory: string) {
  if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}vip-health-test-`)) throw new Error('Unsafe cleanup');
  await rm(directory, { recursive: true, force: true });
}
describe('local consumer supervision', () => {
  it('distinguishes idle connectivity from stalled active work and disconnected dependencies', () => {
    expect(consumerHealthy(state, 100_000, 40_000)).toBe(true);
    for (const dependency of ['mongodb', 'redis', 'running'] as const) {
      expect(consumerHealthy({ ...state, [dependency]: false }, 100_000, 40_000)).toBe(false);
    }
    expect(consumerHealthy({ ...state, oldestActiveAt: 60_000 }, 100_000, 40_000)).toBe(true);
    expect(consumerHealthy({ ...state, oldestActiveAt: 59_999 }, 100_000, 40_000)).toBe(false);
  });
  it('publishes bounded observations atomically and removes them on shutdown', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vip-health-test-'));
    const file = join(directory, 'health.json');
    let current = state;
    const health = startHealthFile(file, async () => current, 40_000);
    try {
      await health.sample();
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ healthy: true, oldestActiveAt: null });
      current = { ...state, redis: false };
      await health.sample();
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ healthy: false, redis: false });
      await health.close();
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await health.close();
      await cleanDirectory(directory);
    }
  });
});
