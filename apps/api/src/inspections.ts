import { type FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import {
  INSPECTIONS_PATH, InspectionRequestSchema, InspectionParamsSchema, IdempotencyHeadersSchema,
  InspectionAcceptedSchema, InspectionResponseSchema, ApiErrorResponseSchema, SaveReviewRequestSchema, SavedReviewResponseSchema,
  ReviewValidationErrorResponseSchema, ReviewConflictResponseSchema,
  HistoryQuerySchema, InspectionHistoryResponseSchema,
} from '@vip/contracts';
import {
  acceptInspection, retryInspection, acceptedResponse, inspectionResponse,
  ApiError, databaseFailure, saveReview, type InspectionDependencies,
  inspectionHistory,
} from '@vip/backend';

export function registerInspectionRoutes(instance: FastifyInstance, dependencies?: InspectionDependencies) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { 400: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 503: ApiErrorResponseSchema };
  function requireDependencies() { if (!dependencies) throw databaseFailure(); return dependencies; }

  app.get(INSPECTIONS_PATH, {
    schema: { querystring: HistoryQuerySchema, response: { 200: InspectionHistoryResponseSchema, ...errors } },
  }, request => inspectionHistory(requireDependencies().inspections, request.query));

  app.post(INSPECTIONS_PATH, {
    schema: { body: InspectionRequestSchema, headers: IdempotencyHeadersSchema,
      response: { 202: InspectionAcceptedSchema, ...errors } },
  }, async (request, reply) => {
    const record = await acceptInspection(requireDependencies(), {
      ...request.body, key: request.headers['idempotency-key'], requestId: request.id,
    });
    const response = acceptedResponse(record);
    request.log.info({ inspectionId: response.id, assetId: record.assetId.toString(), status: response.status,
      acceptanceRequestId: record.requestId, dispatchGeneration: record.dispatchGeneration }, 'Inspection durably accepted');
    return reply.code(202).header('Location', response.url).send(response);
  });

  app.get(`${INSPECTIONS_PATH}/:id`, {
    schema: { params: InspectionParamsSchema, response: { 200: InspectionResponseSchema, ...errors } },
  }, async request => {
    try {
      const record = await requireDependencies().inspections.findById(request.params.id).lean().exec();
      if (!record) throw new ApiError(404, 'INSPECTION_NOT_FOUND', 'Inspection not found.');
      const response = inspectionResponse(record);
      if (response.status !== 'failed') return response;
      const latest = await requireDependencies().inspections.findOne({ retriedFrom: record._id })
        .sort({ createdAt: -1, _id: -1 }).select({ _id: 1 }).lean().exec();
      return { ...response, ...(latest ? { latestRetryId: latest._id.toString() } : {}) };
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw databaseFailure(cause);
    }
  });

  app.put(`${INSPECTIONS_PATH}/:id/review`, {
    schema: { params: InspectionParamsSchema, body: SaveReviewRequestSchema,
      response: { ...errors, 200: SavedReviewResponseSchema, 400: ReviewValidationErrorResponseSchema, 409: ReviewConflictResponseSchema } },
  }, async request => {
    const response = await saveReview(requireDependencies().inspections, request.params.id, request.body);
    request.log.info({ inspectionId: request.params.id, operationId: request.body.operationId,
      reviewRevision: response.review.revision, outcome: response.outcome }, 'Review save resolved');
    return response;
  });

  app.post(`${INSPECTIONS_PATH}/:id/retry`, {
    schema: { params: InspectionParamsSchema, headers: IdempotencyHeadersSchema,
      response: { 202: InspectionAcceptedSchema, ...errors } },
  }, async (request, reply) => {
    if (request.body !== undefined && !Value.Check(Type.Object({}, { additionalProperties: false }), request.body)) {
      throw new ApiError(400, 'INVALID_REQUEST', 'The retry request does not accept body fields.');
    }
    const record = await retryInspection(requireDependencies(), {
      inspectionId: request.params.id, key: request.headers['idempotency-key'], requestId: request.id,
    });
    const response = acceptedResponse(record);
    request.log.info({ inspectionId: response.id, assetId: record.assetId.toString(), retriedFrom: request.params.id,
      acceptanceRequestId: record.requestId, dispatchGeneration: record.dispatchGeneration }, 'Inspection retry durably accepted');
    return reply.code(202).header('Location', response.url).send(response);
  });
}
