import { mkdtemp, writeFile, readdir, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalImageStorage } from '../src/storage.js';
import { canonicalizeImage } from '../src/images.js';
import sharp from 'sharp';

describe('local image storage', () => {
  let directory: string;
  let storage: LocalImageStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vip-storage-test-'));
    storage = new LocalImageStorage(directory);
    await storage.initialize();
  });

  afterEach(async () => {
    if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}vip-storage-test-`)) throw new Error('Unsafe test cleanup');
    await rm(directory, { recursive: true, force: true });
  });

  it('publishes a complete file and cleans only its own staging files', async () => {
    await writeFile(join(directory, 'unrelated.txt'), 'keep');
    const stage = await storage.stage();
    await storage.writeUpload(Readable.from(['original']), stage);
    await writeFile(stage.canonical, 'canonical');
    const key = await storage.publish(stage, 'png');
    await storage.discard(stage);

    expect(await readFile(join(directory, key), 'utf8')).toBe('canonical');
    expect(await readFile(join(directory, 'unrelated.txt'), 'utf8')).toBe('keep');
    expect(await readdir(directory)).toHaveLength(2);
  });

  it('rejects traversal keys without reading outside storage', async () => {
    await expect(storage.openContent('../outside.png', 1)).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    await expect(storage.openContent('C:\\outside.png', 1)).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
  });

  it('refuses to clean a directory it does not own', async () => {
    await expect(storage.discard({ directory, input: join(directory, 'input'), canonical: join(directory, 'canonical') }))
      .rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
  });

  it('cleans partial staging bytes after an interrupted source stream', async () => {
    const stage = await storage.stage();
    const source = Readable.from((async function* () {
      yield Buffer.from('partial upload');
      throw new Error('connection lost');
    })());
    await expect(storage.writeUpload(source, stage)).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });
    await storage.discard(stage);
    expect(await readdir(directory)).toEqual([]);
  });

  it('classifies an actual file-write failure as a storage failure', async () => {
    const stage = await storage.stage();
    await mkdir(stage.input);
    await expect(storage.writeUpload(Readable.from(['bytes']), stage))
      .rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    await rm(stage.input, { recursive: true });
    await storage.discard(stage);
    expect(await readdir(directory)).toEqual([]);
  });

  it('does not open missing or incomplete canonical content', async () => {
    const stage = await storage.stage();
    await writeFile(stage.canonical, 'short');
    const key = await storage.publish(stage, 'jpg');
    await storage.discard(stage);
    await expect(storage.openContent(key, 100)).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    await rm(join(directory, key));
    await expect(storage.openContent(key, 5)).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
  });

  it('classifies canonical encoding filesystem failures separately from corrupt images', async () => {
    const stage = await storage.stage();
    await expect(canonicalizeImage(stage.input, stage.canonical)).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abcdef' } }).jpeg().toFile(stage.input);
    await mkdir(stage.canonical);
    await expect(canonicalizeImage(stage.input, stage.canonical)).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    await rm(stage.canonical, { recursive: true });
    await storage.discard(stage);
  });
});
