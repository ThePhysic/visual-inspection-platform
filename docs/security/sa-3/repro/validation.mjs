import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { state, pnpm, save } from './support.mjs';

const results = [];
const final = true; // Local gates only; do not repeat external metadata queries.
for (const script of ['lint', 'typecheck', 'test', 'build']) {
  const result = await pnpm([script], { allowed: [0, 1, 2], timeout: 600_000, privateLog: `workspace-${script}${final ? '-final' : ''}.log` });
  const plain = stripVTControlCharacters(result.stdout + '\n' + result.stderr);
  results.push({ command: `pnpm ${script}`, code: result.code, durationMs: result.durationMs,
    testCounts: script === 'test' ? plain.split('\n').filter(line => /Tests\s|# tests |# pass |# fail |# skipped /.test(line)).map(line => line.trim()) : [] });
  await save(final ? 'workspace-validation-final.json' : 'workspace-validation.json', { node: process.version, pnpm: '10.34.7', results });
  console.log(JSON.stringify(results.at(-1)));
  if (result.code) process.exitCode = 1;
}
for (const mode of final ? [] : ['all', 'prod']) {
  const args = ['audit', ...(mode === 'prod' ? ['--prod'] : []), '--json'];
  const result = await pnpm(args, { allowed: [0, 1], timeout: 120_000, privateLog: `audit-${mode}.log` });
  const report = JSON.parse(result.stdout);
  await save(`pnpm-audit-${mode}.json`, report);
  console.log(`pnpm audit ${mode}: exit ${result.code}`);
}
// Keep the preserved SA-1 results available alongside this new execution.
await writeFile(resolve(state.working, 'validation-finished.txt'), new Date().toISOString());
await readFile(resolve(state.evidence, 'baseline.json'));
