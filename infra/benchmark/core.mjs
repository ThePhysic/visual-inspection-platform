export function parseArguments(args) {
  const config = { count: 8, concurrency: 4, historySize: 200, historySamples: 10, pollMs: 100, durationMs: 120_000,
    keepLogs: false, ciMongoCompatibility: false };
  const ranges = { count: [2, 40], concurrency: [1, 8], historySize: [100, 2000], historySamples: [2, 50], pollMs: [50, 1000], durationMs: [30_000, 180_000] };
  const names = { '--count': 'count', '--concurrency': 'concurrency', '--history-size': 'historySize',
    '--history-samples': 'historySamples', '--poll-ms': 'pollMs', '--duration-ms': 'durationMs' };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error(`Repeated benchmark argument: ${flag}`);
    seen.add(flag);
    if (flag === '--keep-logs') { config.keepLogs = true; continue; }
    if (flag === '--ci-mongodb') { config.ciMongoCompatibility = true; continue; }
    const key = Object.hasOwn(names, flag) ? names[flag] : undefined; const raw = args[++index];
    if (!key || !/^\d+$/.test(raw ?? '')) throw new Error(`Invalid benchmark argument: ${flag}`);
    const value = Number(raw); const [minimum, maximum] = ranges[key];
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Out of bounds: ${flag} (${minimum}..${maximum})`);
    config[key] = value;
  }
  return config;
}

export function distribution(values) {
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid measurement');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = fraction => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
  return { samples: sorted.length, p50: percentile(0.5), p95: percentile(0.95) };
}

export function summarize(samples, elapsedMs) {
  const completed = samples.filter(sample => sample.status === 'completed').length;
  const accepted = samples.filter(sample => sample.id).length;
  const duration = key => distribution(samples.flatMap(sample => sample[key] === undefined ? [] : [sample[key]]));
  return { planned: samples.length, offered: samples.filter(sample => sample.status !== 'not_submitted').length,
    accepted, completed, failed: samples.filter(sample => sample.status === 'failed').length,
    errors: samples.filter(sample => sample.status === 'error').length,
    acceptanceUnconfirmed: samples.filter(sample => !sample.id && ['error', 'timeout'].includes(sample.status)).length,
    timeouts: samples.filter(sample => sample.status === 'timeout').length,
    notSubmitted: samples.filter(sample => sample.status === 'not_submitted').length,
    incomplete: samples.filter(sample => sample.id && sample.status !== 'completed' && sample.status !== 'failed').length,
    elapsedMs, completedPerSecond: elapsedMs > 0 ? completed / (elapsedMs / 1000) : 0,
    acceptanceMs: duration('acceptanceMs'), visibleAfterAcceptanceMs: duration('visibleAfterAcceptanceMs'),
    persistedTerminalMs: duration('persistedTerminalMs'), queueDelayMs: duration('queueDelayMs'), visibilityLagMs: duration('visibilityLagMs'),
  };
}

export async function mapConcurrent(count, concurrency, work) {
  let next = 0;
  const results = new Array(count);
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, async () => {
    while (next < count) { const index = next++; results[index] = await work(index); }
  }));
  return results;
}

export function assertBenchmarkIsolation(project, uri, redisUrl, storageDirectory) {
  if (!/^vip-reliability-[a-f0-9]{32}$/.test(project)) throw new Error('Not a generated disposable project');
  const token = project.slice('vip-reliability-'.length);
  const url = new URL(uri);
  if (url.hostname !== 'mongodb' || url.pathname !== `/vip_reliability_${token}`) throw new Error('Benchmark database isolation mismatch');
  const redis = new URL(redisUrl);
  if (redis.protocol !== 'redis:' || redis.hostname !== 'redis' || !['', '/'].includes(redis.pathname)
    || storageDirectory !== '/data/images') throw new Error('Benchmark queue/storage isolation mismatch');
}

export async function withDisposable(create, work) {
  const environment = await create();
  try { await environment.verifyOwnership(); return await work(environment); }
  finally { await environment.cleanup(); } // Existing cleanup independently re-verifies every resource.
}

export function workerMeasurements(logs, ids) {
  const selected = new Set(ids);
  const observations = logs.split(/\r?\n/).flatMap(line => {
    try {
      const event = JSON.parse(line);
      return selected.has(event.inspectionId) && Number.isFinite(event.attemptDurationMs) ? [event] : [];
    } catch { return []; }
  });
  return { loggedAttempts: observations.length, committedCompletions: observations.filter(event => event.to === 'completed').length,
    attemptMs: distribution(observations.map(event => event.attemptDurationMs)),
    providerMs: distribution(observations.flatMap(event => Number.isFinite(event.providerDurationMs) ? [event.providerDurationMs] : [])) };
}

export function readableSummary(report) {
  const pair = value => value ? `${value.p50?.toFixed(3) ?? 'n/a'}/${value.p95?.toFixed(3) ?? 'n/a'} (n=${value.samples})` : 'unavailable';
  const lines = ['Simulated inference benchmark; milliseconds, nearest-rank p50/p95; no real-model performance claim'];
  for (const item of report.scenarios ?? []) {
    lines.push(`${item.name}: offered ${item.offered}/${item.planned}, accepted ${item.accepted}, completed ${item.completed}; errors ${item.errors}, failed ${item.failed}, timeouts ${item.timeouts}, incomplete ${item.incomplete}; ${item.completedPerSecond.toFixed(3)} completed/s`,
      `  acceptance ${pair(item.acceptanceMs)}; terminal visible ${pair(item.visibleAfterAcceptanceMs)}; persisted terminal ${pair(item.persistedTerminalMs)}`,
      `  worker attempt ${pair(item.worker?.attemptMs)}; provider ${pair(item.worker?.providerMs)}`);
  }
  for (const item of report.history?.cases ?? []) lines.push(`history ${item.name}, limit ${item.limit}: ${item.skipped ?? pair(item.durationMs)}; failures ${item.failures ?? 0}, timeouts ${item.timeouts ?? 0}`);
  if (report.fatalError || report.harnessError) lines.push(`FAILED: ${report.fatalError ?? report.harnessError}`);
  lines.push('Report: .tools/benchmark-latest.json');
  return lines.join('\n');
}
