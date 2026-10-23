import { expect, it } from 'vitest';
import { OperationalMetrics } from '@vip/backend';
import { buildApp } from '../src/app.js';

it('records one response/error with template labels, and keeps operator endpoints off the public API', async () => {
  let clock = 0;
  const metrics = new OperationalMetrics(() => { clock += 25; return clock; });
  const app = buildApp({ metrics });
  try {
    const health = await app.inject('/api/v1/health');
    expect(health.headers['x-request-id']).toBeTruthy();
    await app.inject('/api/v1/assets/not-an-id');
    await app.inject('/api/v1/assets/0123456789abcdef01234567');
    expect((await app.inject('/metrics')).statusCode).toBe(404);
    expect((await app.inject('/queue')).statusCode).toBe(404);
    const text = await metrics.registry.metrics();
    expect(text).toContain('vip_http_requests_total{route="/api/v1/health",method="GET",status_class="2xx"} 1');
    expect(text).toContain('vip_http_requests_total{route="/api/v1/assets/:id",method="GET",status_class="4xx"} 1');
    expect(text).toContain('vip_http_errors_total{category="validation"} 1');
    expect(text).toContain('vip_http_errors_total{category="dependency"} 1');
    expect(text).toContain('vip_http_errors_total{category="not_found"} 2');
    expect(text).not.toMatch(/not-an-id|0123456789abcdef/);
  } finally { await app.close(); }
});

it('uses the same Fastify request identifier in HTTP logs and response headers', async () => {
  const lines: string[] = [];
  const app = buildApp({ logger: { stream: { write: (line: string) => { lines.push(line); } } } });
  try {
    const response = await app.inject('/api/v1/health?secret=SA2_QUERY_CANARY');
    await app.inject('/SA2_PATH_CANARY?secret=SA2_QUERY_CANARY');
    expect(lines.join('')).not.toMatch(/SA2_QUERY_CANARY|SA2_PATH_CANARY/);
    const events = lines.flatMap(line => line.trim().split('\n').map(line => JSON.parse(line)));
    expect(events.filter(event => event.requestId === response.headers['x-request-id'])).toHaveLength(2);
    expect(events.some(event => 'reqId' in event)).toBe(false);
    expect(events.some(event => event.route === '/api/v1/health')).toBe(true);
    expect(events.some(event => event.statusCode === 400)).toBe(true);
  } finally { await app.close(); }
});
