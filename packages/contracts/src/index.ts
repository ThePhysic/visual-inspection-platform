import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
export * from './inspections.js';

export const HEALTH_PATH = '/api/v1/health';

export const HealthResponseSchema = Type.Object(
  {
    apiVersion: Type.Literal('v1'),
    service: Type.Literal('visual-inspection-api'),
    status: Type.Literal('ok'),
  },
  { additionalProperties: false },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;

export function isHealthResponse(value: unknown): value is HealthResponse {
  return Value.Check(HealthResponseSchema, value);
}

export const ApiErrorResponseSchema = Type.Object(
  {
    error: Type.Object(
      {
        code: Type.String(),
        message: Type.String(),
        requestId: Type.String(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ApiErrorResponse = Static<typeof ApiErrorResponseSchema>;

export const ASSETS_PATH = '/api/v1/assets';
export const READINESS_PATH = '/api/v1/ready';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const AssetSourceSchema = Type.Union([Type.Literal('browser'), Type.Literal('api')]);
export type AssetSource = Static<typeof AssetSourceSchema>;

export const AssetParamsSchema = Type.Object({
  id: Type.String({ pattern: '^[a-fA-F0-9]{24}$' }),
}, { additionalProperties: false });

export const AssetResponseSchema = Type.Object({
  id: Type.String({ pattern: '^[a-f0-9]{24}$' }),
  mimeType: Type.Union([Type.Literal('image/jpeg'), Type.Literal('image/png')]),
  width: Type.Integer({ minimum: 1, maximum: MAX_IMAGE_PIXELS }),
  height: Type.Integer({ minimum: 1, maximum: MAX_IMAGE_PIXELS }),
  byteLength: Type.Integer({ minimum: 1 }),
  sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  source: AssetSourceSchema,
  createdAt: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' }),
  contentUrl: Type.String({ pattern: '^/api/v1/assets/[a-f0-9]{24}/content$' }),
}, { additionalProperties: false });
export type AssetResponse = Static<typeof AssetResponseSchema>;

export const ReadinessResponseSchema = Type.Object({
  apiVersion: Type.Literal('v1'),
  status: Type.Literal('ready'),
  dependencies: Type.Object({
    mongodb: Type.Literal('ok'),
    storage: Type.Literal('ok'),
    redis: Type.Optional(Type.Union([Type.Literal('ok'), Type.Literal('unavailable')])),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export * from './reviews.js';
