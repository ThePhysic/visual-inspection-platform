import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HistoryQuerySchema, isInspectionHistoryResponse } from '../src/index.js';

const summary = { id: '0123456789abcdef01234567', assetId: 'abcdef0123456789abcdef01',
  createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z',
  status: 'completed', hasReview: true, reviewRevision: 2, detectionCount: 0,
  previewUrl: '/api/v1/assets/abcdef0123456789abcdef01/content' };
describe('history contracts', () => {
  it('accepts defaults, bounded string parameters, empty pages, and reviewed zero detections', () => {
    expect(Value.Check(HistoryQuerySchema, {})).toBe(true);
    expect(Value.Check(HistoryQuerySchema, { limit: '50', status: 'completed', cursor: 'abc_123' })).toBe(true);
    expect(isInspectionHistoryResponse({ items: [], hasMore: false })).toBe(true);
    expect(isInspectionHistoryResponse({ items: [summary], hasMore: false })).toBe(true);
  });
  it.each([{ limit: 20 }, { limit: '0' }, { limit: '51' }, { limit: '1.1' }, { status: 'all' }, { sort: '_id' }, { cursor: '' }])('rejects invalid query %j', query => {
    expect(Value.Check(HistoryQuerySchema, query)).toBe(false);
  });
  it('rejects duplicate IDs, inconsistent pagination/review flags, arbitrary preview URLs, and heavy payloads', () => {
    for (const body of [{ items: [summary, summary], hasMore: false }, { items: [], hasMore: true, nextCursor: 'abc' },
      { items: [summary], hasMore: true }, { items: [summary], hasMore: false, nextCursor: 'abc' },
      { items: [{ ...summary, hasReview: false }], hasMore: false },
      { items: [{ ...summary, previewUrl: 'file:///secret' }], hasMore: false },
      { items: [{ ...summary, result: {} }], hasMore: false }]) expect(isInspectionHistoryResponse(body)).toBe(false);
  });
});
