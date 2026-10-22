import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationalMetrics, errorCategory } from '../src/metrics.js';
import { bounded, operatorPort, sampleQueue, startOperatorServer } from '../src/operations.js';
import { type InspectionQueue } from '../src/queue.js';
import { type InspectionModel } from '../src/inspection-model.js';

afterEach(() => { vi.useRealTimers(); });
describe('bounded process metrics', () => {
  it('uses an injectable monotonic clock, seconds and allowlisted labels', async () => {
    let clock = 12;
    const metrics = new OperationalMetrics(() => clock);
    const start = metrics.now(); clock += 125;
    metrics.http('/api/v1/inspections/:id', 'GET', 200, metrics.elapsed(start));
    metrics.http('/private/raw-id?secret=value', 'UNTRUSTED', 503, 10);
    metrics.failure('terminal', 'untrusted-payload');
    const text = await metrics.registry.metrics();
    expect(text).toContain('vip_http_request_duration_seconds_sum{route="/api/v1/inspections/:id",method="GET"} 0.125');
    expect(text).toContain('route="unmatched",method="OTHER",status_class="5xx"');
    expect(text).toContain('code="OTHER"');
    expect(text).not.toMatch(/raw-id|secret|untrusted-payload/);
    expect(errorCategory(400)).toBe('validation');
    expect(errorCategory(409)).toBe('conflict');
    expect(errorCategory(404)).toBe('not_found');
    expect(errorCategory(500)).toBe('internal');
    expect(errorCategory(503)).toBe('dependency');
  });

  it('distinguishes attempts, provider calls, ignored deliveries and commits; restarts reset counters', async () => {
    const metrics = new OperationalMetrics();
    metrics.attemptStarted(); metrics.attemptFinished('retry', 10); metrics.providerFinished('error', 4);
    metrics.attemptStarted(); metrics.attemptFinished('completed', 8); metrics.providerFinished('returned', 2);
    metrics.terminal('completed', 25); metrics.ignored('unclaimed'); metrics.attemptFinished('stale', 5);
    const text = await metrics.registry.metrics();
    expect(text).toContain('vip_inspection_attempts_started_total 2');
    expect(text).toContain('vip_inspection_terminals_total{status="completed"} 1');
    expect(text).toContain('vip_inspection_deliveries_ignored_total{reason="unclaimed"} 1');
    expect(text).toContain('vip_inspection_attempts_finished_total{outcome="stale"} 1');
    expect(await new OperationalMetrics().registry.metrics()).not.toContain('status="completed"');
  });

  it('bounds unavailable and stuck queue samples without exposing dependency errors', async () => {
    const queue = { healthy: async () => false, queue: { getJobCounts: vi.fn() } };
    await expect(sampleQueue(queue as unknown as InspectionQueue, {} as InspectionModel)).rejects.toThrow('OPERATION_UNAVAILABLE');
    expect(queue.queue.getJobCounts).not.toHaveBeenCalled();
    vi.useFakeTimers();
    const pending = bounded(new Promise(() => {}), 50);
    const rejected = expect(pending).rejects.toThrow('OPERATION_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(50); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('separates transient queue counts from authoritative MongoDB totals', async () => {
    const counts = { waiting: 3, active: 1, failed: 5 };
    const queue = { healthy: async () => true, queue: { getJobCounts: vi.fn(async () => counts) } };
    const exec = vi.fn(async () => [{ _id: 'completed', count: 7 }]);
    const option = vi.fn(() => ({ exec }));
    const model = { aggregate: vi.fn(() => ({ option })) };
    const result = await sampleQueue(queue as unknown as InspectionQueue, model as unknown as InspectionModel);
    expect(result.redisJobs).toEqual(counts);
    expect(result.mongoInspections).toEqual({ queued: 0, processing: 0, completed: 7, failed: 0 });
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 1000 });
  });

  it('binds only loopback, allowlists methods/paths and closes the listener', async () => {
    const operations = await startOperatorServer(new OperationalMetrics(), 0, async () => { throw new Error('private credential'); });
    try {
      const address = operations.server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
      expect(address.address).toBe('127.0.0.1');
      const origin = `http://127.0.0.1:${address.port}`;
      expect((await fetch(`${origin}/metrics`)).headers.get('content-type')).toContain('text/plain');
      expect((await fetch(`${origin}/metrics`, { method: 'POST' })).status).toBe(404);
      expect((await fetch(`${origin}/metrics?raw=value`)).status).toBe(404);
      const failed = await fetch(`${origin}/queue`);
      expect(failed.status).toBe(503); expect(await failed.text()).toBe('OPERATION_UNAVAILABLE\n');
    } finally { await operations.close(); }
    expect(operations.server.listening).toBe(false);
    for (const value of ['0', '65536', '-1', 'secret', '1.5']) expect(() => operatorPort(value)).toThrow('Invalid OPERATOR_PORT');
    expect(operatorPort(undefined)).toBeUndefined(); expect(operatorPort('9464')).toBe(9464);
  });
});
