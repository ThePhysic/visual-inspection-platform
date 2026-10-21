import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_CONFIGURATION, isInspectionHistoryResponse, type InferenceResult, type InspectionHistoryResponse, type InspectionStatus } from '@vip/contracts';
import { connectDatabase, createAssetModel, createInspectionModel } from '@vip/backend';
import { buildApp } from '../src/app.js';

const time = new Date('2026-10-21T00:00:00.000Z');
const result: InferenceResult = { contractVersion: 'v1', ...MOCK_CONFIGURATION, taxonomyVersion: 'mock-v1', simulated: true, durationMs: 0,
  detections: [{ id: 'private-prediction-id', classId: 'surface-mark', label: 'Surface mark', confidence: 0.94,
    boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }] };
const objectId = (number: number) => new Types.ObjectId(number.toString(16).padStart(24, '0'));

describe('inspection history and recovery with genuine MongoDB', () => {
  const name = `vip_history_test_${randomUUID().replaceAll('-', '')}`;
  let connection: Awaited<ReturnType<typeof connectDatabase>>;
  let inspections: ReturnType<typeof createInspectionModel>;
  let assets: ReturnType<typeof createAssetModel>;
  let assetId: Types.ObjectId;
  let app: ReturnType<typeof buildApp>;
  beforeAll(async () => {
    connection = await connectDatabase(process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017', name);
    inspections = createInspectionModel(connection); assets = createAssetModel(connection);
    await Promise.all([inspections.createIndexes(), assets.createIndexes()]);
    assetId = (await assets.create({ storageKey: randomUUID(), mimeType: 'image/png', width: 64, height: 64,
      byteLength: 100, sha256: 'a'.repeat(64), source: 'api' }))._id;
  });
  beforeEach(async () => { await inspections.deleteMany({}); app = buildApp({ inspections: { assets, inspections } }); });
  afterEach(async () => { vi.restoreAllMocks(); await app.close(); });
  afterAll(async () => {
    if (connection) {
      if (connection.name !== name || !name.startsWith('vip_history_test_')) throw new Error('Unsafe history database cleanup');
      await connection.dropDatabase(); await connection.close();
    }
  });
  function record(number: number, status: InspectionStatus = 'completed', createdAt = time) {
    return { _id: objectId(number), assetId, status, createdAt, updatedAt: new Date(time.getTime() - number),
      requested: MOCK_CONFIGURATION, requestScope: 'test', requestKey: randomUUID(), requestFingerprint: 'test', requestId: 'test',
      ...(status === 'completed' ? { completedAt: time, processingDurationMs: 0, result } : {}),
      ...(status === 'failed' ? { completedAt: time, failure: { code: 'INFERENCE_FAILED', message: 'Simulated inference failed.' } } : {}),
    };
  }
  const get = (query = '') => app.inject({ method: 'GET', url: `/api/v1/inspections${query}` });
  async function page(query = '') {
    const response = await get(query); expect(response.statusCode, response.body).toBe(200);
    const body = response.json<InspectionHistoryResponse>(); expect(isInspectionHistoryResponse(body)).toBe(true); return body;
  }
  function retry(id: string, key = randomUUID()) {
    return app.inject({ method: 'POST', url: `/api/v1/inspections/${id}/retry`, headers: { 'idempotency-key': key } });
  }
  it('returns an empty history without a cursor', async () => { expect(await page()).toEqual({ items: [], hasMore: false }); });
  it('uses default 20 and a maximum of 50, with a lookahead cursor only when needed', async () => {
    await inspections.insertMany(Array.from({ length: 51 }, (_, index) => record(index + 1)));
    expect((await page()).items).toHaveLength(20);
    const first = await page('?limit=50'); expect(first.items).toHaveLength(50); expect(first.hasMore).toBe(true);
    const last = await page(`?limit=50&cursor=${first.nextCursor}`);
    expect(last.items).toHaveLength(1); expect(last.hasMore).toBe(false); expect(last.nextCursor).toBeUndefined();
  });
  it.each(['0', '-1', '51', '500', '1.5', '01', 'NaN', 'Infinity', '', ' 2'])('rejects invalid limit %j', async limit => {
    const response = await get(`?limit=${encodeURIComponent(limit)}`); expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_HISTORY_QUERY');
  });
  it('rejects arbitrary query fields and repeated parameters', async () => {
    for (const query of ['?sort=updatedAt', '?status=completed&status=failed', '?limit=2&limit=3', '?filter[$where]=true']) {
      expect((await get(query)).statusCode).toBe(400);
    }
  });
  it('paginates stable descending timestamps and IDs over several pages without duplicates or omissions', async () => {
    const rows = Array.from({ length: 47 }, (_, index) => record(index + 1, 'completed', new Date(time.getTime() + Math.floor(index / 4))));
    await inspections.insertMany([...rows].reverse());
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await page(`?limit=7${cursor ? `&cursor=${cursor}` : ''}`);
      ids.push(...response.items.map(item => item.id)); cursor = response.nextCursor;
    } while (cursor);
    expect(ids).toEqual(rows.map(row => row._id.toString()).reverse()); expect(new Set(ids).size).toBe(47);
  });
  it('keeps newer inserts ahead of an existing boundary; refreshing the first page includes them', async () => {
    await inspections.insertMany([record(1), record(2), record(3)]);
    const first = await page('?limit=2');
    await inspections.create(record(4, 'completed', new Date(time.getTime() + 1)));
    const next = await page(`?limit=2&cursor=${first.nextCursor}`);
    expect(next.items.map(item => item.id)).toEqual([objectId(1).toString()]);
    expect((await page('?limit=2')).items[0]!.id).toBe(objectId(4).toString());
  });
  it.each(['queued', 'processing', 'completed', 'failed'] as const)('filters %s on the server across pages', async status => {
    await inspections.insertMany([record(1, status), record(2, status), record(3, status), record(4, status === 'failed' ? 'completed' : 'failed')]);
    const first = await page(`?status=${status}&limit=2`); expect(first.items.every(item => item.status === status)).toBe(true);
    expect((await page(`?status=${status}&limit=2&cursor=${first.nextCursor}`)).items.map(item => item.id)).toEqual([objectId(1).toString()]);
    expect((await get(`?status=${status === 'failed' ? 'completed' : 'failed'}&cursor=${first.nextCursor}`)).json().error.code).toBe('INVALID_CURSOR');
    expect((await get(`?cursor=${first.nextCursor}`)).statusCode).toBe(400);
  });
  it.each(['unknown', 'COMPLETED', '', 'all', '$ne'])('rejects invalid status %j', async status => {
    expect((await get(`?status=${encodeURIComponent(status)}`)).statusCode).toBe(400);
  });
  it.each(['bad', 'e30', '!!!!', '', 'x'.repeat(513)])('rejects malformed cursor %j', async cursor => {
    const response = await get(`?cursor=${encodeURIComponent(cursor)}`); expect(response.statusCode).toBe(400);
    expect(response.body).not.toMatch(/SyntaxError|stack|MongoServer/);
  });
  it('rejects unsupported cursor versions, invalid dates, unexpected fields, and all-to-filter reuse', async () => {
    await inspections.insertMany([record(1), record(2)]);
    const first = await page('?limit=1');
    expect((await get(`?status=completed&cursor=${first.nextCursor}`)).statusCode).toBe(400);
    const cursor = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString()) as Record<string, unknown>;
    for (const modified of [{ ...cursor, version: 2 }, { ...cursor, createdAt: '2026-02-30T00:00:00.000Z' },
      { ...cursor, query: { $where: 'malicious' } }, { ...cursor, id: 'invalid' }, { ...cursor, status: {} }]) {
      expect((await get(`?cursor=${Buffer.from(JSON.stringify(modified)).toString('base64url')}`)).json().error.code).toBe('INVALID_CURSOR');
    }
  });
  it('returns bounded counts, review revisions, and allowlisted safe failures without full snapshots or internals', async () => {
    await inspections.create({ ...record(1), review: { contractVersion: 'v1', taxonomyVersion: 'mock-v1', revision: 4,
      savedAt: time.toISOString(), annotations: [{ origin: 'prediction', id: 'prediction:private-prediction-id', predictionId: 'private-prediction-id',
        classId: 'edge-defect', disposition: 'rejected', boundingBox: result.detections[0]!.boundingBox }] } });
    await inspections.create(record(2, 'failed'));
    await inspections.create({ ...record(3), result: { ...result, detections: [] }, retriedFrom: objectId(2) });
    await inspections.collection.updateOne({ _id: objectId(2) }, { $set: { 'failure.internalStack': 'private stack' } });
    const response = await get(); expect(response.statusCode).toBe(200);
    const items = response.json<InspectionHistoryResponse>().items;
    expect(items.find(item => item.id === objectId(1).toString())).toMatchObject({ detectionCount: 1, hasReview: true, reviewRevision: 4 });
    expect(items[0]).toMatchObject({ detectionCount: 0, hasReview: false, retriedFrom: objectId(2).toString() });
    expect(items[1]).toMatchObject({ failure: { code: 'INFERENCE_FAILED', message: 'Simulated inference failed.' } });
    expect(response.body).not.toMatch(/private-prediction-id|annotations|boundingBox|confidence|requestKey|reviewControl|attemptId|internalStack|private stack|storageKey/);
    expect(items[0]!.previewUrl).toBe(`/api/v1/assets/${assetId.toString()}/content`);
  });
  it('installs indexes for the actual history and forward-lineage queries', async () => {
    const indexes = await inspections.collection.indexes();
    for (const key of [{ createdAt: -1, _id: -1 }, { status: 1, createdAt: -1, _id: -1 }, { retriedFrom: 1, createdAt: -1, _id: -1 }]) {
      expect(indexes.some(index => JSON.stringify(index.key) === JSON.stringify(key))).toBe(true);
    }
  });
  it('returns safe database failures', async () => {
    vi.spyOn(inspections, 'aggregate').mockImplementationOnce(() => { throw new Error('secret Mongo connection string'); });
    const response = await get(); expect(response.statusCode).toBe(503); expect(response.json().error.code).toBe('DATABASE_FAILURE');
    expect(response.body).not.toMatch(/secret|stack/);
  });
  it('preserves the failed record, deduplicates retries, and exposes latest-child/predecessor links', async () => {
    const parent = await inspections.create(record(1, 'failed'));
    const before = await inspections.findById(parent._id).lean().orFail();
    const key = randomUUID(); const [a, b] = await Promise.all([retry(parent.id, key), retry(parent.id, key)]);
    expect([a.statusCode, b.statusCode]).toEqual([202, 202]); expect(a.json().id).toBe(b.json().id); expect(a.json().id).not.toBe(parent.id);
    expect((await retry(parent.id, key)).json().id).toBe(a.json().id);
    const child = await app.inject({ method: 'GET', url: a.json().url }); expect(child.json().retriedFrom).toBe(parent.id);
    const previous = await app.inject({ method: 'GET', url: `/api/v1/inspections/${parent.id}` });
    expect(previous.json().latestRetryId).toBe(a.json().id);
    expect(await inspections.findById(parent._id).lean().orFail()).toEqual(before);
    const summary = await page(); expect(summary.items.find(item => item.id === a.json().id)?.retriedFrom).toBe(parent.id);
  });
  it.each(['queued', 'processing', 'completed'] as const)('rejects manual retry of %s without creating another record', async status => {
    const row = await inspections.create(record(1, status)); const response = await retry(row.id);
    expect(response.statusCode).toBe(409); expect(response.json().error.code).toBe('INSPECTION_NOT_FAILED');
    expect(await inspections.countDocuments()).toBe(1);
  });
  it('chooses the latest retry deterministically when children share timestamps', async () => {
    await inspections.create(record(1, 'failed'));
    await inspections.insertMany([{ ...record(2, 'queued'), retriedFrom: objectId(1) }, { ...record(3, 'queued'), retriedFrom: objectId(1) }]);
    const response = await app.inject({ method: 'GET', url: `/api/v1/inspections/${objectId(1)}` });
    expect(response.json().latestRetryId).toBe(objectId(3).toString());
  });
});
