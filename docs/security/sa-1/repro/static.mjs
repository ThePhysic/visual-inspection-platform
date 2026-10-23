import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, state, run, pnpm, save } from './support.mjs';

const records = [];
const reports = resolve(state.working, 'scanner-reports');
await mkdir(reports, { recursive: true });
for (const tag of ['semgrep/semgrep:1.179.0', 'aquasec/trivy:0.76.1']) {
  const result = await run('docker', ['image', 'inspect', tag]);
  const [image] = JSON.parse(result.stdout);
  records.push({ tag, id: image.Id, digests: image.RepoDigests });
}
const base = ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--tmpfs', '/tmp:rw,size=256m', '--mount', `type=bind,src=${state.snapshot},dst=/src,readonly`,
  '--mount', `type=bind,src=${reports},dst=/out`];
const rules = resolve(root, 'docs/security/sa-1/repro/semgrep-rules.yaml');
const semgrep = await run('docker', [...base, '--env', 'SEMGREP_SEND_METRICS=off', '--env', 'SEMGREP_ENABLE_VERSION_CHECK=0',
  '--env', 'HOME=/tmp', '--mount', `type=bind,src=${rules},dst=/rules.yaml,readonly`,
  records[0].id, 'semgrep', 'scan', '--config', '/rules.yaml', '--metrics', 'off', '--disable-version-check',
  '--no-git-ignore', '--json', '--output', '/out/semgrep.json', '/src'], { allowed: [0, 1, 2, 3, 7], privateLog: 'semgrep.log' });
const trivy = await run('docker', [...base, records[1].id, 'fs', '--scanners', 'secret,misconfig',
  '--skip-check-update', '--skip-db-update', '--skip-java-db-update', '--offline-scan',
  '--cache-dir', '/tmp/trivy', '--format', 'json', '--output', '/out/trivy.json', '/src'],
{ allowed: [0, 1], privateLog: 'trivy.log' });
const audit = [];
for (const args of [['audit', '--json'], ['audit', '--prod', '--json']]) {
  const result = await pnpm(args, { cwd: state.snapshot, allowed: [0, 1], timeout: 120_000 });
  const name = args.includes('--prod') ? 'pnpm-audit-prod.json' : 'pnpm-audit-all.json';
  await writeFile(resolve(state.working, name), result.stdout);
  let data;
  try { data = JSON.parse(result.stdout); } catch { data = { error: 'Non-JSON audit output', stderr: result.stderr.slice(-1000) }; }
  // Audit responses contain package/advisory metadata; no source snippets or secrets.
  await save(name, data);
  audit.push({ args, exitCode: result.code, durationMs: result.durationMs, metadata: data.metadata ?? null, error: data.error ?? null });
}
for (const name of ['semgrep.json', 'trivy.json']) {
  try {
    const body = JSON.parse(await readFile(resolve(reports, name), 'utf8'));
    if (name.startsWith('semgrep')) {
      const sanitized = { version: body.version, errors: body.errors, paths: body.paths,
        results: body.results.map(item => ({ check_id: item.check_id, path: item.path.replace(/^\/src\//, ''),
          start: item.start, end: item.end, severity: item.extra.severity, message: item.extra.message })) };
      await save(name, sanitized);
    } else {
      // Secret scanner content is never copied. Preserve only location/rule/severity.
      await save(name, { SchemaVersion: body.SchemaVersion, Metadata: body.Metadata,
        Results: (body.Results ?? []).map(item => ({ Target: item.Target.replace(/^\/src\//, ''), Class: item.Class, Type: item.Type,
          Secrets: item.Secrets?.map(secret => ({ RuleID: secret.RuleID, Category: secret.Category, Severity: secret.Severity,
            StartLine: secret.StartLine, EndLine: secret.EndLine, Title: secret.Title })),
          MisconfSummary: item.MisconfSummary, Misconfigurations: item.Misconfigurations?.map(issue => ({
            ID: issue.ID, AVDID: issue.AVDID, Title: issue.Title, Message: issue.Message, Severity: issue.Severity,
            Status: issue.Status, PrimaryURL: issue.PrimaryURL, CauseMetadata: { StartLine: issue.CauseMetadata?.StartLine,
              EndLine: issue.CauseMetadata?.EndLine } })) })) });
    }
  } catch (error) { records.push({ report: name, error: error.name }); }
}
const manifest = JSON.parse(await readFile(resolve(state.evidence, 'source-baseline.json'), 'utf8'));
for (const file of manifest.files) {
  const bytes = await readFile(resolve(state.snapshot, file.path));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Snapshot changed during scans');
}
await save('static-execution.json', { scanners: records, semgrep: { exitCode: semgrep.code, durationMs: semgrep.durationMs },
  trivy: { exitCode: trivy.code, durationMs: trivy.durationMs }, pnpm: audit, snapshotUnchanged: true,
  rulesSha256: createHash('sha256').update(await readFile(rules)).digest('hex'),
  network: { scanners: 'none', advisoryLookup: 'package names/versions only to configured npm registry; no source upload' } });
console.log(JSON.stringify({ semgrep: semgrep.code, trivy: trivy.code, audit }));
