import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HEALTH_PATH, type HealthResponse } from '@vip/contracts';
import App from './App';

const health: HealthResponse = {
  apiVersion: 'v1', service: 'visual-inspection-api', status: 'ok',
};

describe('API health page', () => {
  it('shows loading while a request is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Visual Inspection Platform');
    expect(screen.getByRole('status')).toHaveTextContent('Checking API health');
  });

  it('fetches and displays the shared v1 contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(health));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    expect(await screen.findByText('API is healthy.')).toBeVisible();
    expect(screen.getByText(health.service)).toBeVisible();
    expect(screen.getByText(health.apiVersion)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(HEALTH_PATH, expect.objectContaining({
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }));
  });

  it('allows a failed request to be retried', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(health));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to check API health');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('API is healthy.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['HTTP error', () => Response.json({ error: 'unavailable' }, { status: 503 })],
    ['incompatible body', () => Response.json({ ...health, apiVersion: 'v2' })],
    ['invalid JSON', () => new Response('not json', { headers: { 'Content-Type': 'application/json' } })],
  ])('shows an error for %s', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    render(<App />);

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText('API is healthy.')).not.toBeInTheDocument();
  });

  it('cancels the request when unmounted', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<App />);
    const options = fetchMock.mock.calls[0]?.[1];

    unmount();

    await waitFor(() => { expect(options?.signal?.aborted).toBe(true); });
  });
});
