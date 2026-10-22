import { type InspectionModel, type InspectionRecord } from './inspection-model.js';
import { InspectionQueue, EXECUTION_POLICY, type ExecutionPolicy, type PipelineLogger } from './queue.js';
import { safeFailure, retryDelay } from './execution.js';
import { type OperationalMetrics } from './metrics.js';

export class InspectionReconciler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private immediate: ReturnType<typeof setImmediate> | undefined;
  private readonly pending = new Set<string>();
  private readonly active = new Set<string>();
  private repairRequested = false;
  private scanning = false;
  private closed = false;

  constructor(private readonly model: InspectionModel, private readonly queue: InspectionQueue,
    private readonly logger: PipelineLogger, private readonly policy: ExecutionPolicy = EXECUTION_POLICY,
    private readonly metrics?: OperationalMetrics) {}

  async reconcile() {
    if (this.closed) return;
    // Concurrent scan callers share the current pass; a prompt-only drain must
    // still run the requested recovery scan before it finishes.
    if (!this.running || !this.scanning) this.repairRequested = true;
    return this.run();
  }

  /** Post-response hint only. MongoDB intent survives a dropped/overflow hint. */
  notify(inspectionId: string) {
    if (this.closed || this.active.has(inspectionId)) return;
    if (this.pending.size >= this.policy.batchSize) return;
    this.pending.add(inspectionId);
    this.schedule();
  }

  private schedule() {
    if (this.closed || this.running || this.immediate || !this.pending.size) return;
    this.immediate = setImmediate(() => {
      this.immediate = undefined;
      void this.run().catch(() => { this.logger.error({ component: 'reconciliation' }, 'Prompt dispatch unavailable; durable intent retained'); });
    });
  }

  private run() {
    if (this.running) return this.running;
    clearImmediate(this.immediate);
    this.immediate = undefined;
    this.running = this.drain().finally(() => { this.running = undefined; this.schedule(); });
    return this.running;
  }

  private async drain() {
    while (!this.closed && (this.repairRequested || this.pending.size)) {
      if (this.repairRequested) {
        this.repairRequested = false;
        this.scanning = true;
        try { await this.repair(); this.metrics?.reconciliation('ok'); }
        catch (error) { this.metrics?.reconciliation('error'); throw error; }
        finally { this.scanning = false; }
      } else {
        const ids = [...this.pending];
        this.pending.clear();
        ids.forEach(id => { this.active.add(id); });
        try {
          const records = await this.model.find({ _id: { $in: ids }, status: 'queued' }).lean().exec();
          for (const record of records) {
            if (this.closed) break;
            await this.dispatch(record, 'prompt');
          }
        } finally { this.active.clear(); }
      }
    }
  }

  start() {
    if (this.timer || this.closed) return;
    const run = () => { void this.reconcile().catch(() => { this.logger.error({ component: 'reconciliation' }, 'Inspection repair unavailable'); }); };
    run();
    this.timer = setInterval(run, this.policy.reconcileIntervalMs);
    this.timer.unref();
  }

  async close() {
    this.closed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    clearImmediate(this.immediate);
    this.immediate = undefined;
    this.pending.clear();
    await this.running;
  }

  private async repair() {
    const now = new Date();
    const expired = await this.model.find({ status: 'processing', leaseExpiresAt: { $lte: now } })
      .sort({ updatedAt: 1 }).limit(this.policy.batchSize).lean().exec();
    for (const record of expired) {
      const exhausted = record.attemptCount >= record.maxAttempts;
      const changed = await this.model.updateOne({ _id: record._id, status: 'processing',
        ...(typeof record.attemptId === 'string' ? { attemptId: record.attemptId } : {}),
        leaseExpiresAt: { $lte: now } }, {
        $set: { status: exhausted ? 'failed' : 'queued', updatedAt: now,
          failure: safeFailure(exhausted ? 'ATTEMPTS_EXHAUSTED' : 'EXECUTION_INTERRUPTED'),
          ...(exhausted ? { completedAt: now } : { nextAttemptAt: new Date(now.getTime() + retryDelay(record.attemptCount, this.policy)) }) },
        $inc: { dispatchGeneration: 1 }, $unset: { attemptId: 1, leaseExpiresAt: 1 },
      }).exec();
      if (changed.modifiedCount) {
        this.metrics?.repair(exhausted ? 'failed' : 'queued');
        this.metrics?.failure(exhausted ? 'terminal' : 'retry', exhausted ? 'ATTEMPTS_EXHAUSTED' : 'EXECUTION_INTERRUPTED');
        if (exhausted) this.metrics?.terminal('failed', now.getTime() - record.createdAt.getTime());
        this.logger.warn({ requestId: record.requestId, inspectionId: record._id.toString(), assetId: record.assetId.toString(),
          dispatchGeneration: record.dispatchGeneration, attemptId: record.attemptId,
          from: 'processing', to: exhausted ? 'failed' : 'queued' }, 'Expired execution repaired');
      }
    }

    const queued = await this.model.find({ status: 'queued' }).sort({ updatedAt: 1 }).limit(this.policy.batchSize).lean().exec();
    for (const record of queued) {
      if (this.closed) break;
      const id = record._id.toString();
      this.pending.delete(id);
      this.active.add(id);
      try { await this.dispatch(record, 'reconciliation'); }
      finally { this.active.delete(id); }
    }
  }

  private async dispatch(record: InspectionRecord, source: 'prompt' | 'reconciliation') {
    const filter = { _id: record._id, status: 'queued' as const, dispatchGeneration: record.dispatchGeneration };
    if (record.attemptCount >= record.maxAttempts) {
      const changed = await this.model.updateOne(filter, { $set: { status: 'failed', updatedAt: new Date(), completedAt: new Date(),
        failure: safeFailure('ATTEMPTS_EXHAUSTED') } }).exec();
      if (changed.modifiedCount) {
        this.metrics?.failure('terminal', 'ATTEMPTS_EXHAUSTED');
        this.metrics?.terminal('failed', Date.now() - record.createdAt.getTime());
      }
      return;
    }
    try {
      const state = await this.queue.dispatch({ payloadVersion: 'v1', inspectionId: record._id.toString(),
        generation: record.dispatchGeneration }, record.nextAttemptAt, { requestId: record.requestId,
        assetId: record.assetId.toString(), dispatchSource: source,
        ...(record.retriedFrom ? { retriedFrom: record.retriedFrom.toString() } : {}) });
      this.metrics?.dispatch(state, source);
      if (state === 'finished') {
        await this.model.updateOne(filter, { $inc: { dispatchGeneration: 1 }, $set: { updatedAt: new Date() } }).exec();
      }
    } catch {
      this.metrics?.dispatch('error', source);
      this.logger.warn({ requestId: record.requestId, inspectionId: record._id.toString(),
        dispatchGeneration: record.dispatchGeneration, dispatchSource: source }, 'Dispatch pending; durable intent retained');
    }
    // Rotate checked records to the back of the bounded scan, including jobs
    // already waiting in Redis. A large queue cannot starve later documents.
    await this.model.updateOne(filter, { $set: { updatedAt: new Date() } }).exec();
  }
}
