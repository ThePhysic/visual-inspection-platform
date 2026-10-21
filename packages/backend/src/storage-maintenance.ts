import { lstat, opendir, realpath, unlink, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isImageStorageKey } from './storage.js';

const stagePattern = /^\.upload-[a-zA-Z0-9]{6}$/;
export const MINIMUM_CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;
export interface StorageCatalog {
  assertHealthy(): Promise<void>;
  hasStorageKey(key: string): Promise<boolean>;
}
export interface MaintenanceOptions { minimumAgeMs?: number; now?: number; limit?: number }
export interface StorageReport {
  staleStaging: string[];
  orphanCandidates: string[];
  skipped: string[];
  truncated: boolean;
}

async function checkedRoot(directory: string) {
  const root = resolve(directory);
  if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) {
    throw new Error('Maintenance requires a real storage root without symlink components.');
  }
  return root;
}

function settings(options: MaintenanceOptions) {
  const age = options.minimumAgeMs ?? MINIMUM_CLEANUP_AGE_MS;
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 1000;
  if (!Number.isFinite(age) || age < MINIMUM_CLEANUP_AGE_MS || !Number.isFinite(now)
    || !Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error('Invalid maintenance bounds.');
  return { cutoff: now - age, limit };
}

async function staleStage(root: string, name: string, cutoff: number) {
  if (!stagePattern.test(name)) return false;
  const directory = join(root, name);
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.mtimeMs > cutoff) return false;
  // Never recurse, follow a link, or remove an unknown entry. A stage contains
  // at most these two regular files; an interrupted stage can also be empty.
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (!['input', 'canonical'].includes(entry.name)) return false;
    const file = await lstat(join(directory, entry.name));
    if (!file.isFile() || file.isSymbolicLink() || file.mtimeMs > cutoff) return false;
  }
  return true;
}

export async function inspectStorage(directory: string, catalog: StorageCatalog,
  options: MaintenanceOptions = {}): Promise<StorageReport> {
  const root = await checkedRoot(directory);
  const { cutoff, limit } = settings(options);
  await catalog.assertHealthy(); // Fail closed, even for a report.
  const report: StorageReport = { staleStaging: [], orphanCandidates: [], skipped: [], truncated: false };
  let visited = 0;
  for await (const entry of await opendir(root)) {
    if (++visited > limit) { report.truncated = true; break; }
    const info = await lstat(join(root, entry.name));
    if (stagePattern.test(entry.name) && await staleStage(root, entry.name, cutoff)) {
      report.staleStaging.push(entry.name);
    } else if (isImageStorageKey(entry.name) && info.isFile() && !info.isSymbolicLink() && info.mtimeMs <= cutoff) {
      if (!await catalog.hasStorageKey(entry.name)) report.orphanCandidates.push(entry.name);
    } else report.skipped.push(entry.name);
  }
  await catalog.assertHealthy();
  return report;
}

/** Offline maintenance only. The caller must enforce stopped writers for the
 * entire invocation, including other hosts sharing this directory. Age alone
 * does not establish abandonment. Published canonical images are NEVER deleted.
 */
export async function cleanStaleStaging(directory: string, catalog: StorageCatalog,
  assertExclusive: () => Promise<void>, options: MaintenanceOptions = {}) {
  await assertExclusive();
  const report = await inspectStorage(directory, catalog, options);
  const root = await checkedRoot(directory);
  const { cutoff } = settings(options);
  const removed: string[] = [];
  for (const name of report.staleStaging) {
    await assertExclusive();
    await catalog.assertHealthy();
    await checkedRoot(root);
    if (!await staleStage(root, name, cutoff)) continue;
    for (const file of ['input', 'canonical']) {
      try { await unlink(join(root, name, file)); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
    await rmdir(join(root, name));
    removed.push(name);
  }
  return { ...report, removed };
}
