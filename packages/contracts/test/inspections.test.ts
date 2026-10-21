import { describe, expect, it } from 'vitest';
import { isInferenceResult, MOCK_CONFIGURATION, type InferenceResult } from '../src/index.js';

function result(): InferenceResult {
  return { contractVersion: 'v1', ...MOCK_CONFIGURATION, taxonomyVersion: 'mock-v1', simulated: true, durationMs: 0,
    detections: [{ id: 'prediction-1', classId: 'surface-mark', label: 'Surface mark', confidence: 0.9,
      boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }] };
}

describe('versioned inference boundary', () => {
  it('accepts a result and a valid zero-detection result', () => {
    expect(isInferenceResult(result())).toBe(true);
    expect(isInferenceResult({ ...result(), detections: [] })).toBe(true);
  });
  it.each([
    { x: -0.1 }, { y: -0.1 }, { width: 0 }, { height: 0 }, { width: -1 },
    { x: 0.9, width: 0.2 }, { y: 0.9, height: 0.2 },
    { x: NaN }, { y: Infinity }, { width: Infinity },
  ])('rejects invalid or cross-boundary coordinates %j', changes => {
    const value = result();
    Object.assign(value.detections[0]!.boundingBox, changes);
    expect(isInferenceResult(value)).toBe(false);
  });
  it.each([-0.1, 1.1, NaN, Infinity])('rejects invalid confidence %s', confidence => {
    const value = result(); value.detections[0]!.confidence = confidence;
    expect(isInferenceResult(value)).toBe(false);
  });
  it('rejects duplicate identities and results above 200 detections', () => {
    const value = result();
    value.detections.push(value.detections[0]!);
    expect(isInferenceResult(value)).toBe(false);
    value.detections = Array.from({ length: 201 }, (_, index) => ({ ...value.detections[0]!, id: `p-${index}` }));
    expect(isInferenceResult(value)).toBe(false);
  });
  it('rejects nonfinite duration and incompatible contract versions', () => {
    expect(isInferenceResult({ ...result(), durationMs: Infinity })).toBe(false);
    expect(isInferenceResult({ ...result(), contractVersion: 'v2' })).toBe(false);
  });
});
