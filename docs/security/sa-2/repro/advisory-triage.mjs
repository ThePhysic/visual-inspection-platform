import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment(); await test.verify();
const tar = await test.compose(['exec', '-T', 'redis', 'perl', '-MArchive::Tar', '-e', '1'], { allowed: [0, 2, 255] });
const packageFiles = (await test.compose(['exec', '-T', 'redis', 'dpkg-query', '-L', 'perl-base'])).stdout.trim().split('\n');
const archivePresent = tar.code === 0;
const previous = JSON.parse(await readFile(resolve(root, 'docs/security/sa-1/evidence/image-advisories.json'), 'utf8'));
const updates = [];
for (const check of previous.checks.filter(check => check.service === 'redis')) {
  for (const finding of check.findings.filter(v => v.severity === 'CRITICAL' && v.id !== 'CVE-2023-45853')) {
    updates.push({ ...finding,
      installedImage: check.imageId,
      vendor: `https://security-tracker.debian.org/tracker/${finding.id}`,
      newDisposition: finding.id === 'CVE-2026-42496' && !archivePresent ? 'not reachable in examined artifact: required Archive::Tar module unavailable; source-package candidate retained in history'
        : finding.id === 'CVE-2026-8376' ? 'not reachable under examined 64-bit Perl build; vendor package match retained, no global suppression'
        : 'unresolved vendor applicability discrepancy: source notes introduced 5.37.10, package table marks installed 5.36 affected; no Matroid Perl regex path',
      availableMaintenanceFix: 'Debian bookworm perl 5.36.0-7+deb12u4; do not change Redis runtime image without separate isolated compatibility assessment',
    });
  }
}
await save('advisory-triage.json', { redisArchiveTar: { available: archivePresent, exitCode: tar.code,
  diagnostic: archivePresent ? 'module loads' : 'Cannot locate Archive/Tar.pm in @INC',
  perlBaseFileCount: packageFiles.length, archiveTarListed: packageFiles.some(path => path.includes('/Archive/Tar')) },
  candidates: updates,
  mongo: { reviewedVendorBulletins: 'https://www.mongodb.com/resources/products/alerts',
    examples: [
      { id: 'CVE-2026-104004', affected8: '<8.0.34', installed: '8.0.34', disposition: 'outside stated affected range; validators/collation feature also not supplied by public API' },
      { id: 'CVE-2026-103965', affected8: '<8.0.34', installed: '8.0.34', disposition: 'outside stated affected range; public API does not accept arbitrary aggregation stages' },
      { id: 'CVE-2026-85091', package: 'zlib1g', installed: '1:1.3.dfsg-3.1ubuntu2.2', fix: '1:1.3.dfsg-3.1ubuntu2.3',
        vendor: 'https://ubuntu.com/security/CVE-2026-85091', prerequisite: 'Nonblocking gzwrite stall followed by gzprintf/gzvprintf using stale external buffers',
        disposition: 'OS package candidate retained; libz linked to mongod, affected write sequence not established from HTTP/normal driver paths' },
    ], limitation: 'Sampled current vendor bulletins and bounded OS catalog do not establish exhaustive MongoDB/mongosh bundled component coverage.' },
  native: { requestFacing: 'Sharp JPEG/PNG canonicalization, Fastify HTTP parsing, nginx HTTP proxy/static paths and internal MongoDB/Redis protocols',
    observedVersions: 'runtime.json includes Node embedded libraries and Sharp complete runtime version map',
    disabledOrGated: 'No TLS/QUIC/CMP/CMS/DTLS listeners or arbitrary shell/mount/Perl/archive calls; API rejects non-JPEG/PNG before decoding. These feature traces do not close unrelated memory-corruption candidates.',
    gap: 'No full native-symbol call tracing, embedded-library SBOM/advisory reconciliation, or exploit payloads. Retain unresolved reachability as blocked assessment.' },
});
console.log(JSON.stringify({ archiveTarAvailable: archivePresent, candidates: updates.length }));
