import { createHash } from 'node:crypto';
import { MOCK_CONFIGURATION, MOCK_LABELS, type InferenceResult, type InspectionFailure } from '@vip/contracts';

export interface CanonicalImage {
  bytes: Uint8Array;
  sha256: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

export interface InferenceProvider {
  infer(image: CanonicalImage, signal: AbortSignal): Promise<unknown>;
}

export class InferenceError extends Error {
  constructor(public readonly code: InspectionFailure['code'], public readonly retryable: boolean) {
    super(code);
    this.name = 'InferenceError';
  }
}

// Filled with checksums of the documented, canonical synthetic demo fixtures.
export const MOCK_FIXTURES = {
  panel: '9b28b8449555da30966b470b427c4286a7fcca8980754d2953861f9c31c5119c',
  empty: '4a09cda5ec3277cffac23a1dbbdcf646fc904ad159f55cfe4ff7ad3fcc6e979d',
};

export class MockInferenceProvider implements InferenceProvider {
  async infer(image: CanonicalImage, signal: AbortSignal): Promise<InferenceResult> {
    signal.throwIfAborted();
    const sha256 = createHash('sha256').update(image.bytes).digest('hex');
    const seed = createHash('sha256').update(image.bytes).update(MOCK_CONFIGURATION.modelVersion).digest();
    const count = sha256 === MOCK_FIXTURES.empty ? 0 : sha256 === MOCK_FIXTURES.panel ? 1 : seed[0]! % 3;
    return {
      contractVersion: 'v1', ...MOCK_CONFIGURATION, taxonomyVersion: 'mock-v1', simulated: true,
      // The mock does not claim a measured model runtime. Worker wall time is
      // recorded separately on the inspection, outside deterministic predictions.
      durationMs: 0,
      detections: Array.from({ length: count }, (_, index) => ({
        id: `mock-v1-${sha256.slice(0, 16)}-${index}`,
        ...MOCK_LABELS[index % MOCK_LABELS.length]!,
        confidence: sha256 === MOCK_FIXTURES.panel ? 0.94 : (75 + seed[index + 1]! % 20) / 100,
        boundingBox: sha256 === MOCK_FIXTURES.panel
          ? { x: 12 / 64, y: 16 / 64, width: 20 / 64, height: 12 / 64 }
          : { x: (5 + seed[index + 4]! % 50) / 100, y: (5 + seed[index + 6]! % 50) / 100, width: 0.2, height: 0.2 },
      })),
    };
  }
}
