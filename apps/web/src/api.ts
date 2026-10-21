import { HEALTH_PATH, isHealthResponse, type HealthResponse } from '@vip/contracts';

export async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(HEALTH_PATH, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed (HTTP ${response.status}).`);
  }

  const body: unknown = await response.json();
  if (!isHealthResponse(body)) {
    throw new Error('The API returned an incompatible health response.');
  }

  return body;
}
