import { type FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Value } from 'typebox/value';
import { Type } from 'typebox';
import {
  ASSETS_PATH, READINESS_PATH, MAX_UPLOAD_BYTES,
  AssetSourceSchema, AssetParamsSchema, AssetResponseSchema,
  ApiErrorResponseSchema, ReadinessResponseSchema,
  type AssetSource, type AssetResponse,
} from '@vip/contracts';
import { type AssetModel, checkDatabase } from './database.js';
import { LocalImageStorage } from './storage.js';
import { canonicalizeImage } from './images.js';
import { ApiError, databaseFailure } from './errors.js';
import { type InspectionQueue } from '@vip/backend';

export interface AssetDependencies {
  model: AssetModel;
  storage: LocalImageStorage;
}

const errorResponses = {
  400: ApiErrorResponseSchema,
  404: ApiErrorResponseSchema,
  413: ApiErrorResponseSchema,
  415: ApiErrorResponseSchema,
  422: ApiErrorResponseSchema,
  503: ApiErrorResponseSchema,
};

export function registerAssetRoutes(instance: FastifyInstance, dependencies?: AssetDependencies, dispatchQueue?: Pick<InspectionQueue, 'healthy'>) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  let activeUploads = 0;

  function requireDependencies() {
    if (!dependencies) throw databaseFailure();
    return dependencies;
  }

  async function findAsset(id: string) {
    const { model } = requireDependencies();
    try {
      const asset = await model.findById(id).lean().exec();
      if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
      return asset;
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw databaseFailure(cause);
    }
  }

  function toResponse(asset: {
    _id: { toString(): string };
    mimeType: string;
    width: number;
    height: number;
    byteLength: number;
    sha256: string;
    source: string;
    createdAt: Date;
  }): AssetResponse {
    // Validate persistence data too, so corrupt records cannot leak paths or
    // produce a response that disagrees with the shared public contract.
    const id = asset._id.toString();
    const response = {
      id,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
      source: asset.source,
      createdAt: asset.createdAt.toISOString(),
      contentUrl: `${ASSETS_PATH}/${id}/content`,
    };
    if (!Value.Check(AssetResponseSchema, response)) throw databaseFailure();
    return response;
  }

  app.get(READINESS_PATH, {
    schema: { response: { 200: ReadinessResponseSchema, 503: ApiErrorResponseSchema } },
  }, async () => {
    const { model, storage } = requireDependencies();
    await checkDatabase(model.db);
    await storage.checkReady();
    // MongoDB and storage determine admission readiness. Redis is a reported
    // execution dependency, so its outage does not disable durable acceptance.
    const redis: 'ok' | 'unavailable' | undefined = dispatchQueue ? await dispatchQueue.healthy() ? 'ok' : 'unavailable' : undefined;
    return { apiVersion: 'v1', status: 'ready', dependencies: {
      mongodb: 'ok', storage: 'ok', ...(redis ? { redis } : {}),
    } } as const;
  });

  app.post(ASSETS_PATH, {
    schema: { response: { 201: AssetResponseSchema, ...errorResponses } },
  }, async (request, reply): Promise<AssetResponse> => {
    const { model, storage } = requireDependencies();
    if (!request.isMultipart()) throw new ApiError(400, 'MISSING_IMAGE', 'Supply one multipart image field.');
    if (model.db.readyState !== 1) throw databaseFailure();
    if (activeUploads >= 2) throw new ApiError(503, 'INGESTION_BUSY', 'Image ingestion is busy. Try again later.');

    activeUploads++;
    let stage: Awaited<ReturnType<LocalImageStorage['stage']>> | undefined;
    try {
      stage = await storage.stage();
      let foundImage = false;
      let foundSource = false;
      let source: AssetSource = 'api';
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'image' || foundImage) {
              part.file.resume();
              throw new ApiError(400, 'INVALID_UPLOAD', 'Supply exactly one file named image.');
            }
            foundImage = true;
            const uploadedBytes = await storage.writeUpload(part.file, stage);
            if (part.file.truncated || uploadedBytes > MAX_UPLOAD_BYTES) {
              throw new ApiError(413, 'UPLOAD_TOO_LARGE', 'Uploads must not exceed 10 MiB.');
            }
          } else {
            if (part.fieldname !== 'source' || foundSource || part.valueTruncated
              || !Value.Check(AssetSourceSchema, part.value)) {
              throw new ApiError(400, 'INVALID_SOURCE', 'The optional source must be browser or api.');
            }
            source = part.value;
            foundSource = true;
          }
        }
      } catch (cause) {
        if (cause instanceof ApiError) throw cause;
        const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
        if (code === 'FST_REQ_FILE_TOO_LARGE') throw new ApiError(413, 'UPLOAD_TOO_LARGE', 'Uploads must not exceed 10 MiB.');
        throw new ApiError(400, 'INVALID_UPLOAD', 'Supply a valid multipart upload with one image and optional source.', { cause });
      }
      if (!foundImage) throw new ApiError(400, 'MISSING_IMAGE', 'Supply one multipart image field.');

      const canonical = await canonicalizeImage(stage.input, stage.canonical);
      const storageKey = await storage.publish(stage, canonical.extension);
      let asset;
      try {
        asset = await model.create({
          storageKey,
          mimeType: canonical.mimeType,
          width: canonical.width,
          height: canonical.height,
          byteLength: canonical.byteLength,
          sha256: canonical.sha256,
          source,
        });
      } catch (cause) {
        // A failed acknowledgement can follow a committed insert. Retain the
        // published file; deleting it could break a successfully stored record.
        throw databaseFailure(cause);
      }
      const response = toResponse(asset);
      reply.code(201).header('Location', `${ASSETS_PATH}/${response.id}`);
      return response;
    } finally {
      if (stage) {
        await storage.discard(stage).catch((error: unknown) => {
          request.log.error({ err: error }, 'Could not clean private upload staging files');
        });
      }
      activeUploads--;
    }
  });

  app.get(`${ASSETS_PATH}/:id`, {
    schema: { params: AssetParamsSchema, response: { 200: AssetResponseSchema, ...errorResponses } },
  }, async (request) => toResponse(await findAsset(request.params.id)));

  app.get(`${ASSETS_PATH}/:id/content`, {
    schema: { params: AssetParamsSchema, response: { 200: Type.Unknown(), ...errorResponses } },
  }, async (request, reply) => {
    const asset = await findAsset(request.params.id);
    const response = toResponse(asset);
    const stream = await requireDependencies().storage.openContent(asset.storageKey, response.byteLength);
    return reply
      .type(response.mimeType)
      .header('Content-Length', response.byteLength)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('ETag', `"${response.sha256}"`)
      .send(stream);
  });
}

export const multipartLimits = {
  files: 1,
  fields: 1,
  parts: 2,
  // Allow a one-byte sentinel so an exactly 10 MiB file is not reported as
  // truncated by the multipart parser. Enforce the public limit explicitly.
  fileSize: MAX_UPLOAD_BYTES + 1,
  fieldSize: 32,
  fieldNameSize: 32,
  headerPairs: 100,
};
