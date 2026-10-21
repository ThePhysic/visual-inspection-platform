import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

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
