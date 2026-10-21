import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

export const INSPECTIONS_PATH = '/api/v1/inspections';
import { BoundingBoxSchema, MAX_DETECTIONS } from './annotations.js';
import { PersistedReviewSchema } from './reviews.js';
export { BoundingBoxSchema, MAX_DETECTIONS, MOCK_LABELS } from './annotations.js';
export const MOCK_CONFIGURATION = {
  providerId: 'mock', modelId: 'mock-detector', modelVersion: '1.0.0',
} as const;

export const ProviderConfigurationSchema = Type.Object({
  providerId: Type.Literal('mock'), modelId: Type.Literal('mock-detector'), modelVersion: Type.Literal('1.0.0'),
}, { additionalProperties: false });
export type ProviderConfiguration = Static<typeof ProviderConfigurationSchema>;


export const DetectionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 80 }),
  classId: Type.String({ minLength: 1, maxLength: 80 }),
  label: Type.String({ minLength: 1, maxLength: 128 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  boundingBox: BoundingBoxSchema,
}, { additionalProperties: false });

export const InferenceResultSchema = Type.Object({
  contractVersion: Type.Literal('v1'),
  providerId: Type.String({ minLength: 1, maxLength: 80 }),
  modelId: Type.String({ minLength: 1, maxLength: 80 }),
  modelVersion: Type.String({ minLength: 1, maxLength: 80 }),
  taxonomyVersion: Type.String({ minLength: 1, maxLength: 80 }),
  simulated: Type.Boolean(),
  durationMs: Type.Number({ minimum: 0 }),
  detections: Type.Array(DetectionSchema, { maxItems: MAX_DETECTIONS }),
}, { additionalProperties: false });
export type InferenceResult = Static<typeof InferenceResultSchema>;

export function isInferenceResult(value: unknown): value is InferenceResult {
  if (!Value.Check(InferenceResultSchema, value) || !Number.isFinite(value.durationMs)) return false;
  const identifiers = new Set<string>();
  for (const detection of value.detections) {
    const { x, y, width, height } = detection.boundingBox;
    if (![x, y, width, height, detection.confidence].every(Number.isFinite)
      || x + width > 1 || y + height > 1 || identifiers.has(detection.id)) return false;
    identifiers.add(detection.id);
  }
  return true;
}

const objectId = Type.String({ pattern: '^[a-fA-F0-9]{24}$' });
const timestamp = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' });
export const InspectionParamsSchema = Type.Object({ id: objectId }, { additionalProperties: false });
export const InspectionRequestSchema = Type.Object({
  assetId: objectId,
  provider: Type.Optional(ProviderConfigurationSchema),
}, { additionalProperties: false });
export const IdempotencyHeadersSchema = Type.Object({
  'idempotency-key': Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._-]+$' }),
});
export const InspectionStatusSchema = Type.Union([
  Type.Literal('queued'), Type.Literal('processing'), Type.Literal('completed'), Type.Literal('failed'),
]);
export const InspectionFailureSchema = Type.Object({
  code: Type.Union([
    Type.Literal('PROVIDER_UNAVAILABLE'), Type.Literal('PROVIDER_TIMEOUT'), Type.Literal('INFERENCE_FAILED'),
    Type.Literal('INVALID_INFERENCE_RESULT'), Type.Literal('INVALID_ASSET'), Type.Literal('ASSET_UNAVAILABLE'),
    Type.Literal('ATTEMPTS_EXHAUSTED'), Type.Literal('EXECUTION_INTERRUPTED'),
    Type.Literal('INVALID_INSPECTION'), Type.Literal('DATABASE_UNAVAILABLE'),
  ]),
  message: Type.String({ minLength: 1, maxLength: 200 }),
}, { additionalProperties: false });
export type InspectionFailure = Static<typeof InspectionFailureSchema>;

export const InspectionAcceptedSchema = Type.Object({
  id: objectId, status: InspectionStatusSchema, createdAt: timestamp,
  url: Type.String({ pattern: '^/api/v1/inspections/[a-f0-9]{24}$' }),
}, { additionalProperties: false });
export type InspectionAccepted = Static<typeof InspectionAcceptedSchema>;

const common = {
  id: objectId, assetId: objectId, createdAt: timestamp, updatedAt: timestamp,
  requested: ProviderConfigurationSchema,
  attemptCount: Type.Integer({ minimum: 0, maximum: 3 }),
  maxAttempts: Type.Integer({ minimum: 1, maximum: 3 }),
  retriedFrom: Type.Optional(objectId),
  processingStartedAt: Type.Optional(timestamp),
};
export const InspectionResponseSchema = Type.Union([
  Type.Object({ ...common, status: Type.Literal('queued'), nextAttemptAt: timestamp }, { additionalProperties: false }),
  Type.Object({ ...common, status: Type.Literal('processing') }, { additionalProperties: false }),
  Type.Object({ ...common, status: Type.Literal('completed'), completedAt: timestamp,
    processingDurationMs: Type.Number({ minimum: 0 }), result: InferenceResultSchema,
    review: Type.Optional(PersistedReviewSchema), reviewWriteSequence: Type.Optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })) }, { additionalProperties: false }),
  Type.Object({ ...common, status: Type.Literal('failed'), completedAt: timestamp,
    failure: InspectionFailureSchema }, { additionalProperties: false }),
]);
export type InspectionResponse = Static<typeof InspectionResponseSchema>;

export const InspectionJobSchema = Type.Object({
  payloadVersion: Type.Literal('v1'), inspectionId: objectId,
  generation: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });
export type InspectionJob = Static<typeof InspectionJobSchema>;
