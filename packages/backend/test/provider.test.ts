import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isInferenceResult, MOCK_CONFIGURATION } from '@vip/contracts';
import { MockInferenceProvider, MOCK_FIXTURES, type CanonicalImage } from '../src/provider.js';
import { readBackendConfig } from '../src/config.js';

async function fixture(name: 'empty' | 'panel'): Promise<CanonicalImage> {
  return { bytes: await readFile(new URL(`../../../fixtures/inspections/${name}.png`, import.meta.url)),
    width: 64, height: 64, mimeType: 'image/png', sha256: MOCK_FIXTURES[name] };
}

describe('deterministic simulated inference', () => {
  it('matches the documented curated panel and blank cases', async () => {
    const provider = new MockInferenceProvider();
    const panel = await provider.infer(await fixture('panel'), new AbortController().signal);
    expect(isInferenceResult(panel)).toBe(true);
    expect(panel).toMatchObject({ ...MOCK_CONFIGURATION, taxonomyVersion: 'mock-v1', simulated: true });
    expect(panel.detections).toHaveLength(1);
    expect(panel.detections[0]?.boundingBox).toEqual({ x: 12 / 64, y: 16 / 64, width: 20 / 64, height: 12 / 64 });
    expect((await provider.infer(await fixture('empty'), new AbortController().signal)).detections).toEqual([]);
  });
  it('uses only image content and version, including for fallback output', async () => {
    const image = await fixture('panel');
    const first = await new MockInferenceProvider().infer(image, new AbortController().signal);
    const second = await new MockInferenceProvider().infer({ ...image, sha256: 'irrelevant caller metadata' }, new AbortController().signal);
    expect(first).toEqual(second);
    const fallback = { ...image, bytes: Buffer.from('deterministic algorithm fixture') };
    const a = await new MockInferenceProvider().infer(fallback, new AbortController().signal);
    const b = await new MockInferenceProvider().infer(fallback, new AbortController().signal);
    expect(a).toEqual(b);
    expect(isInferenceResult(a)).toBe(true);
  });
  it('honors cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(new MockInferenceProvider().infer(await fixture('empty'), controller.signal)).rejects.toBeDefined();
  });
});

describe('shared process configuration', () => {
  it('uses the same canonical image root for API and worker', () => {
    expect(readBackendConfig({}).storageDirectory).toMatch(/[\\/]\.data[\\/]images$/);
    expect(readBackendConfig({}).redisUrl).toBe('redis://127.0.0.1:6379');
  });
  it.each(['http://localhost', 'redis://', 'redis://localhost/not-a-db', 'redis://localhost?secret=yes'])(
    'rejects invalid Redis configuration without echoing values', REDIS_URL => {
      expect(() => readBackendConfig({ REDIS_URL })).toThrow('REDIS_URL must be a Redis connection URL.');
    });
});
