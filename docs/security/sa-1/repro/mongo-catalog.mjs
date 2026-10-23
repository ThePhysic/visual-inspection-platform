import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
const containers = await test.verify();
const mongo = containers.find(item => item.Config.Labels['com.docker.compose.service'] === 'mongodb');
const catalog = resolve(state.working, 'mongo-catalog');
await mkdir(resolve(catalog, 'etc'), { recursive: true });
await mkdir(resolve(catalog, 'var/lib/dpkg'), { recursive: true });
const inputs = [];
for (const file of ['/etc/os-release', '/var/lib/dpkg/status']) {
  const result = await test.compose(['exec', '-T', 'mongodb', 'cat', file]);
  await writeFile(resolve(catalog, file.slice(1)), result.stdout);
  inputs.push({ path: file, sha256: createHash('sha256').update(result.stdout).digest('hex') });
}
const output = resolve(state.working, 'image-scans');
const cache = resolve(state.working, 'trivy-advisories');
const result = await run('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,size=128m', '--mount', `type=bind,src=${catalog},dst=/catalog,readonly`,
  '--mount', `type=bind,src=${cache},dst=/cache,readonly`, '--mount', `type=bind,src=${output},dst=/out`,
  'aquasec/trivy:0.76.1', 'rootfs', '--scanners', 'vuln', '--skip-db-update', '--skip-java-db-update', '--offline-scan',
  '--skip-check-update', '--cache-dir', '/cache', '--cache-backend', 'memory', '--format', 'json', '--output', '/out/mongodb.json', '/catalog'],
{ allowed: [0, 1], timeout: 120_000, privateLog: 'mongo-catalog.log' });
const raw = JSON.parse(await readFile(resolve(output, 'mongodb.json'), 'utf8'));
const report = JSON.parse(await readFile(resolve(state.evidence, 'image-advisories.json'), 'utf8'));
report.checks.push({ service: 'mongodb', imageId: mongo.Image, exitCode: result.code, os: raw.Metadata?.OS,
  coverageBlocked: !raw.Results || raw.Metadata?.OS?.Family === 'none',
  scanMethod: 'Full image export refused above 1 GiB budget. Catalog fallback did not detect OS/packages; not a clean scan. All MongoDB advisory coverage remains blocked.', inputs,
  findings: (raw.Results ?? []).flatMap(item => (item.Vulnerabilities ?? []).map(issue => ({ target: item.Target, type: item.Type,
    id: issue.VulnerabilityID, package: issue.PkgName, installed: issue.InstalledVersion, fixed: issue.FixedVersion,
    severity: issue.Severity, status: issue.Status, primaryURL: issue.PrimaryURL, title: issue.Title }))) });
await save('image-advisories.json', report);
console.log(JSON.stringify({ exitCode: result.code, findings: report.checks.at(-1).findings.length }));
