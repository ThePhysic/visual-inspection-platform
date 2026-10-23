import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, statfs, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment(); const containers = await test.verify();
const old = JSON.parse(await readFile(resolve(root, '.tools/sa1/current.json'), 'utf8'));
const cache = resolve(old.working, 'trivy-advisories');
const out = resolve(state.working, 'image-scans');
await mkdir(resolve(out, 'tmp'), { recursive: true });
const scanner = 'sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c';
const previous = JSON.parse(await readFile(resolve(root, 'docs/security/sa-1/evidence/image-advisories.json'), 'utf8'));
const checks = [];
for (const service of ['api', 'worker']) {
  const container = containers.find(c => c.Config.Labels['com.docker.compose.service'] === service);
  const [image] = JSON.parse((await run('docker', ['image', 'inspect', container.Image])).stdout);
  const disk = await statfs(out); assert.ok(disk.bavail * disk.bsize > 4 * 1024 ** 3);
  assert.ok(image.Size < 1024 ** 3);
  const archive = resolve(out, service + '.tar');
  await run('docker', ['image', 'save', '--output', archive, image.Id], { timeout: 120_000 });
  assert.ok((await stat(archive)).size < 1100 * 1024 ** 2);
  try {
    await run('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--memory', '2g', '--tmpfs', '/tmp:rw,size=64m', '--env', 'TMPDIR=/out/tmp', '--env', 'TRIVY_DISABLE_TELEMETRY=true',
      '--mount', `type=bind,src=${archive},dst=/image.tar,readonly`, '--mount', `type=bind,src=${cache},dst=/cache,readonly`,
      '--mount', `type=bind,src=${out},dst=/out`, scanner, 'image', '--input', '/image.tar', '--scanners', 'vuln',
      '--skip-db-update', '--skip-java-db-update', '--offline-scan', '--skip-check-update', '--cache-dir', '/cache',
      '--cache-backend', 'memory', '--format', 'json', '--output', `/out/${service}.json`, '--timeout', '2m'],
    { timeout: 150_000, privateLog: `image-${service}.log` });
    const raw = JSON.parse(await readFile(resolve(out, service + '.json'), 'utf8'));
    assert.equal(raw.Metadata.OS.Family, 'debian');
    const findings = raw.Results.flatMap(r => (r.Vulnerabilities ?? []).map(v => ({
      id: v.VulnerabilityID, package: v.PkgName, installed: v.InstalledVersion, fixed: v.FixedVersion, path: v.PkgPath,
      severity: v.Severity, status: v.Status, primaryURL: v.PrimaryURL, title: v.Title,
      classification: v.VulnerabilityID === 'CVE-2023-45853' && v.PkgName === 'zlib1g' ? 'false positive (SA1-13 retained)' : 'suspected weakness requiring further evidence',
    })));
    const key = v => [v.id, v.package, v.installed, v.path ?? ''].join('|');
    const before = previous.checks.find(c => c.service === service).findings;
    const afterKeys = new Set(findings.map(key)); const beforeKeys = new Set(before.map(key));
    const removed = before.filter(v => !afterKeys.has(key(v)));
    const added = findings.filter(v => !beforeKeys.has(key(v)));
    assert.equal(added.length, 0, 'Unexpected new candidate requires review');
    assert.equal(removed.length, 13);
    assert.ok(removed.every(v => v.path.startsWith('usr/local/lib/node_modules/npm/')));
    checks.push({ service, imageId: image.Id, imageSize: image.Size, os: raw.Metadata.OS, findings, removedBundledNpmMatches: removed, added });
    console.log(`${service}: ${findings.length} retained matches; ${removed.length} unused npm matches removed`);
  } finally { await unlink(archive); }
}
await save('image-scans.json', { scanner: { version: '0.76.1', imageId: scanner }, database: JSON.parse(await readFile(resolve(cache, 'db/metadata.json'), 'utf8')),
  databaseSha256: createHash('sha256').update(await readFile(resolve(cache, 'db/trivy.db'))).digest('hex'),
  network: 'none; no Docker socket or source/service mounts', checks,
  unchanged: 'Redis exact image unchanged; prior report retained. Web OS/base unchanged; nginx configuration rebuilt but no dependency/image version changed. MongoDB covered by separate bounded catalog report.',
});
