import { createServer } from 'node:http';
import { type OperationalMetrics } from './metrics.js';
import { type InspectionQueue } from './queue.js';
import { type InspectionModel } from './inspection-model.js';

export function operatorPort(value: string | undefined) {
  if (value === undefined || value === '') return undefined;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('Invalid OPERATOR_PORT');
  return Number(value);
}

export async function bounded<T>(work: Promise<T>, timeoutMs = 2500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_done, reject) => {
      timer = setTimeout(() => { reject(new Error('OPERATION_UNAVAILABLE')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export async function sampleQueue(queue: Pick<InspectionQueue, 'healthy' | 'queue'>, inspections: InspectionModel) {
  return bounded((async () => {
    if (!await queue.healthy()) throw new Error('OPERATION_UNAVAILABLE');
    const [redis, mongo] = await Promise.all([
      queue.queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
      inspections.aggregate<{ _id: string; count: number }>([
        { $match: { status: { $in: ['queued', 'processing', 'completed', 'failed'] } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).option({ maxTimeMS: 1000 }).exec(),
    ]);
    return { observedAt: new Date().toISOString(), redisJobs: redis,
      mongoInspections: Object.fromEntries(['queued', 'processing', 'completed', 'failed'].map(status =>
        [status, mongo.find(item => item._id === status)?.count ?? 0])) };
  })());
}

/** Optional, loopback-only. Not registered on Fastify or routed by nginx. */
export async function startOperatorServer(metrics: OperationalMetrics, port: number, queue?: () => Promise<unknown>) {
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const run = async () => {
      if (request.method !== 'GET' || !['/metrics', ...(queue ? ['/queue'] : [])].includes(request.url ?? '')) {
        response.writeHead(404).end(); return;
      }
      if (request.url === '/metrics') {
        const body = await bounded(metrics.registry.metrics());
        response.setHeader('Content-Type', metrics.registry.contentType);
        response.end(body);
      } else {
        const body = await bounded(queue!());
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(body));
      }
    };
    void run().catch(() => { if (!response.headersSent) response.writeHead(503); response.end('OPERATION_UNAVAILABLE\n'); });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
  return { server, close: () => new Promise<void>((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeIdleConnections(); }) };
}
