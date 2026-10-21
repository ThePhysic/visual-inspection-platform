import { describe, expect, it } from 'vitest';
import { isHealthResponse } from '../src/index.js';

describe('v1 health contract', () => {
  it('accepts a complete v1 response', () => {
    expect(isHealthResponse({
      apiVersion: 'v1',
      service: 'visual-inspection-api',
      status: 'ok',
    })).toBe(true);
  });

  it.each([
    null,
    {},
    { apiVersion: 'v2', service: 'visual-inspection-api', status: 'ok' },
    { apiVersion: 'v1', service: 'other-service', status: 'ok' },
    { apiVersion: 'v1', service: 'visual-inspection-api', status: false },
    { apiVersion: 'v1', service: 'visual-inspection-api', status: 'ok', extra: true },
  ])('rejects an incompatible response: %j', (response) => {
    expect(isHealthResponse(response)).toBe(false);
  });
});
