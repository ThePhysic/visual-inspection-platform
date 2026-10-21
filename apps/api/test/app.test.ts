import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { ApiErrorResponseSchema, HEALTH_PATH, isHealthResponse } from '@vip/contracts';
import { buildApp } from '../src/app.js';

describe('Fastify application', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => { app = buildApp(); });
  afterEach(async () => { await app.close(); });

  it('serves the versioned health contract without opening a network listener', async () => {
    const response = await app.inject({ method: 'GET', url: HEALTH_PATH });

    expect(app.server.listening).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({
      apiVersion: 'v1', service: 'visual-inspection-api', status: 'ok',
    });
    expect(isHealthResponse(response.json())).toBe(true);
  });

  it('validates the request and returns a consistent error', async () => {
    const response = await app.inject({ method: 'GET', url: `${HEALTH_PATH}?unexpected=value` });

    expect(response.statusCode).toBe(400);
    expect(Value.Check(ApiErrorResponseSchema, response.json())).toBe(true);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('does not expose an unversioned health route', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(404);
    expect(Value.Check(ApiErrorResponseSchema, response.json())).toBe(true);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('does not leak internal exception details', async () => {
    app.get('/test-error', async () => { throw new Error('private exception detail'); });
    const response = await app.inject({ method: 'GET', url: '/test-error' });

    expect(response.statusCode).toBe(500);
    expect(Value.Check(ApiErrorResponseSchema, response.json())).toBe(true);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(response.body).not.toContain('private exception detail');
  });

  it('keeps liveness available while reporting unconfigured dependencies as not ready', async () => {
    const ready = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ error: { code: 'DATABASE_FAILURE' } });
    expect((await app.inject({ method: 'GET', url: HEALTH_PATH })).statusCode).toBe(200);
  });
});
