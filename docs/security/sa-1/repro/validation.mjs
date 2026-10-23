import { pnpm, save } from './support.mjs';
import { stripVTControlCharacters } from 'node:util';
const checks = [];
for (const script of ['lint', 'typecheck', 'test', 'build']) {
  console.log(`Validation starting: ${script}`);
  const result = await pnpm([script], { allowed: [0, 1, 2], timeout: 300_000, privateLog: `validation-${script}.log` });
  checks.push({ command: `pnpm ${script}`, exitCode: result.code, durationMs: result.durationMs,
    summary: (result.stdout + result.stderr).split('\n').filter(line => /Test Files|Tests |passed|failed|skipped|tests |pass |fail |skip |error TS|error {2}/i.test(line)).map(stripVTControlCharacters).slice(-70) });
  await save('workspace-validation.json', checks);
  console.log(`Validation finished: ${script}, exit ${result.code}`);
}
