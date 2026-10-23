import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { state, save } from './support.mjs';

const report = JSON.parse(await readFile(resolve(state.evidence, 'image-advisories.json'), 'utf8'));
for (const item of report.checks) {
  const raw = JSON.parse(await readFile(resolve(state.working, 'image-scans', `${item.service}.json`), 'utf8'));
  for (const issue of item.findings) {
    const match = raw.Results.flatMap(result => result.Vulnerabilities ?? []).find(value => value.VulnerabilityID === issue.id && value.PkgName === issue.package);
    issue.path = match?.PkgPath;
    if (issue.id === 'CVE-2023-45853' && issue.package === 'zlib1g' && (item.os?.Family ?? item.os?.family) === 'debian') {
      issue.disposition = 'false positive';
      issue.rationale = 'Vendor notes identify an unbuilt MiniZip component; see SA1-13.';
      issue.vendor = 'https://security-tracker.debian.org/tracker/CVE-2023-45853';
    } else if (issue.path?.startsWith('usr/local/lib/node_modules/npm/')) {
      issue.disposition = 'production-hardening opportunity';
      issue.rationale = 'Bundled npm tool dependency in the Node base image, outside the pnpm workspace graph. Runtime CMD invokes Node directly; no application path invoking npm or importing this copy was found. Not an application exploit.';
    } else {
      issue.disposition = 'suspected weakness requiring further evidence';
      issue.rationale = 'Exact image package/advisory match retained for component-specific reachability review. OS package/vendor severity is not application severity; no exploit or intended-boundary violation demonstrated. See scanner report triage groups.';
    }
    issue.localApplicationSeverity = 'unassigned; exploitability not established';
  }
}
await save('image-advisories.json', report);
await save('image-scan-summary.json', { database: report.database, services: report.checks.map(item => ({ service: item.service,
  imageId: item.imageId, exitCode: item.exitCode, coverageBlocked: Boolean(item.coverageBlocked), os: item.os,
  packageAdvisoryMatches: item.coverageBlocked ? null : item.findings.length,
  distinctAdvisories: new Set(item.findings.map(issue => issue.id)).size,
  vendorSeverityCounts: item.findings.reduce((counts, issue) => { counts[issue.severity] = (counts[issue.severity] ?? 0) + 1; return counts; }, {}),
  dispositions: item.findings.reduce((counts, issue) => { counts[issue.disposition] = (counts[issue.disposition] ?? 0) + 1; return counts; }, {}) })),
  distinctAdvisoriesAcrossImages: new Set(report.checks.flatMap(item => item.findings.map(issue => issue.id))).size,
  confirmedApplicationVulnerabilities: 0 });
console.log('Image candidate dispositions recorded; vendor severities preserved separately');
