import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, fetchAsset, fetchInspection, submitInspection, uploadAsset } from './api';
import { accepted, asset, completed } from './test/fixtures';

describe('browser API contract validation', () => {
  it.each([
    { ...completed, result: { ...completed.result, detections: [{ ...completed.result.detections[0]!, boundingBox: { x: 0.9, y: 0, width: 0.2, height: 0.1 } }] } },
    { ...completed, id: 'f'.repeat(24) },
    { ...completed, status: 'unknown' },
  ])('rejects inconsistent or invalid inspection data', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(fetchInspection(completed.id, new AbortController().signal)).rejects.toBeInstanceOf(ApiClientError);
  });
  it('rejects mismatched asset content URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...asset, contentUrl: '/api/v1/assets/ffffffffffffffffffffffff/content' })));
    await expect(fetchAsset(asset.id, new AbortController().signal)).rejects.toThrow('incompatible response');
  });
  it('requires an actual 202 acceptance response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(accepted, { status: 200 })));
    await expect(submitInspection(asset.id, 'key', new AbortController().signal)).rejects.toThrow('incompatible response');
  });
  it('validates successful asset upload metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...asset, width: 0 }, { status: 201 })));
    await expect(uploadAsset(new File(['bytes'], 'image.png'), new AbortController().signal)).rejects.toThrow('incompatible response');
  });
});
