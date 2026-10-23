import assert from 'node:assert/strict';
import { mkdir, readFile, stat, statfs, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
const containers = await test.verify();
const cache = resolve(state.working, 'trivy-advisories');
const outputs = resolve(state.working, 'image-scans');
await mkdir(outputs, { recursive: true }); await mkdir(resolve(outputs, 'tmp'), { recursive: true });
const metadata = JSON.parse(await readFile(resolve(cache, 'db/metadata.json'), 'utf8'));
const checks = [];
for (const container of containers) {
  const service = container.Config.Labels['com.docker.compose.service'];
  const archive = resolve(outputs, `${service}.tar`);
  assert.ok(archive.startsWith(outputs));
  const disk = await statfs(outputs);
  assert.ok(disk.bavail * disk.bsize > 4 * 1024 ** 3, 'Need at least 4 GiB free for bounded artifact scanning');
  const [image] = JSON.parse((await run('docker', ['image', 'inspect', container.Image])).stdout);
  assert.ok(image.Size < 1024 ** 3, 'Refuse image above 1 GiB input budget');
  console.log(`Exporting and scanning ${service}`);
  await run('docker', ['image', 'save', '--output', archive, container.Image], { timeout: 120_000 });
  assert.ok((await stat(archive)).size < 1100 * 1024 ** 2);
  try {
    const result = await run('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--memory', '2g', '--tmpfs', '/tmp:rw,size=64m', '--env', 'TMPDIR=/out/tmp',
      '--mount', `type=bind,src=${archive},dst=/image.tar,readonly`, '--mount', `type=bind,src=${cache},dst=/cache,readonly`,
      '--mount', `type=bind,src=${outputs},dst=/out`, 'aquasec/trivy:0.76.1', 'image', '--input', '/image.tar', '--scanners', 'vuln',
      '--skip-db-update', '--skip-java-db-update', '--offline-scan', '--skip-check-update', '--cache-dir', '/cache',
      '--cache-backend', 'memory', '--format', 'json', '--output', `/out/${service}.json`, '--timeout', '2m'],
    { allowed: [0, 1], timeout: 150_000, privateLog: `image-${service}.log` });
    let report; try { report = JSON.parse(await readFile(resolve(outputs, `${service}.json`), 'utf8')); } catch { report = {}; }
    checks.push({ service, imageId: container.Image, imageSize: image.Size, exitCode: result.code,
      os: report.Metadata?.OS, findings: (report.Results ?? []).flatMap(item => (item.Vulnerabilities ?? []).map(issue => ({
        target: item.Target, type: item.Type, id: issue.VulnerabilityID, package: issue.PkgName, path: issue.PkgPath, installed: issue.InstalledVersion,
        fixed: issue.FixedVersion, severity: issue.Severity, status: issue.Status, primaryURL: issue.PrimaryURL, title: issue.Title }))) });
    await save('image-advisories.json', { database: metadata, checks, allScansNetwork: 'none', noSocketMounted: true });
  } finally { await unlink(archive); }
}
console.log(JSON.stringify(checks.map(item => ({ service: item.service, exitCode: item.exitCode, findings: item.findings.length }))));
