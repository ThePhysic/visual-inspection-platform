import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, utimes, symlink, realpath, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep, toNamespacedPath } from 'node:path';
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

  it.runIf(process.platform === 'win32')('accepts case-only spellings without changing cleanup ownership', async () => {
    const stale = await stage();
    const alias = join(dirname(root), basename(root).toUpperCase());
    expect(alias).not.toBe(await realpath(root));
    expect((await lstat(alias)).isSymbolicLink()).toBe(false);
    expect((await cleanStaleStaging(alias, catalog, async () => {})).removed).toEqual([stale]);
    expect(await readdir(root)).toEqual([]);
  });

  it.runIf(process.platform === 'win32')('accepts a genuine DOS 8.3 alias, not just casing differences', async context => {
    const stale = await stage();
    // Read Windows' real short name; never guess one or substitute mocked fs
    // results. This COM lookup does not require symlink/admin privileges.
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference = "Stop"; $fs = New-Object -ComObject Scripting.FileSystemObject; [Console]::Write($fs.GetFolder($env:VIP_SHORT_PATH_TEST_ROOT).ShortPath)'],
    { env: { ...process.env, VIP_SHORT_PATH_TEST_ROOT: root }, timeout: 10_000 });
    const alias = stdout.trim();
    const canonical = await realpath(root);
    if (alias.toLowerCase() === canonical.toLowerCase()) {
      context.skip('This volume does not provide an 8.3 alias; case and junction regressions still run.');
    }
    expect((await lstat(alias)).isSymbolicLink()).toBe(false);
    expect(await realpath(alias)).toBe(canonical);
    expect((await cleanStaleStaging(alias, catalog, async () => {})).removed).toEqual([stale]);
    expect(await readdir(root)).toEqual([]);
  });

  it.runIf(process.platform === 'win32')('accepts an extended-length spelling of a real directory', async () => {
    const stale = await stage();
    expect((await inspectStorage(toNamespacedPath(root), catalog)).staleStaging).toEqual([stale]);
  });

  it('rejects a junction/symlink in an ancestor even though the leaf is a real directory', async () => {
    const outside = join(root, 'outside');
    await mkdir(join(outside, 'nested'), { recursive: true });
    await writeFile(join(outside, 'nested', 'keep'), 'outside');
    const alias = join(root, 'linked-parent');
    await symlink(outside, alias, 'junction');
    const input = join(alias, 'nested');
    expect((await lstat(input)).isDirectory()).toBe(true);
    expect((await lstat(input)).isSymbolicLink()).toBe(false);
    await expect(cleanStaleStaging(input, catalog, async () => {})).rejects.toThrow('real storage root');
    if (process.platform === 'win32') {
      await expect(inspectStorage(join(root, 'LINKED-PARENT', 'nested'), catalog)).rejects.toThrow('real storage root');
    }
    expect(catalog.assertHealthy).not.toHaveBeenCalled();
    expect(await readFile(join(outside, 'nested', 'keep'), 'utf8')).toBe('outside');
  });

  it('skips a junction/symlink occupying a known staging file without following it', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside); await writeFile(join(outside, 'keep'), 'outside');
    const directory = join(root, '.upload-linked');
    await mkdir(directory);
    // Directory junctions work without CreateSymbolicLink privilege on Windows;
    // on POSIX this creates a normal directory symlink.
    await symlink(outside, join(directory, 'input'), 'junction');
    await utimes(directory, old, old);
    expect((await cleanStaleStaging(root, catalog, async () => {})).removed).toEqual([]);
    expect((await lstat(join(directory, 'input'))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('outside');
  });

  it('rejects a regular file as the storage root before consulting the database', async () => {
    await file('not-a-directory');
    await expect(inspectStorage(join(root, 'not-a-directory'), catalog)).rejects.toThrow('real storage root');
    expect(catalog.assertHealthy).not.toHaveBeenCalled();
  });

  it.runIf(process.platform !== 'win32')('keeps distinct case-sensitive directories separate', async () => {
    await mkdir(join(root, 'images')); await mkdir(join(root, 'IMAGES'));
    await writeFile(join(root, 'images', 'only-lowercase'), 'keep');
    expect((await inspectStorage(join(root, 'images'), catalog)).skipped).toEqual(['only-lowercase']);
    expect((await inspectStorage(join(root, 'IMAGES'), catalog)).skipped).toEqual([]);
  });
});
