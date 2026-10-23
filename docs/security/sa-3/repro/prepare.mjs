import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const token = randomUUID().replaceAll('-', '');
const working = resolve(root, '.tools/sa3', token);
const evidence = resolve(root, 'docs/security/sa-3/evidence');
await mkdir(working, { recursive: true }); await mkdir(evidence, { recursive: true });
const git = args => execFileSync('git', args, { windowsHide: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(git(['diff', '--name-only']).toString().trim(), '', 'Freeze before harness changes');
const paths = git(['ls-files', '-z']).toString().split('\0').filter(Boolean)
  .filter(path => !/(^|\/)(AGENTS\.md|\.agents|\.codex|\.aws)(\/|$)/.test(path));
const files = await Promise.all(paths.map(async path => ({ path, sha256: hash(await readFile(resolve(root, path))) })));
const packages = [];
for (const path of paths.filter(path => path.endsWith('package.json'))) packages.push({ path, manifest: JSON.parse(await readFile(resolve(root, path), 'utf8')) });
await writeFile(resolve(evidence, 'baseline.json'), JSON.stringify({ commit: git(['rev-parse', 'HEAD']).toString().trim(),
  trackedCleanAtStart: true, indexSha256: hash(git(['ls-files', '--stage', '-z'])), files,
  preservedPriorSecurityFiles: files.filter(file => file.path.startsWith('docs/security/') && !file.path.startsWith('docs/security/sa-3/')),
  packageManifests: packages, nodeRuntime: process.version, pnpm: '10.34.7',
  configPaths: ['compose.yaml','compose.ci.yaml','compose.dev.yaml','.env.example','infra/docker/Dockerfile','infra/docker/nginx.conf','.github/workflows/ci.yml'],
  excluded: 'Private instructions/configuration, data, generated dependencies and Git metadata are not packaged. Retained demo data is not read.',
}, null, 2) + '\n');
await writeFile(resolve(root, '.tools/sa3/current.json'), JSON.stringify({ token, working, evidence }, null, 2));
console.log(`SA-3 frozen baseline recorded; ${files.length} files, ${files.filter(f=>f.path.startsWith('docs/security/')).length} prior security files.`);
