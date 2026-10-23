import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { state, run, save } from './support.mjs';
const cache = resolve(state.working, 'trivy-advisories');
await mkdir(cache, { recursive: true });
const result = await run('docker', ['run', '--rm', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--tmpfs', '/tmp:rw,size=512m', '--mount', `type=bind,src=${cache},dst=/cache`, 'aquasec/trivy:0.76.1',
  'image', '--download-db-only', '--cache-dir', '/cache', '--timeout', '2m'],
{ allowed: [0, 1], timeout: 150_000, privateLog: 'advisory-provision.log' });
let metadata;
try { metadata = JSON.parse(await readFile(resolve(cache, 'db/metadata.json'), 'utf8')); } catch { metadata = null; }
await save('advisory-database.json', { exitCode: result.code, metadata, sourceMounted: false,
  note: 'Separate preparation container only downloads the public advisory database. No repository files, service credentials, or Docker socket mounted.' });
console.log(JSON.stringify({ exitCode: result.code, metadata }));
