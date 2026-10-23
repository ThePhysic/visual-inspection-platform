import { resolve } from 'node:path';
import { root, state, run, save } from './support.mjs';

const results = [];
for (const script of ['http', 'browser', 'workflow']) {
  const result = await run(process.execPath, [resolve(root, `docs/security/sa-3/repro/${script}.mjs`)], {
    timeout: 180_000, privateLog: `${script}-execution.log`,
  });
  results.push({ command: `node docs/security/sa-3/repro/${script}.mjs`, code: result.code, durationMs: result.durationMs });
  await save('boundary-execution.json', { results, privateWorkingDirectory: `.tools/sa3/${state.token}` });
  console.log(`${script}: passed`);
}
