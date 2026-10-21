import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type InspectionSummary } from '@vip/contracts';
import { renderApp } from './test/render';
import { asset, completed, apiError } from './test/fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function summary(number: number): Extract<InspectionSummary, { status: 'completed' }> {
  return { id: number.toString(16).padStart(24, '0'), assetId: asset.id, status: 'completed', createdAt: completed.createdAt,
    updatedAt: completed.updatedAt, detectionCount: 2, hasReview: false, previewUrl: asset.contentUrl };
}
function page(items: InspectionSummary[], nextCursor?: string) { return Response.json({ items, hasMore: Boolean(nextCursor), ...(nextCursor ? { nextCursor } : {}) }); }
function rows() { return within(screen.getByRole('list', { name: 'Inspection history' })).queryAllByRole('listitem'); }

describe('inspection history', () => {
  it('shows loading, empty history, navigation, and a useful upload action', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    renderApp('/inspections'); expect(screen.getByText('Loading inspection history…')).toBeVisible();
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    await act(async () => { finish(page([])); });
    expect(await screen.findByRole('heading', { name: 'No inspections yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start a new inspection' })).toHaveAttribute('href', '/');
  });
  it('renders summaries and handles broken thumbnails without losing the open link', async () => {
    const row = summary(1);
    vi.stubGlobal('fetch', vi.fn(async () => page([{ ...row, status: 'completed', hasReview: true, reviewRevision: 3, retriedFrom: summary(2).id }])));
    renderApp('/inspections');
    expect(await screen.findByText(/Saved review · revision 3/)).toBeVisible();
    expect(screen.getByText(/2 original detections/)).toBeVisible();
    fireEvent.error(screen.getByRole('img', { name: 'Canonical inspection preview' }));
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    expect(screen.getByRole('link', { name: /Inspection ·/ })).toHaveAttribute('href', `/inspections/${row.id}`);
    expect(screen.getByRole('link', { name: 'View previous attempt' })).toHaveAttribute('href', `/inspections/${summary(2).id}`);
    expect(screen.queryByText(row.id)).not.toBeInTheDocument();
  });
  it('filters on the server, resets pagination, and never presents previous-filter rows as current', async () => {
    const requests: string[] = [];
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async path => {
      requests.push(String(path));
      if (String(path).includes('status=failed')) return new Promise<Response>(resolve => { finish = resolve; });
      return page([summary(2)], 'old_cursor');
    }));
    const { router } = renderApp('/inspections'); const user = userEvent.setup();
    await screen.findByRole('link', { name: /Inspection ·/ });
    await user.selectOptions(screen.getByLabelText('Inspection status'), 'failed');
    expect(rows()).toHaveLength(0); expect(screen.getByText('Loading inspection history…')).toBeVisible();
    await act(async () => { finish(page([])); });
    expect(await screen.findByRole('heading', { name: 'No failed inspections' })).toBeVisible();
    expect(requests[1]).toContain('status=failed'); expect(requests[1]).not.toContain('cursor');
    expect(router.state.location.search).toBe('?status=failed');
  });
  it('preserves loaded pages after a page failure and retries the same cursor without duplication', async () => {
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async path => {
      paths.push(String(path));
      if (paths.length === 1) return page([summary(3), summary(2)], 'page_two');
      if (paths.length === 2) throw new TypeError('offline');
      return page([summary(2), summary(1)]); // defensive overlap must not duplicate a card
    }));
    renderApp('/inspections'); const user = userEvent.setup();
    await waitFor(() => { expect(rows()).toHaveLength(2); });
    await user.click(screen.getByRole('button', { name: 'Load more inspections' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Previously loaded inspections are retained'); expect(rows()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Retry history request' }));
    await waitFor(() => { expect(rows()).toHaveLength(3); });
    expect(paths[1]).toBe(paths[2]); expect(paths[1]).toContain('cursor=page_two');
    expect(screen.queryByRole('button', { name: 'Load more inspections' })).not.toBeInTheDocument();
    expect(screen.getByText('End of inspection history.')).toBeVisible();
  });
  it('does not duplicate requests while loading another page', async () => {
    let finish!: (response: Response) => void;
    let calls = 0;
    const fetchMock = vi.fn(async () => ++calls === 1 ? page([summary(2)], 'next')
      : new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock); renderApp('/inspections'); const user = userEvent.setup();
    await user.dblClick(await screen.findByRole('button', { name: 'Load more inspections' }));
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(screen.getByRole('button', { name: 'Loading more inspections…' })).toBeDisabled();
    await act(async () => { finish(page([summary(1)])); }); await waitFor(() => { expect(rows()).toHaveLength(2); });
  });
  it('restarts from the beginning after an invalid cursor while retaining rows until the deliberate restart', async () => {
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async path => {
      paths.push(String(path)); return paths.length === 2 ? apiError('INVALID_CURSOR', 400) : page([summary(2)], paths.length === 1 ? 'invalid' : undefined);
    }));
    renderApp('/inspections'); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Load more inspections' }));
    const restart = await screen.findByRole('button', { name: 'Restart history browsing' }); expect(rows()).toHaveLength(1);
    await user.click(restart); await waitFor(() => { expect(paths).toHaveLength(3); });
    expect(paths[2]).not.toContain('cursor'); expect(await screen.findByText('End of inspection history.')).toBeVisible();
  });
  it('allows initial network recovery and hides arbitrary backend exception text', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(apiError('DATABASE_FAILURE', 503)).mockResolvedValueOnce(page([]));
    vi.stubGlobal('fetch', fetchMock); renderApp('/inspections'); const user = userEvent.setup();
    expect(await screen.findByRole('alert')).not.toHaveTextContent('arbitrary server details');
    await user.click(screen.getByRole('button', { name: 'Retry history request' }));
    expect(await screen.findByRole('heading', { name: 'No inspections yet' })).toBeVisible();
  });
  it('rejects an invalid URL filter without fetching and offers a reset', async () => {
    const fetchMock = vi.fn(async () => page([])); vi.stubGlobal('fetch', fetchMock); renderApp('/inspections?status=unknown');
    expect(screen.getByRole('alert')).toHaveTextContent('status filter is invalid'); expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Show all inspections' }));
    expect(await screen.findByRole('heading', { name: 'No inspections yet' })).toBeVisible();
  });
  it('opens a saved review and returns to the same filter and cached pages', async () => {
    const row = { ...summary(1), id: completed.id, hasReview: true, reviewRevision: 1 };
    const review = { contractVersion: 'v1', taxonomyVersion: 'mock-v1', revision: 1, savedAt: completed.createdAt,
      annotations: completed.result.detections.map(prediction => ({ origin: 'prediction', id: `prediction:${prediction.id}`, predictionId: prediction.id,
        classId: 'edge-defect', disposition: 'accepted', boundingBox: prediction.boundingBox })) };
    vi.stubGlobal('fetch', vi.fn(async path => String(path).endsWith(`/${asset.id}`) ? Response.json(asset)
      : String(path).includes('?') ? page([row]) : Response.json({ ...completed, review, reviewWriteSequence: 1 })));
    const { router } = renderApp('/inspections?status=completed'); const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: /Inspection ·/ }));
    expect(await screen.findByRole('button', { name: /Annotation 1: Edge defect/ })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Back to history' }));
    expect(router.state.location.search).toBe('?status=completed'); await waitFor(() => { expect(rows()).toHaveLength(1); });
  });
});
