import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { platform, release, cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { disposableEnvironment, command, root } from '../docker/disposable.mjs';
import { parseArguments, withDisposable, workerMeasurements, readableSummary } from './core.mjs';

export async function runBenchmark(args) {
  const config = parseArguments(args); // Validate before any Docker mutation.
  const directory = resolve(root, '.tools');
  await mkdir(directory, { recursive: true });
  let report;
  try {
    await withDisposable(() => disposableEnvironment({ ciMongoCompatibility: config.ciMongoCompatibility, cleanupBuiltImages: true }), async test => {
      console.log(`Disposable benchmark: ${test.project}; simulated inference only`);
      try {
        await test.compose(['build'], { echo: true, timeout: 600_000 });
        await test.compose(['up', '-d', '--wait', '--wait-timeout', '120'], { echo: true });
        await test.verifyOwnership(); await test.verifyMongoCompatibility();
        const core = await readFile(new URL('./core.mjs', import.meta.url), 'utf8');
        let workload = (await readFile(new URL('./workload.mjs', import.meta.url), 'utf8'))
          .replace("'./core.mjs'", JSON.stringify(`data:text/javascript;base64,${Buffer.from(core).toString('base64')}`));
        const bytes = await readFile(resolve(root, 'fixtures/inspections/panel.png'));
        // Keep image data on private stdin, out of argv and command-failure logs.
        const binding = 'JSON.parse(process.argv[2])';
        if (!workload.includes(binding)) throw new Error('Missing benchmark input binding');
        workload = workload.replace(binding, JSON.stringify({ config, project: test.project, fixture: { bytes: bytes.toString('base64') } }));
        console.log(`Running first request, two warm-ups, ${config.count} baseline + ${config.count} concurrent inspections, and history reads (workload budget ${config.durationMs} ms)`);
        const output = await test.compose(['exec', '-T', '-w', '/app/apps/api', 'api', 'node', '--input-type=module', '-'],
          { input: workload, timeout: config.durationMs + 30_000 });
        const line = output.split(/\r?\n/).find(line => line.startsWith('VIP_BENCHMARK_RESULT '));
        if (!line) throw new Error('Benchmark did not produce a report');
        report = JSON.parse(line.slice('VIP_BENCHMARK_RESULT '.length));
        report.host = { platform: platform(), release: release(), cpu: cpus()[0]?.model, memoryBytes: totalmem(), node: process.version };
        report.docker = JSON.parse(await command('docker', ['info', '--format', '{{json .}}']).then(text => {
          const info = JSON.parse(text); return JSON.stringify({ serverVersion: info.ServerVersion, kernel: info.KernelVersion,
            cpus: info.NCPU, memoryBytes: info.MemTotal, operatingSystem: info.OperatingSystem });
        }));
        const ids = (await test.compose(['ps', '-q'])).split(/\s+/).filter(Boolean);
        report.containers = JSON.parse(await command('docker', ['inspect', ...ids])).map(container => ({
          service: container.Config.Labels['com.docker.compose.service'], imageId: container.Image,
          memoryLimitBytes: container.HostConfig.Memory, nanoCpus: container.HostConfig.NanoCpus,
          cpuQuota: container.HostConfig.CpuQuota, cpuPeriod: container.HostConfig.CpuPeriod,
        }));
        report.source = { head: await command('git', ['rev-parse', 'HEAD']),
          workingTreeDirty: Boolean(await command('git', ['status', '--porcelain'])) };
        const logs = await test.compose(['logs', '--no-color', '--no-log-prefix', 'worker']);
        for (const scenario of report.scenarios) scenario.worker = workerMeasurements(logs, scenario.samples.flatMap(sample => sample.id ? [sample.id] : []));
        const metrics = {};
        for (const [service, port] of [['api', 9464], ['worker', 9465]]) {
          metrics[service] = await test.compose(['exec', '-T', service, 'node', '-e',
            `fetch('http://127.0.0.1:${port}/metrics',{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok)throw Error('METRICS_UNAVAILABLE');console.log(await r.text())}).catch(()=>process.exit(1))`]);
        }
        report.metrics = metrics;
        if (report.fatalError || report.firstPostStartupInspection.status !== 'completed' || report.warmup.some(sample => sample.status !== 'completed')
          || report.scenarios.some(scenario => scenario.completed !== config.count)
          || report.history.cases.some(item => item.failures > 0)) process.exitCode = 1;
      } finally {
        if (config.keepLogs) {
          const logs = await test.compose(['logs', '--no-color', '--tail', '100', 'api', 'worker']).catch(() => 'LOGS_UNAVAILABLE');
          await writeFile(resolve(directory, 'benchmark-latest.log'), logs.slice(-1_000_000));
        }
      }
    });
  } catch (error) {
    report ??= { schemaVersion: 1, simulatedInference: true, config, fatalError: 'HARNESS_FAILED' };
    report.harnessError = 'HARNESS_FAILED';
    process.exitCode = 1;
    console.error(error);
  } finally {
    if (report) {
      await writeFile(resolve(directory, 'benchmark-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
      const summary = readableSummary(report);
      await writeFile(resolve(directory, 'benchmark-latest.txt'), `${summary}\n`);
      console.log(summary);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runBenchmark(process.argv.slice(2));
