import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { state, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
const before = await test.verify();
await test.compose(['build'], { timeout: 600_000, privateLog: 'hardened-build.log' });
await test.verify();
await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { timeout: 180_000 });
const after = await test.verify();
await save('image-identities.json', { project: test.project,
  before: before.map(c => ({ service: c.Config.Labels['com.docker.compose.service'], image: c.Image })),
  after: after.map(c => ({ service: c.Config.Labels['com.docker.compose.service'], image: c.Image })) });
await writeFile(resolve(state.working, 'rebuild-finished.txt'), new Date().toISOString());
console.log('Hardened disposable stack ready; retained images and database preserved within that stack.');
