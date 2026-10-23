import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

const root = process.cwd();
assert.ok(root.endsWith('visual-inspection-platform'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Tracked source must be unchanged');
const token = randomUUID().replaceAll('-', '');
const working = resolve(root, '.tools/sa1', token);
const snapshot = resolve(working, 'source');
const evidence = resolve(root, 'docs/security/sa-1/evidence');
await mkdir(snapshot, { recursive: true });
await mkdir(evidence, { recursive: true });
const roots = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.node-version', '.npmrc',
  '.gitignore', '.dockerignore', 'tsconfig.base.json', 'eslint.config.js', 'compose.yaml', 'compose.dev.yaml', 'compose.ci.yaml']);
const files = git('ls-files').split('\n').filter(path => roots.has(path)
  || /^(apps|packages|infra|\.github)\//.test(path) && /\.(ts|tsx|mjs|json|ya?ml|html|css)$/.test(path)
  || path === 'infra/docker/Dockerfile' || path === 'infra/docker/nginx.conf');
const manifest = [];
for (const path of files.sort()) {
  assert.ok(!/(^|\/)(AGENTS\.md|SKILL\.md|\.env[^/]*|\.git|\.agents|\.codex|\.aws|node_modules|dist)(\/|$)/i.test(path));
  const input = resolve(root, path);
  assert.ok(input.startsWith(root + sep));
  assert.ok((await lstat(input)).isFile());
  assert.equal((await realpath(input)).toLowerCase(), input.toLowerCase());
  const bytes = await readFile(input);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  manifest.push({ path, bytes: bytes.length, sha256 });
  const output = resolve(snapshot, path);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(input, output);
  await chmod(output, 0o444);
}
const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
const baseline = { commit: git('rev-parse', 'HEAD'), date: new Date().toISOString(), trackedSourceClean: true,
  manifestSha256: digest, fileCount: manifest.length, files: manifest,
  excludes: ['private instructions', 'env files', 'Git metadata/history', 'docs', 'fixtures/images', 'generated dependencies/builds', 'application data/backups/logs/traces'] };
await writeFile(resolve(evidence, 'source-baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
await writeFile(resolve(root, '.tools/sa1/current.json'), JSON.stringify({ token, working, snapshot, evidence }, null, 2) + '\n');
console.log(JSON.stringify({ commit: baseline.commit, token, files: manifest.length, manifestSha256: digest }));
