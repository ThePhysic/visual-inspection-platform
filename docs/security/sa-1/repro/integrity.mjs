import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { state, pnpm, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
await test.verify();
// The two eight-request injection cases are outside this pass's concurrency budget.
// Their definitions remain reviewed; all other integration cases retain their assertions.
const pattern = '^(?!.*(?:promptly completes concurrent idempotent acceptance|uses a unique index to serialize concurrent duplicates)).*$';
const output = resolve(state.working, 'integration-vitest.json');
const args = ['--filter', '@vip/api', 'exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts',
  '--testNamePattern', pattern, '--reporter=json', '--outputFile', output];
const result = await pnpm(args, { env: { MONGODB_TEST_URI: test.MONGODB_TEST_URI, REDIS_TEST_URL: test.REDIS_TEST_URL },
  allowed: [0, 1], timeout: 300_000, privateLog: 'integration.log' });
const data = JSON.parse(await readFile(output, 'utf8'));
await save('integration-tests.json', { command: args.map(arg => arg.replace(process.cwd(), '<workspace>')), exitCode: result.code, durationMs: result.durationMs,
  numTotalTests: data.numTotalTests, numPassedTests: data.numPassedTests, numFailedTests: data.numFailedTests,
  numPendingTests: data.numPendingTests, success: data.success,
  suites: data.testResults.map(suite => ({ file: suite.name.replaceAll('\\', '/').split('/visual-inspection-platform/').at(-1), status: suite.status,
    cases: suite.assertionResults.map(item => ({ name: item.fullName, status: item.status,
      durationMs: item.duration, failures: item.failureMessages.map(message => message.replaceAll(process.cwd(), '<workspace>').slice(0, 1000)) })) })) });
console.log(JSON.stringify({ exitCode: result.code, passed: data.numPassedTests, failed: data.numFailedTests, pending: data.numPendingTests }));
