import { randomUUID } from 'node:crypto';
import { open, mkdir, mkdtemp, link, unlink, rmdir, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { type Readable } from 'node:stream';
import { ApiError, storageFailure } from './errors.js';

export interface StagedUpload {
  directory: string;
  input: string;
  canonical: string;
}

const keyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png)$/;

function errorCode(error: unknown) {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

export class LocalImageStorage {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = resolve(directory);
  }

  async initialize() {
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await this.checkReady();
    } catch (cause) {
      throw storageFailure(cause);
    }
  }

  async stage(): Promise<StagedUpload> {
    try {
      const directory = await mkdtemp(join(this.directory, '.upload-'));
      return { directory, input: join(directory, 'input'), canonical: join(directory, 'canonical') };
    } catch (cause) {
      throw storageFailure(cause);
    }
  }

  async writeUpload(stream: Readable, stage: StagedUpload) {
    try {
      await pipeline(stream, createWriteStream(stage.input, { flags: 'wx', mode: 0o600 }));
      return (await stat(stage.input)).size;
    } catch (cause) {
      if (errorCode(cause) === 'FST_REQ_FILE_TOO_LARGE') {
        throw new ApiError(413, 'UPLOAD_TOO_LARGE', 'Uploads must not exceed 10 MiB.');
      }
      if (['EACCES', 'EPERM', 'ENOSPC', 'EIO', 'EROFS', 'ENOENT', 'EEXIST', 'EISDIR', 'ENOTDIR', 'EMFILE', 'ENFILE', 'EDQUOT'].includes(String(errorCode(cause)))) {
        throw storageFailure(cause);
      }
      throw new ApiError(400, 'INVALID_UPLOAD', 'The image upload could not be read.', { cause });
    }
  }

  async publish(stage: StagedUpload, extension: 'jpg' | 'png') {
    const key = `${randomUUID()}.${extension}`;
    try {
      // Both paths are on the same filesystem. link() atomically publishes a
      // complete file and fails rather than replacing an existing destination.
      await link(stage.canonical, this.pathFor(key));
      return key;
    } catch (cause) {
      throw storageFailure(cause);
    }
  }

  async openContent(key: string, expectedLength: number) {
    try {
      const handle = await open(this.pathFor(key), 'r');
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size !== expectedLength) throw new Error('Stored image is incomplete.');
        return handle.createReadStream();
      } catch (cause) {
        await handle.close();
        throw cause;
      }
    } catch (cause) {
      throw storageFailure(cause);
    }
  }

  async discard(stage: StagedUpload) {
    // Remove only the two known files and the private directory we created.
    // Never recursively remove the storage root or any published image.
    const directory = resolve(stage.directory);
    if (!directory.startsWith(`${this.directory}${process.platform === 'win32' ? '\\' : '/'}.upload-`)
      || stage.input !== join(directory, 'input') || stage.canonical !== join(directory, 'canonical')) {
      throw storageFailure(new Error('Invalid staging directory.'));
    }
    for (const path of [stage.input, stage.canonical]) {
      try { await unlink(path); } catch (cause) {
        if (errorCode(cause) !== 'ENOENT') throw storageFailure(cause);
      }
    }
    try { await rmdir(directory); } catch (cause) { throw storageFailure(cause); }
  }

  async checkReady() {
    const stage = await this.stage();
    try {
      await writeFile(stage.canonical, '', { flag: 'wx', mode: 0o600 });
      await link(stage.canonical, stage.input);
    } catch (cause) {
      throw storageFailure(cause);
    } finally {
      await this.discard(stage);
    }
  }

  private pathFor(key: string) {
    if (!keyPattern.test(key)) throw new Error('Invalid storage key.');
    return join(this.directory, key);
  }
}
