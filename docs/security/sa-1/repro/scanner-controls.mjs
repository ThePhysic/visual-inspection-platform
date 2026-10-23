import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, state, run, save } from './support.mjs';

const input = resolve(state.working, 'scanner-controls');
const output = resolve(state.working, 'scanner-control-reports');
await mkdir(input, { recursive: true }); await mkdir(output, { recursive: true });
// Deliberately invalid, synthetic credential-shaped canary; never submitted to a service.
await writeFile(resolve(input, 'canary.js'), `const synthetic = 'ghp_${'0123456789abcdefghijklmnopqrstuvwxyz'}';\neval('synthetic-only');\n`);
const base = ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--tmpfs', '/tmp:rw,size=256m', '--mount', `type=bind,src=${input},dst=/src,readonly`, '--mount', `type=bind,src=${output},dst=/out`];
await run('docker', [...base, '--env', 'HOME=/tmp', '--mount', `type=bind,src=${resolve(root, 'docs/security/sa-1/repro/semgrep-rules.yaml')},dst=/rules.yaml,readonly`,
  'semgrep/semgrep:1.179.0', 'semgrep', 'scan', '--config', '/rules.yaml', '--metrics', 'off', '--disable-version-check',
  '--json', '--output', '/out/semgrep.json', '/src'], { privateLog: 'semgrep-controls.log' });
await run('docker', [...base, 'aquasec/trivy:0.76.1', 'fs', '--scanners', 'secret', '--skip-check-update',
  '--skip-db-update', '--offline-scan', '--cache-dir', '/tmp/cache', '--format', 'json', '--output', '/out/trivy.json', '/src'],
{ privateLog: 'trivy-controls.log' });
const semgrep = JSON.parse(await readFile(resolve(output, 'semgrep.json'), 'utf8'));
const trivy = JSON.parse(await readFile(resolve(output, 'trivy.json'), 'utf8'));
await save('scanner-controls.json', { syntheticOnly: true,
  semgrep: { detectedRules: semgrep.results.map(item => item.check_id), errors: semgrep.errors },
  trivy: { detectedRules: trivy.Results.flatMap(item => (item.Secrets ?? []).map(secret => secret.RuleID)) },
  note: 'Control input was never executed; no credential values or code snippets are copied into reports.' });
console.log('Scanner positive controls recorded');
