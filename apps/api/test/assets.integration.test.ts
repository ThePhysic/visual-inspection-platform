import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, unlink, writeFile, utimes } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { checkDatabase, inspectStorage, cleanStaleStaging, MINIMUM_CLEANUP_AGE_MS } from '@vip/backend';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Value } from 'typebox/value';
import { ASSETS_PATH, AssetResponseSchema, ApiErrorResponseSchema, MAX_UPLOAD_BYTES, type AssetResponse } from '@vip/contracts';
import { buildApp } from '../src/app.js';
import { connectDatabase, createAssetModel } from '../src/database.js';
import { LocalImageStorage } from '../src/storage.js';

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function animatedPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
  function control(sequence: number) {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence, 0); data.writeUInt32BE(1, 4); data.writeUInt32BE(1, 8);
    data.writeUInt16BE(1, 20); data.writeUInt16BE(10, 22);
    return chunk('fcTL', data);
  }
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('acTL', animation),
    control(0), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    control(1), chunk('fdAT', Buffer.concat([sequence, deflateSync(Buffer.from([0, 0, 0, 255, 255]))])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface UploadOptions { source?: string; filename?: string; mime?: string; extraFile?: boolean; sourceFirst?: boolean }

function multipart(image?: Buffer, options: UploadOptions = {}) {
  const boundary = 'vip-ingestion-test-boundary';
  const parts: Buffer[] = [];
  const field = () => {
    if (options.source !== undefined) parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\n${options.source}\r\n`,
    ));
  };
  if (options.sourceFirst) field();
  if (image) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${options.filename ?? 'test.jpg'}"\r\nContent-Type: ${options.mime ?? 'image/jpeg'}\r\n\r\n`));
    parts.push(image, Buffer.from('\r\n'));
    if (options.extraFile) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="extra.jpg"\r\n\r\n`), image, Buffer.from('\r\n'));
    }
  }
  if (!options.sourceFirst) field();
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(parts) };
}

describe('image ingestion with real MongoDB', () => {
  const databaseName = `vip_ingestion_test_${randomUUID().replaceAll('-', '')}`;
  let connection: Awaited<ReturnType<typeof connectDatabase>>;
  let model: ReturnType<typeof createAssetModel>;
  let app: ReturnType<typeof buildApp>;
  let storage: LocalImageStorage;
  let directory: string;
  let jpeg: Buffer;
  let png: Buffer;
  let oversizedDimensions: Buffer;

  beforeAll(async () => {
    connection = await connectDatabase(process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017', databaseName);
    model = createAssetModel(connection);
    await model.createIndexes();
    jpeg = await sharp({ create: { width: 8, height: 5, channels: 3, background: '#ab3412' } }).jpeg().toBuffer();
    png = await sharp({ create: { width: 7, height: 4, channels: 4, background: { r: 10, g: 30, b: 50, alpha: 0.5 } } }).png().toBuffer();
    oversizedDimensions = await sharp({ create: { width: 5001, height: 4000, channels: 3, background: '#123456' } }).png().toBuffer();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    directory = await mkdtemp(join(tmpdir(), 'vip-ingestion-test-'));
    storage = new LocalImageStorage(directory);
    await storage.initialize();
    app = buildApp({ assets: { model, storage } });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    if (directory) {
      if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}vip-ingestion-test-`)) throw new Error('Unsafe test cleanup');
      await rm(directory, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    if (connection) {
      if (connection.name !== databaseName || !databaseName.startsWith('vip_ingestion_test_')) throw new Error('Unsafe database cleanup');
      await connection.dropDatabase();
      await connection.close();
    }
  });

  function upload(image?: Buffer, options: UploadOptions = {}) {
    return app.inject({ method: 'POST', url: ASSETS_PATH, ...multipart(image, options) });
  }

  async function accepted(image: Buffer, options?: UploadOptions): Promise<AssetResponse> {
    const response = await upload(image, options);
    expect(response.statusCode, response.body).toBe(201);
    expect(Value.Check(AssetResponseSchema, response.json())).toBe(true);
    const asset = response.json<AssetResponse>();
    expect(response.headers.location).toBe(`${ASSETS_PATH}/${asset.id}`);
    return asset;
  }

  function rejected(response: Awaited<ReturnType<typeof upload>>, status: number, code: string) {
    expect(response.statusCode, response.body).toBe(status);
    expect(Value.Check(ApiErrorResponseSchema, response.json())).toBe(true);
    expect(response.json()).toMatchObject({ error: { code } });
    expect(response.body).not.toContain(directory);
  }

  it.each(['jpeg', 'png'] as const)('persists and retrieves a genuine %s image', async (format) => {
    const asset = await accepted(format === 'jpeg' ? jpeg : png, { source: 'browser', sourceFirst: format === 'png' });
    expect(asset).toMatchObject({ mimeType: `image/${format}`, width: format === 'jpeg' ? 8 : 7, height: format === 'jpeg' ? 5 : 4, source: 'browser' });
    const record = await model.findById(asset.id).lean().orFail();
    expect(record.createdAt.toISOString()).toBe(asset.createdAt);
    expect(record).not.toHaveProperty('__v');
    const metadata = await app.inject({ method: 'GET', url: `${ASSETS_PATH}/${asset.id}` });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json()).toEqual(asset);
    expect(metadata.body).not.toContain('storageKey');
    const content = await app.inject({ method: 'GET', url: asset.contentUrl });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toBe(asset.mimeType);
    expect(Number(content.headers['content-length'])).toBe(asset.byteLength);
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers.etag).toBe(`"${asset.sha256}"`);
    expect(content.headers['cache-control']).toBe('private, no-store');
    expect(content.rawPayload.length).toBe(asset.byteLength);
    expect(createHash('sha256').update(content.rawPayload).digest('hex')).toBe(asset.sha256);
    expect(await readFile(join(directory, record.storageKey))).toEqual(content.rawPayload);
    expect((await sharp(content.rawPayload).metadata()).format).toBe(format);
    if (format === 'png') expect((await sharp(content.rawPayload).metadata()).hasAlpha).toBe(true);
    expect((await readdir(directory)).filter(name => name.startsWith('.upload-'))).toEqual([]);
  });

  it('uses decoded type and never a client filename as the storage path', async () => {
    const asset = await accepted(jpeg, { filename: '../../escape.png', mime: 'application/pdf' });
    expect(asset.mimeType).toBe('image/jpeg');
    expect(asset.source).toBe('api');
    expect(await readdir(directory)).toEqual([expect.stringMatching(/^[a-f0-9-]{36}\.jpg$/)]);
  });

  it('rejects cross-origin and unexpected Host multipart before storage or database side effects', async () => {
    const staging = vi.spyOn(storage, 'stage');
    const insert = vi.spyOn(model, 'create');
    for (const origin of ['null', 'http://127.0.0.1:9999', 'not an origin']) {
      const body = multipart(png);
      const response = await app.inject({ method: 'POST', url: ASSETS_PATH, ...body,
        headers: { ...body.headers, host: '127.0.0.1:3001', origin } });
      rejected(response, 403, 'ORIGIN_NOT_ALLOWED');
    }
    const body = multipart(png);
    rejected(await app.inject({ method: 'POST', url: ASSETS_PATH, ...body,
      headers: { ...body.headers, host: 'unrelated.invalid' } }), 421, 'HOST_NOT_ALLOWED');
    expect(staging).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(await model.countDocuments()).toBe(0);
    expect(await readdir(directory)).toEqual([]);
    const legitimate = await app.inject({ method: 'POST', url: ASSETS_PATH, ...body,
      headers: { ...body.headers, host: 'localhost:5173', origin: 'http://localhost:5173' } });
    expect(legitimate.statusCode).toBe(201);
    expect(await model.countDocuments()).toBe(1);
  });

  it('allows identical content twice while enforcing storage key uniqueness', async () => {
    const first = await accepted(png);
    const second = await accepted(png);
    expect(first.id).not.toBe(second.id);
    expect(first.sha256).toBe(second.sha256);
    expect(await model.countDocuments()).toBe(2);
    const indexes = await model.collection.indexes();
    expect(indexes.find(index => index.name === 'storageKey_1')?.unique).toBe(true);
    expect(indexes.some(index => index.key.sha256)).toBe(false);
    const record = await model.findById(first.id).lean().orFail();
    await expect(model.create({ ...record, _id: new Types.ObjectId() })).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects corrupt JPEG data and removes temporary files', async () => {
    rejected(await upload(jpeg.subarray(0, 30)), 422, 'CORRUPT_IMAGE');
    expect(await model.countDocuments()).toBe(0);
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects corrupt PNG data', async () => {
    rejected(await upload(png.subarray(0, png.length - 10)), 422, 'CORRUPT_IMAGE');
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects an actual unsupported format regardless of declared type', async () => {
    const gif = await sharp(png).gif().toBuffer();
    rejected(await upload(gif), 415, 'UNSUPPORTED_IMAGE_TYPE');
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects animated PNG instead of quietly reading only its first frame', async () => {
    rejected(await upload(animatedPng()), 415, 'MULTIFRAME_IMAGE');
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects MPO multipicture JPEG containers', async () => {
    const mpo = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe2, 0, 6]), Buffer.from('MPF\0'), jpeg.subarray(2)]);
    rejected(await upload(mpo), 415, 'MULTIFRAME_IMAGE');
  });

  it('rejects missing multipart images', async () => {
    rejected(await upload(undefined, { source: 'api' }), 400, 'MISSING_IMAGE');
    rejected(await app.inject({ method: 'POST', url: ASSETS_PATH }), 400, 'MISSING_IMAGE');
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects a second file before publishing anything', async () => {
    rejected(await upload(jpeg, { extraFile: true }), 400, 'INVALID_UPLOAD');
    expect(await readdir(directory)).toEqual([]);
    expect(await model.countDocuments()).toBe(0);
  });

  it('rejects an invalid source', async () => {
    rejected(await upload(jpeg, { source: 'camera' }), 400, 'INVALID_SOURCE');
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects uploads over 10 MiB and removes partial bytes', async () => {
    rejected(await upload(Buffer.alloc(MAX_UPLOAD_BYTES + 1)), 413, 'UPLOAD_TOO_LARGE');
    expect(await readdir(directory)).toEqual([]);
    expect(await model.countDocuments()).toBe(0);
  });

  it('accepts the inclusive 10 MiB boundary when the encoded image is valid', async () => {
    const padded = Buffer.concat([jpeg, Buffer.alloc(MAX_UPLOAD_BYTES - jpeg.length)]);
    expect(padded.length).toBe(MAX_UPLOAD_BYTES);
    await accepted(padded);
    expect(await model.countDocuments()).toBe(1);
  });

  it('does not publish an image until the complete multipart request is valid', async () => {
    rejected(await upload(jpeg, { source: 'invalid-trailing-source' }), 400, 'INVALID_SOURCE');
    expect(await model.countDocuments()).toBe(0);
    expect(await readdir(directory)).toEqual([]);
  });

  it('bounds simultaneous ingestion with explicit backpressure', async () => {
    let enterFirst!: () => void;
    let enterSecond!: () => void;
    let release!: () => void;
    const firstEntered = new Promise<void>(done => { enterFirst = done; });
    const secondEntered = new Promise<void>(done => { enterSecond = done; });
    const gate = new Promise<void>(done => { release = done; });
    const write = storage.writeUpload.bind(storage);
    let entered = 0;
    vi.spyOn(storage, 'writeUpload').mockImplementation(async (stream, stage) => {
      const size = await write(stream, stage);
      if (++entered === 1) enterFirst(); else enterSecond();
      await gate;
      return size;
    });
    const first = upload(jpeg);
    const firstResult = first.then(response => response);
    await firstEntered;
    const second = upload(png);
    const secondResult = second.then(response => response);
    await secondEntered;
    try {
      rejected(await upload(jpeg), 503, 'INGESTION_BUSY');
    } finally {
      release();
      const responses = await Promise.all([firstResult, secondResult]);
      expect(responses.map(response => response.statusCode)).toEqual([201, 201]);
    }
    expect(await model.countDocuments()).toBe(2);
  });

  it('can reduce admission to one slot and releases it after an interrupted write', async () => {
    await app.close();
    app = buildApp({ assets: { model, storage, uploadConcurrency: 1 } });
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(done => { entered = done; });
    const gate = new Promise<void>(done => { release = done; });
    const write = storage.writeUpload.bind(storage);
    vi.spyOn(storage, 'writeUpload').mockImplementationOnce(async (stream, stage) => {
      await write(stream, stage); entered(); await gate;
      throw new Error('synthetic interrupted upload');
    });
    const pending = upload(png).then(response => response);
    await started;
    try { rejected(await upload(png), 503, 'INGESTION_BUSY'); }
    finally { release(); await pending; }
    expect((await pending).statusCode).toBe(400);
    expect(await model.countDocuments()).toBe(0);
    expect(await readdir(directory)).toEqual([]);
    expect((await upload(png)).statusCode).toBe(201);
  });

  it('rejects decoded dimensions above 20 megapixels before canonical publication', async () => {
    rejected(await upload(oversizedDimensions), 413, 'IMAGE_DIMENSIONS_EXCEEDED');
    expect(await readdir(directory)).toEqual([]);
  });

  it.each(['', '/content'])('distinguishes invalid and nonexistent asset IDs%s', async (suffix) => {
    rejected(await app.inject({ method: 'GET', url: `${ASSETS_PATH}/invalid${suffix}` }), 400, 'INVALID_ASSET_ID');
    rejected(await app.inject({ method: 'GET', url: `${ASSETS_PATH}/000000000000000000000000${suffix}` }), 404, 'ASSET_NOT_FOUND');
  });

  it('auto-orients EXIF rotation and records canonical dimensions', async () => {
    const rotated = await sharp(jpeg).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const asset = await accepted(rotated);
    expect(asset).toMatchObject({ width: 5, height: 8 });
    const content = await app.inject({ method: 'GET', url: asset.contentUrl });
    const metadata = await sharp(content.rawPayload).metadata();
    expect(metadata).toMatchObject({ width: 5, height: 8 });
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
  });

  it('applies mirrored EXIF orientation to actual pixels', async () => {
    const pixels = Buffer.from([240, 10, 10, 240, 10, 10, 10, 10, 240, 10, 10, 240]);
    const mirrored = await sharp(pixels, { raw: { width: 4, height: 1, channels: 3 } })
      .withMetadata({ orientation: 2 }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
    const asset = await accepted(mirrored);
    const content = await app.inject({ method: 'GET', url: asset.contentUrl });
    const canonical = await sharp(content.rawPayload).raw().toBuffer();
    expect(canonical[2]).toBeGreaterThan(200);
    expect(canonical[0]).toBeLessThan(40);
    expect(canonical[9]).toBeGreaterThan(200);
    expect(asset).toMatchObject({ width: 4, height: 1 });
  });

  it('reports storage publication failures without creating metadata or deleting unrelated images', async () => {
    await writeFile(join(directory, 'unrelated.png'), png);
    const publish = storage.publish.bind(storage);
    vi.spyOn(storage, 'publish').mockImplementationOnce(async (stage, extension) => {
      await unlink(stage.canonical);
      return publish(stage, extension);
    });
    rejected(await upload(jpeg), 503, 'STORAGE_FAILURE');
    expect(await model.countDocuments()).toBe(0);
    expect(await readdir(directory)).toEqual(['unrelated.png']);
  });

  it('cleans a genuinely interrupted multipart stream without publishing bytes or metadata', async () => {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    let entered!: () => void; let discarded!: () => void;
    const uploading = new Promise<void>(done => { entered = done; });
    const cleaned = new Promise<void>(done => { discarded = done; });
    const write = storage.writeUpload.bind(storage);
    vi.spyOn(storage, 'writeUpload').mockImplementation(async (...args) => { entered(); return write(...args); });
    const discard = storage.discard.bind(storage);
    vi.spyOn(storage, 'discard').mockImplementation(async stage => { await discard(stage); discarded(); });
    const request = httpRequest(`${address}${ASSETS_PATH}`, { method: 'POST', headers: {
      'content-type': 'multipart/form-data; boundary=interrupted',
    } });
    request.on('error', () => {});
    try {
      request.write('--interrupted\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n');
      request.write(png);
      await uploading;
      request.destroy();
      await cleaned;
      expect(await model.countDocuments()).toBe(0);
      expect(await readdir(directory)).toEqual([]);
    } finally { request.destroy(); }
  });

  it('reports true orphan candidates but preserves bytes after uncertain database acknowledgements', async () => {
    const saved = await accepted(png);
    const record = await model.findById(saved.id).lean().orFail();
    const orphan = `${randomUUID()}.png`;
    await writeFile(join(directory, orphan), png);
    const stage = await storage.stage();
    await writeFile(stage.input, 'interrupted upload');
    const old = new Date(Date.now() - MINIMUM_CLEANUP_AGE_MS * 2);
    for (const path of [join(directory, record.storageKey), join(directory, orphan), stage.input, stage.directory]) {
      await utimes(path, old, old);
    }
    const catalog = { assertHealthy: () => checkDatabase(connection),
      hasStorageKey: async (key: string) => Boolean(await model.exists({ storageKey: key })) };
    expect(await inspectStorage(directory, catalog)).toMatchObject({ orphanCandidates: [orphan],
      staleStaging: [stage.directory.split(/[\\/]/).at(-1)] });
    await cleanStaleStaging(directory, catalog, async () => { await app.close(); });
    expect(await readFile(join(directory, orphan))).toEqual(png);
    expect(await readFile(join(directory, record.storageKey))).toBeDefined();
    expect((await readdir(directory)).some(name => name.startsWith('.upload-'))).toBe(false);
  });

  it('reports real staging failures as storage errors', async () => {
    await rm(directory, { recursive: true });
    rejected(await upload(jpeg), 503, 'STORAGE_FAILURE');
    await storage.initialize();
  });

  it('retains published bytes on a database failure and cleans staging', async () => {
    vi.spyOn(model, 'create').mockRejectedValueOnce(new Error('private database detail'));
    rejected(await upload(jpeg), 503, 'DATABASE_FAILURE');
    expect(await model.countDocuments()).toBe(0);
    expect(await readdir(directory)).toEqual([expect.stringMatching(/\.jpg$/)]);
  });

  it('retains bytes when an insert commits but its acknowledgement fails', async () => {
    const insert = model.collection.insertOne.bind(model.collection);
    vi.spyOn(model.collection, 'insertOne').mockImplementationOnce(async (document) => {
      await insert(document);
      throw new Error('acknowledgement lost');
    });
    rejected(await upload(png), 503, 'DATABASE_FAILURE');
    const record = await model.findOne().lean().orFail();
    const content = await app.inject({ method: 'GET', url: `${ASSETS_PATH}/${record._id}/content` });
    expect(content.statusCode).toBe(200);
    expect(createHash('sha256').update(content.rawPayload).digest('hex')).toBe(record.sha256);
  });

  it('reports missing stored bytes safely', async () => {
    const asset = await accepted(jpeg);
    const record = await model.findById(asset.id).lean().orFail();
    await unlink(join(directory, record.storageKey));
    rejected(await app.inject({ method: 'GET', url: asset.contentUrl }), 503, 'STORAGE_FAILURE');
  });

  it('reports dependency readiness while preserving liveness', async () => {
    const ready = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready', dependencies: { mongodb: 'ok', storage: 'ok' } });
    await rm(directory, { recursive: true });
    rejected(await app.inject({ method: 'GET', url: '/api/v1/ready' }), 503, 'STORAGE_FAILURE');
    expect((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
    await storage.initialize();
  });

  it('fails promptly after a genuine database disconnect, without buffering writes', async () => {
    const isolated = await connectDatabase(process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017', databaseName);
    const disconnectedModel = createAssetModel(isolated);
    await isolated.close();
    await app.close();
    app = buildApp({ assets: { model: disconnectedModel, storage } });
    rejected(await app.inject({ method: 'GET', url: '/api/v1/ready' }), 503, 'DATABASE_FAILURE');
    rejected(await app.inject({ method: 'GET', url: `${ASSETS_PATH}/000000000000000000000000` }), 503, 'DATABASE_FAILURE');
    rejected(await upload(jpeg), 503, 'DATABASE_FAILURE');
    expect((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
  });
});
