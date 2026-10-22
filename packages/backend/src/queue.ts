import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { type Logger } from 'pino';
import { setImmediate as nextEventLoopTurn } from 'node:timers/promises';
import { type InspectionJob } from '@vip/contracts';

export const INSPECTION_QUEUE = 'inspections-v1';
export const EXECUTION_POLICY = {
  attemptTimeoutMs: 10_000, leaseMs: 30_000, backoffMs: 1000, reconcileIntervalMs: 5000, batchSize: 50,
};
export type ExecutionPolicy = typeof EXECUTION_POLICY;
export type PipelineLogger = Pick<Logger, 'info' | 'warn' | 'error'>;

export function redisConnection(url: string, worker: boolean) {
  return new Redis(url, {
    // Start connecting before BullMQ observes the client. Its initialization
    // then waits for a future ready event, surviving an initial Redis outage.
    lazyConnect: false,
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    connectTimeout: 1000,
    ...(worker ? {} : { commandTimeout: 1500 }),
    retryStrategy: attempt => Math.min(attempt * 200, 2000),
  });
}

export function jobId(payload: InspectionJob) {
  return `inspection-${payload.inspectionId}-${payload.generation}`;
}

export async function closeRedisClients(clients: Redis[]) {
  await Promise.all(clients.map(async client => {
    // Reconnecting/end clients have no live socket; cancelling their reconnect
    // timer is sufficient. For a live connection, observe its actual end event.
    const ending = ['connecting', 'connect', 'ready'].includes(client.status)
      ? new Promise<void>(done => { client.once('end', () => { done(); }); }) : undefined;
    client.disconnect();
    await ending;
  }));
  // All transports have ended. Drain the deferred initialization reactions
  // before BullMQ close() removes its connection error listeners.
  await nextEventLoopTurn();
}

export class InspectionQueue {
  readonly redis: Redis;
  readonly queue: Queue<InspectionJob>;

  constructor(url: string, private readonly logger: PipelineLogger, name = INSPECTION_QUEUE,
    readonly policy: ExecutionPolicy = EXECUTION_POLICY) {
    this.redis = redisConnection(url, false);
    this.redis.on('error', () => { logger.warn({ component: 'redis' }, 'Dispatch connection unavailable'); });
    this.queue = new Queue<InspectionJob>(name, { connection: this.redis as ConnectionOptions,
      defaultJobOptions: {
        attempts: 3, backoff: { type: 'exponential', delay: policy.backoffMs },
        removeOnComplete: { age: 3600, count: 1000 }, removeOnFail: { age: 86400, count: 1000 },
      },
    });
    this.queue.on('error', () => { logger.warn({ component: 'bullmq' }, 'Dispatch queue unavailable'); });
  }

  async healthy() {
    if (this.redis.status !== 'ready') return false;
    try { return await this.redis.ping() === 'PONG'; } catch { return false; }
  }

  async dispatch(payload: InspectionJob, nextAttemptAt: Date, context: { requestId?: string; assetId?: string; retriedFrom?: string } = {}) {
    if (!await this.healthy()) throw new Error('REDIS_UNAVAILABLE');
    const id = jobId(payload);
    const job = await this.queue.getJob(id);
    if (job) {
      const state = await job.getState();
      if (!['completed', 'failed', 'unknown'].includes(state)) return 'present' as const;
      return 'finished' as const;
    }
    await this.queue.add('inspect', payload, { jobId: id, delay: Math.max(0, nextAttemptAt.getTime() - Date.now()) });
    this.logger.info({ ...context, inspectionId: payload.inspectionId, jobId: id, dispatchGeneration: payload.generation }, 'Inspection dispatched');
    return 'added' as const;
  }

  async close() {
    // Stop reconnecting before closing so shutdown does not depend on Redis.
    await closeRedisClients([this.redis]);
    await this.queue.close();
  }
}
