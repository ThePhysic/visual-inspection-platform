import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { root, state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
const containers = await test.verify();
const mongo = containers.find(item => item.Config.Labels['com.docker.compose.service'] === 'mongodb');
const old = JSON.parse(await readFile(resolve(root, '.tools/sa1/current.json'), 'utf8'));
const cache = resolve(old.working, 'trivy-advisories');
const scanner = 'sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c';
const catalog = resolve(state.working, 'mongo-catalog');
await mkdir(resolve(catalog, 'etc'), { recursive: true });
await mkdir(resolve(catalog, 'var/lib/dpkg'), { recursive: true });
const inputs = [];
for (const path of ['/etc/os-release', '/etc/lsb-release', '/etc/debian_version', '/var/lib/dpkg/status']) {
  const result = await test.compose(['exec', '-T', 'mongodb', 'cat', path]);
  assert.ok(Buffer.byteLength(result.stdout) < 1024 ** 2);
  await writeFile(resolve(catalog, path.slice(1)), result.stdout);
  inputs.push({ path, bytes: Buffer.byteLength(result.stdout), sha256: createHash('sha256').update(result.stdout).digest('hex') });
}
const result = await run('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--memory', '2g', '--tmpfs', '/tmp:rw,size=128m', '--env', 'TRIVY_DISABLE_TELEMETRY=true',
  '--mount', `type=bind,src=${catalog},dst=/catalog,readonly`, '--mount', `type=bind,src=${cache},dst=/cache,readonly`,
  '--mount', `type=bind,src=${state.working},dst=/out`, scanner, 'rootfs', '--scanners', 'vuln', '--skip-db-update',
  '--skip-java-db-update', '--offline-scan', '--skip-check-update', '--cache-dir', '/cache', '--cache-backend', 'memory',
  '--list-all-pkgs', '--format', 'json', '--output', '/out/mongo-catalog.json', '/catalog'], { privateLog: 'mongo-catalog.log', timeout: 120_000 });
const raw = JSON.parse(await readFile(resolve(state.working, 'mongo-catalog.json'), 'utf8'));
assert.equal(raw.Metadata.OS.Family, 'ubuntu');
assert.equal(raw.Metadata.OS.Name, '24.04');
const packages = raw.Results.flatMap(item => item.Packages ?? []);
assert.ok(packages.length > 100);
const installed = (await test.compose(['exec', '-T', 'mongodb', 'dpkg-query', '-W', '-f=${binary:Package}\t${Version}\n'])).stdout.trim().split('\n');
const binaries = (await test.compose(['exec', '-T', 'mongodb', 'sha256sum', '/usr/bin/mongod', '/usr/bin/mongosh'])).stdout.trim();
const issues = raw.Results.flatMap(item => (item.Vulnerabilities ?? []).map(v => ({
  id: v.VulnerabilityID, package: v.PkgName, installed: v.InstalledVersion, fixed: v.FixedVersion,
  severity: v.Severity, status: v.Status, primaryURL: v.PrimaryURL, title: v.Title,
  classification: 'suspected weakness requiring further evidence', applicationSeverity: 'unassigned',
})));
await save('mongo-catalog.json', { scanner: { version: raw.Trivy.Version, imageId: scanner }, exitCode: result.code,
  database: JSON.parse(await readFile(resolve(cache, 'db/metadata.json'), 'utf8')),
  databaseSha256: createHash('sha256').update(await readFile(resolve(cache, 'db/trivy.db'))).digest('hex'),
  imageId: mongo.Image, inputs, exportedBytes: inputs.reduce((sum, item) => sum + item.bytes, 0), os: raw.Metadata.OS,
  packages: packages.map(p => ({ name: p.Name, version: p.Version, source: p.SrcName, sourceVersion: p.SrcVersion })),
  installedPackageLines: installed, binaryHashes: binaries, findings: issues,
  coverage: 'OS package catalog now recognized. Not a full image scan; bundled mongosh/tool language artifacts and application-level mongod advisory reachability remain separately reviewed/limited. No image export or data mount.',
  causeOfSA1Failure: 'Pinned Trivy Ubuntu analyzer requires etc/lsb-release; generic os-release analyzer does not identify Ubuntu in this version.',
  analyzerSource: 'https://github.com/aquasecurity/trivy/blob/v0.76.1/pkg/fanal/analyzer/os/ubuntu/ubuntu.go',
});
console.log(JSON.stringify({ os: raw.Metadata.OS, packages: packages.length, matches: issues.length, exportedBytes: inputs.reduce((n, i) => n + i.bytes, 0) }));
