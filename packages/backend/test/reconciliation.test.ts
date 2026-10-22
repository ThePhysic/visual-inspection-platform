import { describe, expect, it, vi } from 'vitest';
import { InspectionReconciler } from '../src/reconciliation.js';
import { EXECUTION_POLICY, type InspectionQueue } from '../src/queue.js';
import { type InspectionModel, type InspectionRecord } from '../src/inspection-model.js';
import { OperationalMetrics } from '../src/metrics.js';

function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(batchSize = 2) {
  const records = ['first', 'second', 'overflow'].map(id => ({ _id: id, assetId: 'asset', status: 'queued',
    dispatchGeneration: 0, attemptCount: 0, maxAttempts: 3, nextAttemptAt: new Date(0), createdAt: new Date(),
  } as unknown as InspectionRecord));
  const find = vi.fn((filter: { status: string; _id?: { $in: string[] } }) => {
    let limit = records.length;
    const query = { sort: () => query, limit: (value: number) => { limit = value; return query; }, lean: () => query,
      exec: async () => filter.status === 'processing' ? []
        : records.filter(record => !filter._id || filter._id.$in.includes(String(record._id))).slice(0, limit),
    };
    return query;
  });
  const model = { find, updateOne: vi.fn(() => ({ exec: async () => ({ modifiedCount: 1 }) })) };
  const dispatch = vi.fn<InspectionQueue['dispatch']>().mockResolvedValue('added');
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const metrics = new OperationalMetrics();
  const reconciler = new InspectionReconciler(model as unknown as InspectionModel,
    { dispatch } as unknown as InspectionQueue, logger, { ...EXECUTION_POLICY, batchSize }, metrics);
  return { reconciler, dispatch, find, logger, metrics };
}

describe('managed prompt dispatch', () => {
  it('bounds and coalesces hints, suppresses active duplicates, and waits for in-flight work on close', async () => {
    const { reconciler, dispatch, find } = fixture();
    const entered = barrier();
    const release = barrier();
    dispatch.mockImplementation(async () => { entered.resolve(); await release.promise; return 'added'; });
    for (let i = 0; i < 1000; i++) reconciler.notify('first');
    reconciler.notify('second'); reconciler.notify('overflow');
    try {
      await entered.promise;
      expect(find).toHaveBeenCalledWith({ _id: { $in: ['first', 'second'] }, status: 'queued' });
      reconciler.notify('first'); reconciler.notify('second');
      let closed = false;
      const closing = reconciler.close().then(() => { closed = true; });
      await Promise.resolve(); expect(closed).toBe(false);
      release.resolve(); await closing;
      reconciler.notify('first'); await reconciler.reconcile();
      expect(dispatch).toHaveBeenCalledTimes(1); // Unstarted hints stay durable, not drained at shutdown.
    } finally { release.resolve(); await reconciler.close(); }
  });

  it('serializes prompt and periodic work and does not lose a scan requested during a prompt attempt', async () => {
    const { reconciler, dispatch, metrics } = fixture();
    const entered = barrier();
    const release = barrier();
    dispatch.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return 'added'; })
      .mockResolvedValue('present');
    try {
      reconciler.notify('first'); await entered.promise;
      const scan = reconciler.reconcile();
      reconciler.notify('first');
      const shared = reconciler.reconcile();
      expect(dispatch).toHaveBeenCalledTimes(1);
      release.resolve(); await Promise.all([scan, shared]);
      const text = await metrics.registry.metrics();
      expect(text).toContain('vip_dispatch_total{outcome="added",source="prompt"} 1');
      expect(text).toContain('vip_dispatch_total{outcome="present",source="reconciliation"} 2');
      expect(text).toContain('vip_reconciliation_total{outcome="ok"} 1');
    } finally { release.resolve(); await reconciler.close(); }
  });

  it('drains a hint arriving during a recovery scan even when that scan misses the new record', async () => {
    const { reconciler, find, dispatch, metrics } = fixture();
    const entered = barrier();
    const release = barrier();
    const original = find.getMockImplementation()!;
    find.mockImplementationOnce(filter => {
      const query = original(filter);
      const exec = query.exec;
      query.exec = async () => { entered.resolve(); await release.promise; return exec(); };
      return query;
    }).mockImplementationOnce(() => original({ status: 'processing' })); // Empty queued scan snapshot.
    try {
      const scan = reconciler.reconcile(); await entered.promise;
      reconciler.notify('first'); reconciler.notify('first');
      release.resolve(); await scan;
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(await metrics.registry.metrics()).toContain('vip_dispatch_total{outcome="added",source="prompt"} 1');
    } finally { release.resolve(); await reconciler.close(); }
  });

  it.each(['REDIS_UNAVAILABLE', 'Command timed out'])('retains durable intent after %s, then recovers through a scan', async failure => {
    const { reconciler, dispatch, logger, metrics } = fixture();
    const observed = barrier();
    logger.warn.mockImplementation(() => { observed.resolve(); });
    dispatch.mockRejectedValueOnce(new Error(failure));
    try {
      reconciler.notify('first'); await observed.promise;
      await reconciler.reconcile();
      const text = await metrics.registry.metrics();
      expect(text).toContain('vip_dispatch_total{outcome="error",source="prompt"} 1');
      expect(text).toContain('vip_dispatch_total{outcome="added",source="reconciliation"} 2');
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ dispatchSource: 'prompt' }), expect.any(String));
    } finally { await reconciler.close(); }
  });

  it('cancels a scheduled hint at shutdown and lets a fresh reconciler recover it', async () => {
    const { reconciler, dispatch } = fixture();
    reconciler.notify('first'); await reconciler.close();
    expect(dispatch).not.toHaveBeenCalled();
    const restarted = fixture();
    try { await restarted.reconciler.reconcile(); expect(restarted.dispatch).toHaveBeenCalledTimes(2); }
    finally { await restarted.reconciler.close(); }
  });

  it('observes a producer timeout rejection and releases the serial drain for recovery', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { reconciler, dispatch, metrics } = fixture();
    const entered = barrier();
    dispatch.mockImplementationOnce(() => new Promise((_, reject) => {
      setTimeout(() => { reject(new Error('Command timed out')); }, 1500);
      entered.resolve();
    }));
    try {
      reconciler.notify('first'); await entered.promise;
      const recovery = reconciler.reconcile();
      await vi.advanceTimersByTimeAsync(1500); await recovery;
      expect(await metrics.registry.metrics()).toContain('vip_dispatch_total{outcome="error",source="prompt"} 1');
      expect(dispatch).toHaveBeenCalledTimes(3);
    } finally { await reconciler.close(); vi.useRealTimers(); }
  });

  it('contains background MongoDB failures instead of rejecting an unobserved promise', async () => {
    const { reconciler, find, logger } = fixture();
    const observed = barrier();
    find.mockImplementationOnce(() => { throw new Error('DATABASE_UNAVAILABLE'); });
    logger.error.mockImplementation(() => { observed.resolve(); });
    try {
      reconciler.notify('first'); await observed.promise;
      await reconciler.reconcile();
      expect(logger.error).toHaveBeenCalledTimes(1);
    } finally { await reconciler.close(); }
  });
});
