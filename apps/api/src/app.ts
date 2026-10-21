import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import multipart from '@fastify/multipart';
import { Type } from 'typebox';
import {
  ApiErrorResponseSchema,
  HEALTH_PATH,
  HealthResponseSchema,
  INSPECTIONS_PATH,
  type ApiErrorResponse,
  type HealthResponse,
} from '@vip/contracts';
import { ApiError } from './errors.js';
import { registerAssetRoutes, multipartLimits, type AssetDependencies } from './assets.js';
import { registerInspectionRoutes } from './inspections.js';
import { type InspectionDependencies, type InspectionQueue } from '@vip/backend';

export function buildApp(options: Pick<FastifyServerOptions, 'logger'> & {
  assets?: AssetDependencies;
  inspections?: InspectionDependencies;
  dispatchQueue?: Pick<InspectionQueue, 'healthy'>;
} = {}) {
  const app = Fastify({
    logger: false,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    requestTimeout: 30_000,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.validation ? 400 : (error.statusCode ?? 500);
    const serverError = statusCode >= 500;
    const inspectionId = request.routeOptions.url?.startsWith(INSPECTIONS_PATH);

    if (serverError) {
      request.log.error({ err: error }, 'Request failed');
    }

    const response: ApiErrorResponse = {
      error: {
        code: error instanceof ApiError ? error.code
          : error.validationContext === 'params' ? inspectionId ? 'INVALID_INSPECTION_ID' : 'INVALID_ASSET_ID'
          : error.validation ? request.routeOptions.url?.endsWith('/review') ? 'INVALID_REVIEW'
          : request.method === 'GET' && request.routeOptions.url === INSPECTIONS_PATH ? 'INVALID_HISTORY_QUERY'
          : 'INVALID_REQUEST' : serverError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: error instanceof ApiError ? error.message
          : error.validationContext === 'params' ? `${inspectionId ? 'Inspection' : 'Asset'} ID must be 24 hexadecimal characters.`
          : error.validation ? 'Request validation failed.' : serverError ? 'An unexpected error occurred.' : error.message,
        requestId: request.id,
      },
    };

    void reply.code(statusCode).send(response);
  });

  app.register(multipart, { limits: multipartLimits });
  registerAssetRoutes(app, options.assets, options.dispatchQueue);
  registerInspectionRoutes(app, options.inspections);

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
