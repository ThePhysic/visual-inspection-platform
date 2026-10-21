import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, utimes, symlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectStorage, cleanStaleStaging, MINIMUM_CLEANUP_AGE_MS, type StorageCatalog } from '../src/storage-maintenance.js';

describe('conservative offline storage maintenance', () => {
  let root: string;
  const old = new Date(Date.now() - MINIMUM_CLEANUP_AGE_MS * 2);
  let catalog: StorageCatalog;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vip-maintenance-test-'));
    catalog = { assertHealthy: vi.fn(async () => {}), hasStorageKey: vi.fn(async () => false) };
  });
  afterEach(async () => {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}vip-maintenance-test-`)) throw new Error('Unsafe cleanup');
    await rm(root, { recursive: true, force: true });
  });
  async function file(name: string, aged = true) {
    await writeFile(join(root, name), 'preserve bytes');
    if (aged) await utimes(join(root, name), old, old);
    return name;
  }
  async function stage(name = '.upload-abc123') {
    await mkdir(join(root, name));
    await file(`${name}/input`); await file(`${name}/canonical`);
    await utimes(join(root, name), old, old);
    return name;
  }
  it('reports old unreferenced canonical files without deleting any image', async () => {
    const orphan = await file(`${randomUUID()}.png`);
    const referenced = await file(`${randomUUID()}.jpg`);
    const recent = await file(`${randomUUID()}.png`, false);
    vi.mocked(catalog.hasStorageKey).mockImplementation(async key => key === referenced);
    const report = await inspectStorage(root, catalog);
    expect(report.orphanCandidates).toEqual([orphan]);
    expect(report.skipped).toContain(recent);
    expect(await readFile(join(root, orphan), 'utf8')).toBe('preserve bytes');
    expect(catalog.assertHealthy).toHaveBeenCalledTimes(2);
  });
  it('cleans only old known staging under an explicit exclusive boundary', async () => {
    const stale = await stage();
    await stage('.upload-recent'); await utimes(join(root, '.upload-recent'), new Date(), new Date());
    await stage('.upload-unknow'); await file('.upload-unknow/other');
    const canonical = await file(`${randomUUID()}.png`);
    const boundary = vi.fn(async () => {});
    const result = await cleanStaleStaging(root, catalog, boundary);
    expect(result.removed).toEqual([stale]);
    expect(boundary).toHaveBeenCalledTimes(2);
    expect(await readdir(root)).toEqual(expect.arrayContaining(['.upload-recent', '.upload-unknow', canonical]));
  });
  it('fails closed for unavailable database, missing exclusivity, and unsafe age', async () => {
    await stage();
    await expect(cleanStaleStaging(root, catalog, async () => { throw new Error('writer running'); })).rejects.toThrow('writer running');
    vi.mocked(catalog.assertHealthy).mockRejectedValue(new Error('database down'));
    await expect(inspectStorage(root, catalog)).rejects.toThrow('database down');
    await expect(inspectStorage(root, catalog, { minimumAgeMs: 0 })).rejects.toThrow('Invalid maintenance bounds');
    expect(await readdir(root)).toEqual(['.upload-abc123']);
  });
  it('does not follow staging/root symlinks outside the configured root', async () => {
    const storageRoot = join(root, 'images');
    await mkdir(storageRoot);
    await mkdir(join(root, 'outside'));
    await writeFile(join(root, 'outside', 'input'), 'outside');
    await symlink(join(root, 'outside'), join(storageRoot, '.upload-linked'), 'junction');
    await symlink(join(root, 'outside'), join(storageRoot, 'linked-root'), 'junction');
    const report = await cleanStaleStaging(storageRoot, catalog, async () => {});
    expect(report.removed).toEqual([]);
    await expect(inspectStorage(join(storageRoot, 'linked-root'), catalog)).rejects.toThrow('real storage root');
    expect(await readFile(join(root, 'outside', 'input'), 'utf8')).toBe('outside');
  });
  it('skips a stage with a recent file even if its directory is old and bounds scanning', async () => {
    await stage(); await utimes(join(root, '.upload-abc123/input'), new Date(), new Date());
    await file('unrelated');
    expect((await inspectStorage(root, catalog)).staleStaging).toEqual([]);
    expect((await inspectStorage(root, catalog, { limit: 1 })).truncated).toBe(true);
  });
});
