import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase, createAssetModel, createInspectionModel, REVIEW_RECEIPT_LIMIT } from '@vip/backend';
import { MOCK_CONFIGURATION, type InferenceResult, type SaveReviewRequest, type SavedReviewResponse } from '@vip/contracts';
import { buildApp } from '../src/app.js';

const result: InferenceResult = {
  contractVersion: 'v1', ...MOCK_CONFIGURATION, taxonomyVersion: 'mock-v1', simulated: true, durationMs: 0,
  detections: [{ id: 'prediction-1', classId: 'surface-mark', label: 'Surface mark', confidence: 0.94,
    boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
};

describe('review snapshots with real MongoDB atomic updates', () => {
  const name = `vip_review_test_${randomUUID().replaceAll('-', '')}`;
  let connection: Awaited<ReturnType<typeof connectDatabase>>;
  let assets: ReturnType<typeof createAssetModel>;
  let inspections: ReturnType<typeof createInspectionModel>;
  let app: ReturnType<typeof buildApp>;
  let id: string;
  beforeAll(async () => {
    connection = await connectDatabase(process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017', name);
    assets = createAssetModel(connection); inspections = createInspectionModel(connection);
    await inspections.createIndexes();
  });
  beforeEach(async () => {
    await inspections.deleteMany({});
    const record = await inspections.create({ assetId: '0123456789abcdef01234567', status: 'completed',
      requested: MOCK_CONFIGURATION, requestScope: 'test', requestKey: randomUUID(), requestFingerprint: 'test', requestId: 'test',
      result, completedAt: new Date(), processingDurationMs: 0 });
    id = record._id.toString();
    app = buildApp({ inspections: { assets, inspections } });
  });
  afterEach(async () => { vi.restoreAllMocks(); await app.close(); });
  afterAll(async () => {
    if (connection) {
      if (connection.name !== name || !name.startsWith('vip_review_test_')) throw new Error('Unsafe review test cleanup');
      await connection.dropDatabase(); await connection.close();
    }
  });
  function payload(revision = 0, sequence = revision): SaveReviewRequest {
    return { contractVersion: 'v1', taxonomyVersion: 'mock-v1', expectedRevision: revision, expectedWriteSequence: sequence,
      operationId: randomUUID(), annotations: [{ id: 'prediction:prediction-1', origin: 'prediction', predictionId: 'prediction-1',
        classId: 'edge-defect', disposition: 'accepted', boundingBox: { ...result.detections[0]!.boundingBox } }] };
  }
  function put(body: unknown, inspectionId = id) { return app.inject({ method: 'PUT', url: `/api/v1/inspections/${inspectionId}/review`, payload: body as object }); }
  async function save(body = payload()) {
    const response = await put(body); expect(response.statusCode, response.body).toBe(200);
    return response.json<SavedReviewResponse>();
  }
  async function read() { return app.inject({ method: 'GET', url: `/api/v1/inspections/${id}` }); }

  it('saves revision 1, reopens after API/connection restart, and leaves inference untouched', async () => {
    expect((await read()).json().review).toBeUndefined();
    const saved = await save(); expect(saved.review.revision).toBe(1);
    expect(saved.outcome).toBe('saved');
    await app.close(); await connection.close();
    connection = await connectDatabase(process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017', name);
    assets = createAssetModel(connection); inspections = createInspectionModel(connection);
    app = buildApp({ inspections: { assets, inspections } });
    const reopened = (await read()).json();
    expect(reopened.review).toEqual(saved.review); expect(reopened.result).toEqual(result);
    expect(JSON.stringify(reopened)).not.toMatch(/reviewControl|fingerprint|operations/);
  });
  it('advances only changed snapshots and records no-op operations without changing savedAt', async () => {
    const first = await save(); const noOp = await save(payload(1));
    expect(noOp.review).toEqual(first.review); expect(noOp.outcome).toBe('unchanged'); expect(noOp.writeSequence).toBe(2);
    const changed = payload(1, 2); changed.annotations[0]!.disposition = 'rejected';
    expect((await save(changed)).review.revision).toBe(2);
  });
  it('allows a fully rejected snapshot, manual annotations without confidence, and restoring predictions', async () => {
    const request = payload(); request.annotations[0]!.disposition = 'rejected';
    request.annotations.push({ id: `manual:${randomUUID()}`, origin: 'manual', disposition: 'accepted', classId: 'surface-mark',
      boundingBox: { x: 0, y: 0, width: 1, height: 1 } });
    const first = await save(request); expect(first.review.annotations[1]).not.toHaveProperty('confidence');
    const next = { ...request, operationId: randomUUID(), expectedRevision: 1, expectedWriteSequence: 1 };
    next.annotations = next.annotations.slice(0, 1); await save(next);
    next.annotations[0]!.disposition = 'accepted'; next.operationId = randomUUID(); next.expectedRevision = 2; next.expectedWriteSequence = 2;
    expect((await save(next)).review.revision).toBe(3);
  });
  it('distinguishes an absent review from a saved empty review with zero predictions', async () => {
    await inspections.updateOne({ _id: id }, { $set: { result: { ...result, detections: [] } } });
    const request = payload(); request.annotations = [];
    expect((await save(request)).review).toMatchObject({ revision: 1, annotations: [] });
  });
  it.each(['queued', 'processing', 'failed'])('rejects reviews of %s inspections', async status => {
    await inspections.updateOne({ _id: id }, { $set: { status } });
    const response = await put(payload()); expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INSPECTION_NOT_COMPLETED');
  });
  it('rejects missing or corrupt committed inference', async () => {
    await inspections.collection.updateOne({ _id: (await inspections.findById(id).orFail())._id }, { $unset: { result: '' } });
    expect((await put(payload())).statusCode).toBe(503);
  });
  it('returns appropriate invalid/missing inspection errors', async () => {
    expect((await put(payload(), 'bad')).statusCode).toBe(400);
    expect((await put(payload(), '000000000000000000000000')).statusCode).toBe(404);
  });
  it.each([
    ['box exceeds image', (request: SaveReviewRequest) => { request.annotations[0]!.boundingBox.width = 1; }],
    ['negative box', (request: SaveReviewRequest) => { request.annotations[0]!.boundingBox.x = -1; }],
    ['zero width', (request: SaveReviewRequest) => { request.annotations[0]!.boundingBox.width = 0; }],
    ['unknown class', (request: SaveReviewRequest) => { Object.assign(request.annotations[0]!, { classId: 'invented' }); }],
    ['unknown taxonomy', (request: SaveReviewRequest) => { Object.assign(request, { taxonomyVersion: 'invented' }); }],
    ['duplicate annotation ID', (request: SaveReviewRequest) => { request.annotations.push(structuredClone(request.annotations[0]!)); }],
    ['unknown prediction', (request: SaveReviewRequest) => { Object.assign(request.annotations[0]!, { predictionId: 'other', id: 'prediction:other' }); }],
    ['missing disposition', (request: SaveReviewRequest) => { request.annotations = []; }],
    ['forged confidence', (request: SaveReviewRequest) => { Object.assign(request.annotations[0]!, { confidence: 1 }); }],
    ['manual impersonation', (request: SaveReviewRequest) => { Object.assign(request.annotations[0]!, { origin: 'manual' }); }],
    ['invalid revision', (request: SaveReviewRequest) => { request.expectedRevision = -1; }],
    ['excessive annotations', (request: SaveReviewRequest) => { request.annotations = Array.from({ length: 201 }, () => structuredClone(request.annotations[0]!)); }],
  ])('rejects %s without partially changing review or predictions', async (_name, mutate) => {
    const before = await save(); const request = payload(1); mutate(request);
    const response = await put(request); expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REVIEW');
    const record = (await read()).json(); expect(record.review).toEqual(before.review); expect(record.result).toEqual(result);
  });
  it('allows exactly one of two different concurrent saves and explicitly rejects stale writes', async () => {
    const a = payload(), b = payload(); b.annotations[0]!.disposition = 'rejected';
    const responses = await Promise.all([put(a), put(b)]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409]);
    const stale = await put(payload()); expect(stale.json().error.code).toBe('REVIEW_REVISION_CONFLICT');
    expect((await read()).json().review.revision).toBe(1);
  });
  it('deduplicates concurrent identical saves and repeated saves without revision increments', async () => {
    const request = payload(); const responses = await Promise.all([put(request), put(request)]);
    expect(responses.map(response => response.statusCode)).toEqual([200, 200]);
    const repeated = await save(request); expect(repeated.outcome).toBe('replayed');
    expect(repeated.review.revision).toBe(1); expect(repeated.writeSequence).toBe(1);
  });
  it('treats annotation order and JSON property order as semantically identical', async () => {
    const request = payload();
    request.annotations.push({ id: `manual:${randomUUID()}`, origin: 'manual', disposition: 'accepted', classId: 'surface-mark',
      boundingBox: { x: 0, y: 0, width: 1, height: 1 } });
    const first = await save(request);
    const reordered = { ...request, annotations: [...request.annotations].reverse().map(annotation => ({
      boundingBox: { height: annotation.boundingBox.height, width: annotation.boundingBox.width, y: annotation.boundingBox.y, x: annotation.boundingBox.x },
      ...Object.fromEntries(Object.entries(annotation).filter(([key]) => key !== 'boundingBox')),
    })) };
    const repeated = await put(reordered); expect(repeated.statusCode, repeated.body).toBe(200);
    expect(repeated.json().outcome).toBe('replayed');
    const noOp = { ...reordered, expectedRevision: 1, expectedWriteSequence: 1, operationId: randomUUID() };
    const response = await put(noOp); expect(response.statusCode, response.body).toBe(200);
    expect(response.json().review).toEqual(first.review); expect(response.json().outcome).toBe('unchanged');
  });
  it('accepts exactly 200 annotations including retained rejected predictions', async () => {
    const request = payload(); request.annotations[0]!.disposition = 'rejected';
    for (let index = 1; index < 200; index++) request.annotations.push({
      id: `manual:${randomUUID()}`, origin: 'manual', disposition: 'accepted', classId: 'surface-mark',
      boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    });
    expect((await save(request)).review.annotations).toHaveLength(200);
  });
  it('rejects operation-ID reuse with changed content, including changed base tokens', async () => {
    const request = payload(); await save(request);
    request.annotations[0]!.disposition = 'rejected';
    expect((await put(request)).json().error.code).toBe('REVIEW_OPERATION_CONFLICT');
    request.expectedRevision = 1; request.expectedWriteSequence = 1;
    expect((await put(request)).statusCode).toBe(409);
    expect((await read()).json().review.revision).toBe(1);
  });
  it('recovers when Mongo commits but the response is lost', async () => {
    const request = payload();
    const original = inspections.findOneAndUpdate.bind(inspections);
    const spy = vi.spyOn(inspections, 'findOneAndUpdate').mockImplementationOnce((...args) => {
      const query = original(...args);
      const execute = query.exec.bind(query);
      vi.spyOn(query, 'exec').mockImplementationOnce(async () => { await execute(); throw new Error('simulated lost acknowledgement'); });
      return query;
    });
    const ambiguous = await put(request); expect(ambiguous.statusCode).toBe(503); spy.mockRestore();
    const retry = await save(request); expect(retry.outcome).toBe('replayed'); expect(retry.review.revision).toBe(1);
  });
  it('returns current review for old retained operations without rolling newer changes backward', async () => {
    const old = payload(); await save(old);
    const next = payload(1); next.annotations[0]!.disposition = 'rejected'; const newer = await save(next);
    const replayed = await save(old); expect(replayed.outcome).toBe('superseded');
    expect(replayed.operationRevision).toBe(1); expect(replayed.review).toEqual(newer.review);
  });
  it('bounds receipts and prevents evicted operations replaying after no-op saves at the same revision', async () => {
    await save(); const old = payload(1); await save(old);
    for (let index = 0; index < REVIEW_RECEIPT_LIMIT; index++) await save(payload(1, index + 2));
    const record = await inspections.findById(id).lean().orFail();
    expect(record.reviewControl?.operations).toHaveLength(REVIEW_RECEIPT_LIMIT);
    expect(record.review.revision).toBe(1);
    expect((await put(old)).json().error.code).toBe('REVIEW_REVISION_CONFLICT');
  });
  it('returns safe database failures without modifying stored review', async () => {
    const before = await save();
    vi.spyOn(inspections, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('secret connection path'); });
    const next = payload(1); next.annotations[0]!.disposition = 'rejected';
    const response = await put(next); expect(response.statusCode).toBe(503);
    expect(response.body).not.toMatch(/secret|stack/); expect((await read()).json().review).toEqual(before.review);
  });
});
