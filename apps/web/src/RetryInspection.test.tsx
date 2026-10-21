import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './test/render';
import { accepted, failed, completed, processing, queued, asset, apiError } from './test/fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const childId = 'ffffffffffffffffffffffff';
const child = { ...queued, id: childId, retriedFrom: failed.id };
const acceptance = { ...accepted, id: childId, url: `/api/v1/inspections/${childId}` };

describe('manual inspection recovery', () => {
  it('prevents double clicks, navigates after acceptance, and links to the preserved failure', async () => {
    let finish!: (response: Response) => void;
    const post = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', vi.fn(async (url, options) => options?.method === 'POST' ? post()
      : String(url).endsWith(childId) ? Response.json(child) : Response.json(failed)));
    renderApp(`/inspections/${failed.id}`); const user = userEvent.setup();
    await user.dblClick(await screen.findByRole('button', { name: 'Retry inspection' }));
    expect(post).toHaveBeenCalledOnce(); expect(screen.getByRole('button', { name: 'Submitting retry…' })).toBeDisabled();
    await act(async () => { finish(Response.json(acceptance, { status: 202 })); });
    expect(await screen.findByRole('heading', { name: 'Queued' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'View previous attempt' })).toHaveAttribute('href', `/inspections/${failed.id}`);
  });
  it('preserves the same idempotency key across an ambiguous retry and never uploads again', async () => {
    const keys: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (options?.method === 'POST') {
        expect(String(url)).toBe(`/api/v1/inspections/${failed.id}/retry`);
        keys.push(options.headers['Idempotency-Key']);
        if (keys.length === 1) throw new TypeError('lost response');
        return Response.json(acceptance, { status: 202 });
      }
      return Response.json(String(url).endsWith(childId) ? child : failed);
    }));
    renderApp(`/inspections/${failed.id}`); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Retry inspection' }));
    expect(await screen.findByText('The retry could not be confirmed.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry submission' }));
    expect(await screen.findByRole('heading', { name: 'Queued' })).toBeVisible();
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]); expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('explains stale eligibility without exposing server exception details', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => options?.method === 'POST' ? apiError('INSPECTION_NOT_FAILED', 409) : Response.json(failed)));
    renderApp(`/inspections/${failed.id}`); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Retry inspection' }));
    expect(await screen.findByText(/no longer eligible for retry/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry submission' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeEnabled();
    expect(screen.queryByText(/arbitrary server details/)).not.toBeInTheDocument();
  });
  it.each([queued, processing, completed])('does not expose retry for $status inspections', async record => {
    vi.stubGlobal('fetch', vi.fn(async url => String(url).endsWith(asset.id) ? Response.json(asset) : Response.json(record)));
    renderApp(`/inspections/${record.id}`);
    await screen.findByRole('heading', { name: record.status === 'queued' ? 'Queued' : record.status === 'processing' ? 'Processing' : 'Completed' });
    expect(screen.queryByRole('button', { name: 'Retry inspection' })).not.toBeInTheDocument();
  });
  it('follows the latest retry link from an old failed inspection', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => Response.json(String(url).endsWith(childId) ? child : { ...failed, latestRetryId: childId })));
    renderApp(`/inspections/${failed.id}`); const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'View latest retry' }));
    expect(await screen.findByRole('heading', { name: 'Queued' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'View previous attempt' }));
    expect(await screen.findByRole('heading', { name: 'Inspection failed' })).toBeVisible();
  });
});
