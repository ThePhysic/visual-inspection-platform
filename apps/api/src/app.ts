import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import {
  ApiErrorResponseSchema,
  HEALTH_PATH,
  HealthResponseSchema,
  type ApiErrorResponse,
  type HealthResponse,
} from '@vip/contracts';

export function buildApp(options: Pick<FastifyServerOptions, 'logger'> = {}) {
  const app = Fastify({
    logger: false,
    ...options,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.validation ? 400 : (error.statusCode ?? 500);
    const serverError = statusCode >= 500;

    if (serverError) {
      request.log.error({ err: error }, 'Request failed');
    }

    const response: ApiErrorResponse = {
      error: {
        code: error.validation ? 'INVALID_REQUEST' : serverError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: error.validation ? 'Request validation failed.' : serverError ? 'An unexpected error occurred.' : error.message,
        requestId: request.id,
      },
    };

    void reply.code(statusCode).send(response);
  });

  app.setNotFoundHandler((request, reply) => {
    const response: ApiErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        requestId: request.id,
      },
    };
    void reply.code(404).send(response);
  });

  app.get(HEALTH_PATH, {
    schema: {
      querystring: Type.Object({}, { additionalProperties: false }),
      response: {
        200: HealthResponseSchema,
        400: ApiErrorResponseSchema,
        500: ApiErrorResponseSchema,
      },
    },
  }, async (): Promise<HealthResponse> => ({
    apiVersion: 'v1',
    service: 'visual-inspection-api',
    status: 'ok',
  }));

  return app;
}
