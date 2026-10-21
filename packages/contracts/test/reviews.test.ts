import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { SaveReviewRequestSchema, PersistedReviewSchema, validReviewAnnotations, canonicalReviewAnnotations, type SaveReviewRequest, type InferenceResult } from '../src/index.js';

const result: InferenceResult = { contractVersion: 'v1', providerId: 'mock', modelId: 'mock-detector', modelVersion: '1.0.0',
  taxonomyVersion: 'mock-v1', simulated: true, durationMs: 0, detections: [{ id: 'p1', classId: 'surface-mark', label: 'Surface mark', confidence: 0.9,
    boundingBox: { x: 0, y: 0, width: 1, height: 1 } }] };
const request: SaveReviewRequest = { contractVersion: 'v1', taxonomyVersion: 'mock-v1', expectedRevision: 0, expectedWriteSequence: 0,
  operationId: 'a1234567-1234-4123-8123-123456789abc', annotations: [{ origin: 'prediction', id: 'prediction:p1', predictionId: 'p1',
    classId: 'surface-mark', disposition: 'rejected', boundingBox: { x: 0, y: 0, width: 1, height: 1 } }] };

describe('versioned review wire contracts', () => {
  it('accepts complete rejected snapshots and distinguishes persisted empty reviews from absence', () => {
    expect(Value.Check(SaveReviewRequestSchema, request)).toBe(true);
    expect(validReviewAnnotations(request.annotations, result)).toBe(true);
    expect(Value.Check(PersistedReviewSchema, { contractVersion: 'v1', taxonomyVersion: 'mock-v1', revision: 1,
      savedAt: '2026-10-21T00:00:00.000Z', annotations: [] })).toBe(true);
    expect(validReviewAnnotations([], { ...result, detections: [] })).toBe(true);
    expect(Value.Check(PersistedReviewSchema, undefined)).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity, -0.1, 1.1])('rejects invalid x coordinate %s', value => {
    const copy = structuredClone(request); copy.annotations[0]!.boundingBox.x = value;
    expect(validReviewAnnotations(copy.annotations, result)).toBe(false);
  });
  it('enforces cross-field boundaries, positive boxes, full coverage, and unique references', () => {
    const copy = structuredClone(request); copy.annotations[0]!.boundingBox.x = 0.1;
    expect(Value.Check(SaveReviewRequestSchema, copy)).toBe(true);
    expect(validReviewAnnotations(copy.annotations, result)).toBe(false);
    copy.annotations[0]!.boundingBox.width = 0;
    expect(validReviewAnnotations(copy.annotations, result)).toBe(false);
    expect(validReviewAnnotations([], result)).toBe(false);
    expect(validReviewAnnotations([...request.annotations, ...request.annotations], result)).toBe(false);
  });
  it('rejects client confidence, labels, inference metadata, and manual prediction references', () => {
    for (const field of [{ confidence: 1 }, { label: 'Forged label' }, { providerId: 'other' }]) {
      expect(Value.Check(SaveReviewRequestSchema, { ...request, annotations: [{ ...request.annotations[0], ...field }] })).toBe(false);
    }
    expect(Value.Check(SaveReviewRequestSchema, { ...request, annotations: [{ origin: 'manual', id: `manual:${request.operationId}`,
      predictionId: 'p1', classId: 'surface-mark', disposition: 'accepted', boundingBox: result.detections[0]!.boundingBox }] })).toBe(false);
  });
  it('accepts manual objects without confidence and canonicalizes order without mutation', () => {
    const annotations = [...request.annotations, { origin: 'manual' as const, id: `manual:${request.operationId}`, classId: 'edge-defect' as const,
      disposition: 'accepted' as const, boundingBox: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 } }];
    expect(validReviewAnnotations(annotations, result)).toBe(true);
    const before = structuredClone(annotations);
    expect(canonicalReviewAnnotations(annotations)).toEqual(canonicalReviewAnnotations([...annotations].reverse()));
    expect(annotations).toEqual(before);
  });
});
