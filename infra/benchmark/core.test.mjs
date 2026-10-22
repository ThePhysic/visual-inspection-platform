import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments, distribution, summarize, mapConcurrent, assertBenchmarkIsolation, withDisposable, workerMeasurements, readableSummary } from './core.mjs';
import { assertOwnedBuildImage } from '../docker/disposable.mjs';

test('benchmark arguments are bounded, explicit and validated before Docker use', () => {
  assert.equal(parseArguments([]).concurrency, 4);
  assert.equal(parseArguments(['--count', '4', '--keep-logs']).count, 4);
  for (const args of [['--count', '9999'], ['--concurrency', '0'], ['--duration-ms', 'NaN'], ['--count'],
    ['--project', 'vip-demo'], ['--count', '4', '--count', '5'], ['--history-size', '-1']]) {
    assert.throws(() => parseArguments(args));
  }
});
test('nearest-rank percentiles and failure accounting never hide incomplete work', () => {
  assert.deepEqual(distribution([3, 1, 2]), { samples: 3, p50: 2, p95: 3 });
  assert.deepEqual(distribution([]), { samples: 0, p50: null, p95: null });
  assert.throws(() => distribution([Infinity]));
  const result = summarize([{ id: '1', status: 'completed', acceptanceMs: 10 }, { id: '2', status: 'failed' },
    { id: '3', status: 'timeout', acceptanceMs: 20 }, { status: 'error' }, { status: 'not_submitted' }], 1000);
  assert.deepEqual({ planned: result.planned, offered: result.offered, accepted: result.accepted, completed: result.completed, failed: result.failed,
    timeouts: result.timeouts, incomplete: result.incomplete, errors: result.errors, notSubmitted: result.notSubmitted },
  { planned: 5, offered: 4, accepted: 3, completed: 1, failed: 1, timeouts: 1, incomplete: 1, errors: 1, notSubmitted: 1 });
  assert.equal(result.completedPerSecond, 1);
  assert.equal(result.acceptanceMs.samples, 2);
});
test('concurrency is bounded and every offered task is accounted for', async () => {
  let active = 0; let maximum = 0;
  const samples = await mapConcurrent(8, 3, async index => {
    active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; return index;
  });
  assert.equal(maximum, 3); assert.deepEqual(samples, [0, 1, 2, 3, 4, 5, 6, 7]);
});
test('personal projects and mismatched database namespaces are rejected', () => {
  const token = 'a'.repeat(32);
  const mongo = `mongodb://mongodb:27017/vip_reliability_${token}`;
  assert.doesNotThrow(() => assertBenchmarkIsolation(`vip-reliability-${token}`, mongo, 'redis://redis:6379', '/data/images'));
  for (const project of ['vip-demo', 'vip-native', '../vip-reliability-', 'vip-reliability-123']) {
    assert.throws(() => assertBenchmarkIsolation(project, 'mongodb://mongodb:27017/visual_inspection', 'redis://redis:6379', '/data/images'));
  }
  assert.throws(() => assertBenchmarkIsolation(`vip-reliability-${token}`, 'mongodb://localhost:27017/visual_inspection', 'redis://redis:6379', '/data/images'));
  assert.throws(() => assertBenchmarkIsolation(`vip-reliability-${token}`, mongo, 'redis://localhost:6379', '/data/images'));
  assert.throws(() => assertBenchmarkIsolation(`vip-reliability-${token}`, mongo, 'redis://redis:6379/15', '/data/images'));
  assert.throws(() => assertBenchmarkIsolation(`vip-reliability-${token}`, mongo, 'redis://redis:6379', '/personal-images'));
});
test('benchmark image cleanup requires owned labels and exclusively owned tags', () => {
  const owner = 'a'.repeat(32); const project = `vip-reliability-${owner}`;
  const image = { Config: { Labels: { 'io.vip.disposable-owner': owner } }, RepoTags: [`${project}-api:latest`] };
  assert.doesNotThrow(() => assertOwnedBuildImage(image, project, owner));
  assert.throws(() => assertOwnedBuildImage(image, 'vip-demo', owner));
  assert.throws(() => assertOwnedBuildImage({ ...image, Config: { Labels: {} } }, project, owner));
  assert.throws(() => assertOwnedBuildImage({ ...image, RepoTags: ['vip-demo-api:latest'] }, project, owner));
});
test('cleanup executes after success, workload failure and ownership refusal', async () => {
  for (const failure of [null, 'ownership', 'workload']) {
    const events = [];
    const run = withDisposable(async () => ({
      async verifyOwnership() { events.push('verify'); if (failure === 'ownership') throw new Error('ownership'); },
      async cleanup() { events.push('cleanup-with-independent-ownership-check'); },
    }), async () => { events.push('work'); if (failure === 'workload') throw new Error('workload'); });
    if (failure) await assert.rejects(run); else await run;
    assert.deepEqual(events, failure === 'ownership' ? ['verify', 'cleanup-with-independent-ownership-check']
      : ['verify', 'work', 'cleanup-with-independent-ownership-check']);
  }
});
test('worker timing extraction counts selected attempts, never unrelated logs as throughput', () => {
  const lines = [{ inspectionId: 'a', to: 'queued', attemptDurationMs: 5, providerDurationMs: 1 },
    { inspectionId: 'a', to: 'completed', attemptDurationMs: 10, providerDurationMs: 2 },
    { inspectionId: 'unrelated', to: 'completed', attemptDurationMs: 1 }].map(item => JSON.stringify(item)).join('\n');
  assert.deepEqual(workerMeasurements(lines, ['a']), { loggedAttempts: 2, committedCompletions: 1,
    attemptMs: { samples: 2, p50: 5, p95: 10 }, providerMs: { samples: 2, p50: 1, p95: 2 } });
});
test('readable summaries disclose errors, timeouts and absent evidence', () => {
  const scenario = summarize([{ id: 'a', status: 'timeout' }, { status: 'error' }], 1000);
  const text = readableSummary({ scenarios: [{ name: 'baseline', ...scenario }], harnessError: 'HARNESS_FAILED' });
  assert.match(text, /errors 1, failed 0, timeouts 1, incomplete 1/);
  assert.match(text, /n\/a/);
  assert.match(text, /provider unavailable/);
  assert.match(text, /FAILED: HARNESS_FAILED/);
});
