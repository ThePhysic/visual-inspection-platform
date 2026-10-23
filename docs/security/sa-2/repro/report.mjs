import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { root, state, run, save } from './support.mjs';

function decode(bytes) { return bytes[0] === 255 && bytes[1] === 254 ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8'); }
const log = stripVTControlCharacters(decode(await readFile(resolve(state.working, 'reliability.log'))));
assert.match(log, /Tests\s+143 passed \(143\)/);
assert.match(log, /18 passed/); assert.match(log, /2 passed/); assert.match(log, /Container reliability passed:/);
const project = log.match(/Isolated reliability environment: (vip-reliability-[a-f0-9]{32})/)[1];
await save('regressions.json', { command: 'pnpm test:reliability --native --browser --ci-mongodb', exitCode: 0, project,
  integration: { discovered: 143, passed: 143, failed: 0, skipped: 0, deselected: 0, files: 4 },
  nativeBrowser: { passed: 18, failed: 0 }, containerBrowser: { passed: 2, failed: 0 },
  passedPhaseLines: log.split('\n').filter(line => /^(Container smoke|Worker runtime check|Reliability phase|Container reliability|\{"version":)/.test(line.trim())).map(line => line.trim()),
  fullWrapperOwnResourcesRemoved: true, anonymousVolumeLimit: 'See preservation.json; an unlabeled unmounted anonymous volume remains untouched after ordinary down/up.',
  initialCorrections: [
    { check: 'focused unit logging', passed: 52, failed: 1, correction: 'Set disableRequestLogging on Fastify LogController, not deprecated top-level option', rerunPassed: 53 },
    { check: 'workspace typecheck', exitCode: 2, correction: 'Omit undefined optional allowedHosts in test fixture', correctedExitCode: 0 },
    { check: 'Action provenance', correction: 'Peel annotated pnpm/action-setup tag to commit; final runtime.json has authoritative identities' },
    { check: 'post-cleanup inventory', correction: 'Preserve existing volumes; record one extra anonymous volume and do not delete without ownership proof' },
  ], hostedCIExecuted: false, noDynamicTestsAfterCleanupUncertainty: true,
});
const old = JSON.parse(await readFile(resolve(root, 'docs/security/sa-1/findings.json'), 'utf8'));
const dispositions = {
  'SA1-01': ['partially blocked; unnecessary runtime npm removed, other candidates retained', ['supply-chain.md', 'evidence/image-scans.json', 'evidence/advisory-triage.json']],
  'SA1-02': ['implemented owner-selected browser admission; demonstrated unwanted loopback upload now rejected, no public exploit reclassification', ['browser-boundary.md', 'evidence/browser-before.json', 'evidence/browser-after.json']],
  'SA1-03': ['per-request controls retained, configurable one/two slots; aggregate quota design deferred', ['resources-operations.md', 'evidence/regressions.json']],
  'SA1-04': ['implemented Host and framing policy; broad DNS-rebinding assessment remains untested', ['browser-boundary.md', 'evidence/http-after.json']],
  'SA1-05': ['implemented private no-store image cache and normal access log minimization', ['resources-operations.md', 'evidence/http-before.json', 'evidence/http-after.json']],
  'SA1-06': ['implemented verified Action commits/checkout credential minimization and runtime tooling removal; broader privileges/identity deferred', ['resources-operations.md', 'evidence/runtime.json']],
  'SA1-07': ['existing validation/projections retained; full regression passed', ['evidence/regressions.json']],
  'SA1-08': ['existing storage/canonicalization retained; ingestion hardening regressions passed', ['evidence/regressions.json', 'evidence/http-after.json']],
  'SA1-09': ['existing acceptance/worker/review algorithms unchanged; full real integration and recovery passed', ['evidence/regressions.json', 'evidence/legitimate-browser.json']],
  'SA1-10': ['non-root/readonly worker mount/private operators preserved in runtime/smoke checks', ['evidence/runtime.json', 'evidence/regressions.json']],
  'SA1-11': ['prior contextual health-check false positive retained; all services healthy during checks', ['../sa-1/findings.md', 'evidence/regressions.json']],
  'SA1-12': ['prior SPA/operator false positive retained; routing/operator code unchanged and smoke passed', ['../sa-1/findings.md', 'evidence/regressions.json']],
  'SA1-13': ['prior Debian zlib/MiniZip package-specific false positive retained, no global suppression', ['../sa-1/findings.md', 'supply-chain.md']],
  'SA1-14': ['Mongo OS detection resolved but embedded/native coverage, other browsers/history/settings remain gaps; new anonymous-volume cleanup limitation recorded', ['supply-chain.md', 'validation.md', 'evidence/preservation.json']],
};
await save('../findings.json', { baseline: old.baseline, model: old.model, confirmedApplicationVulnerabilities: 0,
  checkpoints: { 'SA-2A': 'partially BLOCKED', 'SA-2B': 'PASS', 'SA-2C': 'PASS within selected bounds; aggregate quota deferred',
    'SA-2': 'PASS for authorized hardening/regressions; supply-chain assessment and anonymous-volume ownership remain explicit open limitations' },
  items: old.items.map(item => ({ id: item.id, priority: item.priority, title: item.title,
    priorClassification: item.classification, originalRegister: '../sa-1/findings.json', localSeverity: item.localSeverity ?? 'No new vulnerability severity assigned',
    applicationCvssAssigned: false, disposition: dispositions[item.id][0], evidence: dispositions[item.id][1] })),
});
async function filesAt(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesAt(path)); else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'));
    else throw new Error('Unexpected report entry');
  }
  return files;
}
const tracked = (await run('git', ['diff', '--name-only'])).stdout.trim().split('\n').filter(Boolean);
const newFiles = (await run('git', ['ls-files', '--others', '--exclude-standard'])).stdout.trim().split('\n').filter(Boolean)
  .filter(path => !path.startsWith('docs/security/sa-1/'));
assert.ok(tracked.every(path => !/(^|\/)AGENTS\.md$/.test(path)));
assert.ok(newFiles.every(path => path.startsWith('docs/security/sa-2/') || ['apps/api/src/admission.ts', 'apps/api/test/admission.test.ts'].includes(path)));
const packageFiles = await filesAt(resolve(root, 'docs/security/sa-2'));
const paths = [...new Set([...tracked, ...newFiles, ...packageFiles, 'docs/security/sa-2/evidence/file-inventory.json'])].sort();
const inventory = [];
for (const path of paths) {
  const self = path === 'docs/security/sa-2/evidence/file-inventory.json';
  const bytes = self ? undefined : await readFile(resolve(root, path));
  inventory.push({ path, kind: tracked.includes(path) ? 'modified' : 'created',
    purpose: path.startsWith('docs/security/sa-2/evidence/') ? 'sanitized assessment/regression/preservation evidence'
      : path.startsWith('docs/security/sa-2/repro/') ? 'audit-owned synthetic reproduction/verification tool'
      : path.endsWith('.test.ts') ? 'focused regression' : path.startsWith('docs/') ? 'assessment/operational documentation'
      : 'authorized local hardening/configuration',
    bytes: bytes?.length, sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : '(self not hashed)' });
}
await save('file-inventory.json', { baseline: old.baseline, files: inventory,
  excludes: 'Preserved pre-existing SA-1 package, private instructions/configuration, generated dependencies/build outputs and Git metadata.',
  privateArtifacts: { root: `.tools/sa2/${state.token}`, retained: 'Raw tool/build logs, exact scanner reports/catalog, run pointer and execution markers; no retained demo data.',
    removed: 'Temporary image input archives and generated main project override after verified named-stack cleanup',
    extraDockerVolume: 'Unlabeled/unmounted resource left untouched; exact identity in preservation.json' } });
console.log(JSON.stringify({ integrationPassed: 143, browserPassed: [18, 2], inventoryFiles: inventory.length }));
