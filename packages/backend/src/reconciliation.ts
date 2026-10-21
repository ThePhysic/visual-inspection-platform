import { type InspectionModel } from './inspection-model.js';
import { InspectionQueue, EXECUTION_POLICY, type ExecutionPolicy, type PipelineLogger } from './queue.js';
import { safeFailure, retryDelay } from './execution.js';

export class InspectionReconciler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;

  constructor(private readonly model: InspectionModel, private readonly queue: InspectionQueue,
    private readonly logger: PipelineLogger, private readonly policy: ExecutionPolicy = EXECUTION_POLICY) {}

  async reconcile() {
    if (this.running) return this.running;
    this.running = this.repair().finally(() => { this.running = undefined; });
    return this.running;
  }

  start() {
    if (this.timer) return;
    const run = () => { void this.reconcile().catch(() => { this.logger.error({ component: 'reconciliation' }, 'Inspection repair unavailable'); }); };
    run();
    this.timer = setInterval(run, this.policy.reconcileIntervalMs);
    this.timer.unref();
  }

  async close() {
    clearInterval(this.timer);
    this.timer = undefined;
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
      if (changed.modifiedCount) this.logger.warn({ requestId: record.requestId, inspectionId: record._id.toString(),
        attemptId: record.attemptId, from: 'processing', to: exhausted ? 'failed' : 'queued' }, 'Expired execution repaired');
    }

    const queued = await this.model.find({ status: 'queued' }).sort({ updatedAt: 1 }).limit(this.policy.batchSize).lean().exec();
    for (const record of queued) {
      const filter = { _id: record._id, status: 'queued' as const, dispatchGeneration: record.dispatchGeneration };
      if (record.attemptCount >= record.maxAttempts) {
        await this.model.updateOne(filter, { $set: { status: 'failed', updatedAt: new Date(), completedAt: new Date(),
          failure: safeFailure('ATTEMPTS_EXHAUSTED') } }).exec();
        continue;
      }
      try {
        const state = await this.queue.dispatch({ payloadVersion: 'v1', inspectionId: record._id.toString(),
          generation: record.dispatchGeneration }, record.nextAttemptAt);
        if (state === 'finished') {
          await this.model.updateOne(filter, { $inc: { dispatchGeneration: 1 }, $set: { updatedAt: new Date() } }).exec();
        }
      } catch {
        this.logger.warn({ requestId: record.requestId, inspectionId: record._id.toString() }, 'Dispatch pending; durable intent retained');
      }
      // Rotate checked records to the back of the bounded scan, including jobs
      // already waiting in Redis. A large queue cannot starve later documents.
      await this.model.updateOne(filter, { $set: { updatedAt: new Date() } }).exec();
    }
  }
}
