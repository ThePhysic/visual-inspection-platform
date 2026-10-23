import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const token = randomUUID().replaceAll('-', '');
const working = resolve(root, '.tools/sa2', token);
const evidence = resolve(root, 'docs/security/sa-2/evidence');
await mkdir(working, { recursive: true });
await mkdir(evidence, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function manifest(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await manifest(file));
    else if (entry.isFile()) files.push({ path: relative(root, file).replaceAll('\\', '/'), sha256: hash(await readFile(file)) });
    else throw new Error('Unexpected evidence entry');
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const sa1 = await manifest(resolve(root, 'docs/security/sa-1'));
const baseline = JSON.parse(await readFile(resolve(root, 'docs/security/sa-1/evidence/source-baseline.json'), 'utf8'));
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean)
  .filter(file => !/(^|\/)(AGENTS\.md|\.agents|\.codex|\.aws)(\/|$)/.test(file));
const files = await Promise.all(tracked.map(async path => ({ path, sha256: hash(await readFile(resolve(root, path))) })));
await writeFile(resolve(evidence, 'baseline.json'), JSON.stringify({
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  trackedDiffAtStart: execFileSync('git', ['diff', '--stat'], { encoding: 'utf8', windowsHide: true }).trim(),
  indexSha256: hash(execFileSync('git', ['ls-files', '--stage', '-z'], { windowsHide: true })),
  sa1SourceManifest: baseline.manifestSha256, files, sa1,
  retainedData: 'Excluded. Compare only Docker resource identities; do not mount or query retained demo data.',
}, null, 2) + '\n');
await writeFile(resolve(root, '.tools/sa2/current.json'), JSON.stringify({ token, working, evidence }, null, 2));
console.log(`SA-2 evidence workspace prepared: ${token}; ${sa1.length} SA-1 files preserved`);
