// Sent over stdin into the disposable API container; never included in runtime images.
import { randomUUID, createHash } from 'node:crypto';
import { cpus, release, platform, arch, totalmem, availableParallelism } from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';
import { connectDatabase, createInspectionModel, InspectionQueue, EXECUTION_POLICY, bounded } from '@vip/backend';
import { MOCK_CONFIGURATION, isInferenceResult } from '@vip/contracts';
import { distribution, summarize, mapConcurrent, assertBenchmarkIsolation } from './core.mjs';

const { config, project, fixture } = JSON.parse(process.argv[2]);
assertBenchmarkIsolation(project, process.env.MONGODB_URI, process.env.REDIS_URL, process.env.ASSET_STORAGE_DIR);
const connection = await connectDatabase(process.env.MONGODB_URI);
const model = createInspectionModel(connection);
const queue = new InspectionQueue(process.env.REDIS_URL, { info() {}, warn() {}, error() {} });
const deadline = performance.now() + config.durationMs;
const origin = 'http://web:8080';
const report = { schemaVersion: 1, simulatedInference: true, project, config, startedAt: new Date().toISOString(), scenarios: [] };
async function request(path, options = {}, expected = 200) {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error('BENCHMARK_TIMEOUT');
  const response = await fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(Math.max(1, Math.min(5000, Math.floor(remaining)))) });
  if (response.status !== expected) throw new Error(`HTTP_${response.status}`);
  return response.json();
}
async function inspect(assetId) {
  if (performance.now() >= deadline) return { status: 'not_submitted' };
  const sample = { status: 'error', startedMs: performance.now() };
  try {
    let accepted;
    try {
      accepted = await request('/api/v1/inspections', { method: 'POST', headers: { 'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID() }, body: JSON.stringify({ assetId }) }, 202);
    } finally { sample.submissionFinishedMs = performance.now(); }
    const acceptedAt = sample.submissionFinishedMs;
    Object.assign(sample, { id: accepted.id, acceptanceMs: acceptedAt - sample.startedMs });
    const terminalDeadline = Math.min(deadline, acceptedAt + 30_000);
    while (performance.now() < terminalDeadline) {
      const record = await request(accepted.url);
      if (record.status === 'completed' || record.status === 'failed') {
        if (record.status === 'completed' && (!isInferenceResult(record.result) || !record.result.simulated)) {
          throw new Error('UNEXPECTED_INFERENCE_RESULT');
        }
        return Object.assign(sample, { status: record.status, failureCode: record.failure?.code,
          visibleAfterAcceptanceMs: Math.max(0, performance.now() - acceptedAt),
          persistedTerminalMs: Math.max(0, Date.parse(record.completedAt) - Date.parse(record.createdAt)),
          queueDelayMs: Math.max(0, Date.parse(record.processingStartedAt ?? record.completedAt) - Date.parse(record.createdAt)),
          visibilityLagMs: Math.max(0, Date.now() - Date.parse(record.completedAt)) });
      }
      await pause(Math.min(config.pollMs, Math.max(1, terminalDeadline - performance.now())));
    }
    sample.status = 'timeout'; sample.error = 'TERMINAL_TIMEOUT';
  } catch (error) {
    sample.status = /Timeout|Abort/.test(error.name) || error.message === 'BENCHMARK_TIMEOUT' ? 'timeout' : 'error';
    sample.error = /^HTTP_\d{3}$/.test(error.message) ? error.message : sample.status === 'timeout' ? 'REQUEST_TIMEOUT' : 'REQUEST_FAILED';
  }
  return sample;
}
try {
  const bytes = Buffer.from(fixture.bytes, 'base64');
  await bounded(queue.queue.waitUntilReady());
  const form = new FormData(); form.append('image', new Blob([bytes], { type: 'image/png' }), 'panel.png');
  const asset = await request('/api/v1/assets', { method: 'POST', body: form }, 201);
  const buildInfo = await connection.db.admin().command({ buildInfo: 1 });
  const redisInfo = await queue.redis.info('server');
  report.environment = { platform: platform(), release: release(), arch: arch(), node: process.version,
    cpu: cpus()[0]?.model, availableParallelism: availableParallelism(), totalMemoryBytes: totalmem(),
    mongodb: buildInfo.version, redis: redisInfo.match(/redis_version:([^\r\n]+)/)?.[1], workerConcurrency: 1, executionPolicy: EXECUTION_POLICY,
    fixture: { format: 'png', inputBytes: bytes.length, inputSha256: createHash('sha256').update(bytes).digest('hex'),
      canonicalBytes: asset.byteLength, canonicalSha256: asset.sha256, width: asset.width, height: asset.height },
    indexes: (await model.collection.indexes()).map(index => ({ name: index.name, key: index.key })) };
  // First post-readiness request is kept separate from warm-up/steady-state.
  report.firstPostStartupInspection = await inspect(asset.id);
  report.warmup = await mapConcurrent(2, 1, () => inspect(asset.id));
  for (const [name, concurrency] of [['baseline', 1], ['moderate', config.concurrency]]) {
    const started = performance.now();
    const samples = await mapConcurrent(config.count, concurrency, () => inspect(asset.id));
    const elapsed = performance.now() - started;
    const starts = samples.filter(sample => sample.startedMs !== undefined).map(sample => sample.startedMs);
    const submissionEnds = samples.flatMap(sample => sample.submissionFinishedMs === undefined ? [] : [sample.submissionFinishedMs]);
    const acceptedCount = samples.filter(sample => sample.id).length;
    const offeringMs = submissionEnds.length ? Math.max(...submissionEnds) - Math.min(...starts) : 0;
    report.scenarios.push({ name, concurrency, ...summarize(samples, elapsed),
      offeringMs, offeredRequestsPerSecondDuringSubmissionWindow: offeringMs > 0 ? starts.length / (offeringMs / 1000) : 0,
      acceptedPerSecondDuringSubmissionWindow: offeringMs > 0 ? acceptedCount / (offeringMs / 1000) : 0, samples });
  }
  // Explicit history fixtures, not processed work and never counted as throughput.
  const template = await model.findOne({ status: 'completed' }).lean();
  if (!template) throw new Error('NO_COMPLETED_HISTORY_TEMPLATE');
  const seedCount = Math.max(0, config.historySize - await model.countDocuments());
  if (seedCount) await model.insertMany(Array.from({ length: seedCount }, (_, index) => ({ assetId: asset.id,
    requested: MOCK_CONFIGURATION, status: 'completed', result: template.result, completedAt: new Date('2020-01-01'),
    createdAt: new Date(Date.UTC(2020, 0, 1) - index), attemptCount: 1, requestScope: 'benchmark:seed',
    requestKey: randomUUID(), requestFingerprint: 'seed', requestId: 'benchmark-seed' })));
  report.history = { actualRecords: await model.countDocuments(), seededRecords: seedCount, cases: [] };
  for (const limit of [20, 50]) {
    let cursor;
    for (let page = 0; page < 3; page++) {
      const result = await request(`/api/v1/inspections?status=completed&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    for (const [name, boundary] of [['first', undefined], ['afterThreePages', cursor]]) {
      if (name !== 'first' && !boundary) { report.history.cases.push({ name, limit, skipped: 'INSUFFICIENT_HISTORY' }); continue; }
      const samples = [];
      for (let index = 0; index < config.historySamples; index++) {
        const started = performance.now();
        try {
          const page = await request(`/api/v1/inspections?status=completed&limit=${limit}${boundary ? `&cursor=${encodeURIComponent(boundary)}` : ''}`);
          samples.push({ status: 'ok', durationMs: performance.now() - started, returned: page.items.length });
        } catch (error) {
          const timeout = /Timeout|Abort/.test(error.name) || error.message === 'BENCHMARK_TIMEOUT';
          samples.push({ status: timeout ? 'timeout' : 'error', error: timeout ? 'TIMEOUT' : 'REQUEST_FAILED' });
        }
      }
      report.history.cases.push({ name, limit, samples, failures: samples.filter(sample => sample.status !== 'ok').length,
        timeouts: samples.filter(sample => sample.status === 'timeout').length,
        durationMs: distribution(samples.flatMap(sample => sample.durationMs === undefined ? [] : [sample.durationMs])) });
    }
  }
} catch (error) { report.fatalError = /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'WORKLOAD_FAILED'; }
finally {
  report.finishedAt = new Date().toISOString();
  await queue.close(); await connection.close();
  console.log(`VIP_BENCHMARK_RESULT ${JSON.stringify(report)}`);
}
