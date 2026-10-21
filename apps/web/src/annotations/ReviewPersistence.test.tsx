import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SaveReviewRequest, type PersistedReview } from '@vip/contracts';
import ReviewWorkspace from './ReviewWorkspace';
import { asset, completed, inspectionId, result, timestamp, apiError } from '../test/fixtures';
import { createReviewState, savePayload, isDirty, reviewReducer } from './draft';
import { renderApp } from '../test/render';

vi.mock('./AnnotationCanvas', () => ({ default: () => <div>Canvas</div> }));
const clients: QueryClient[] = [];
afterEach(() => { clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function saved(request: SaveReviewRequest, revision = 1): PersistedReview {
  return { contractVersion: 'v1', taxonomyVersion: 'mock-v1', revision, savedAt: timestamp, annotations: request.annotations };
}
function response(request: SaveReviewRequest, revision = 1, outcome = 'saved') {
  return Response.json({ operationId: request.operationId, operationRevision: revision,
    writeSequence: revision, review: saved(request, revision), outcome });
}
function workspace(review?: PersistedReview) {
  const client = new QueryClient(); clients.push(client);
  return render(<QueryClientProvider client={client}><ReviewWorkspace inspectionId={inspectionId} asset={asset} result={result}
    review={review} reviewWriteSequence={review?.revision ?? 0} /></QueryClientProvider>);
}
async function edit() {
  const user = userEvent.setup();
  if (screen.queryByRole('button', { name: 'Edit local draft' })) await user.click(screen.getByRole('button', { name: 'Edit local draft' }));
  await user.click(await screen.findByRole('button', { name: /Annotation 1:/ }));
  await user.selectOptions(screen.getByLabelText('Annotation class'), 'edge-defect');
  return user;
}

describe('persistent review workspace', () => {
  it('initializes saved corrections with confidence from original predictions and an unchanged baseline', async () => {
    const request = savePayload(createReviewState({ inspectionId, result }).draft, 0, 0, crypto.randomUUID());
    request.annotations[0]!.classId = 'edge-defect';
    workspace(saved(request));
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: /Annotation 1: Edge defect/ }));
    expect(screen.getByLabelText('Annotation class')).toHaveValue('edge-defect');
    expect(screen.getByText(/Original confidence: 94.0%/)).toBeVisible();
    expect(screen.getByText('Original predicted class: Surface mark')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
  });
  it('saves, establishes a clean baseline, and uses the new revision on subsequent edits', async () => {
    const requests: SaveReviewRequest[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body) as SaveReviewRequest; requests.push(request); return response(request, requests.length);
    }));
    workspace(); const user = await edit();
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByText('Review saved · revision 1.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Reject prediction' }));
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByText('Review saved · revision 2.')).toBeVisible();
    expect(requests[1]).toMatchObject({ expectedRevision: 1, expectedWriteSequence: 1 });
    expect(requests[1]!.operationId).not.toBe(requests[0]!.operationId);
    expect(requests[0]!.annotations[0]).not.toHaveProperty('originalConfidence');
  });
  it('retains and freezes an ambiguous snapshot; network retry uses exactly the same operation', async () => {
    const requests: SaveReviewRequest[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body) as SaveReviewRequest; requests.push(request);
      if (requests.length === 1) throw new TypeError('network lost');
      return response(request, 1, 'replayed');
    }));
    workspace(); const user = await edit();
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByRole('button', { name: 'Retry save' })).toBeEnabled();
    expect(screen.getByLabelText('Annotation class')).toHaveValue('edge-defect');
    expect(screen.getByLabelText('Annotation class')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(await screen.findByText('Review saved · revision 1.')).toBeVisible();
    expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
    expect(screen.getByLabelText('Annotation class')).toBeEnabled();
  });
  it.each([400, 404, 503])('preserves drafts after HTTP %s without exposing unsafe server messages', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => apiError(status === 400 ? 'INVALID_REVIEW' : status === 404 ? 'INSPECTION_NOT_FOUND' : 'DATABASE_FAILURE', status)));
    workspace(); const user = await edit(); await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('arbitrary server details');
    expect(screen.getByLabelText('Annotation class')).toHaveValue('edge-defect');
    expect(screen.getByText(/Unsaved changes ·/)).toBeVisible();
  });
  it('preserves a conflict draft until the user deliberately confirms loading the latest saved review', async () => {
    const latest = savePayload(createReviewState({ inspectionId, result }).draft, 0, 0, crypto.randomUUID());
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => options?.method === 'PUT'
      ? apiError('REVIEW_REVISION_CONFLICT', 409) : Response.json({ ...completed, review: saved(latest, 2), reviewWriteSequence: 2 })));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    workspace(); const user = await edit(); await user.click(screen.getByRole('button', { name: 'Save review' }));
    const load = await screen.findByRole('button', { name: 'Load latest saved review' });
    expect(screen.getByLabelText('Annotation class')).toHaveValue('edge-defect');
    expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
    await user.click(load); expect(screen.getByLabelText('Annotation class')).toHaveValue('edge-defect');
    confirm.mockReturnValue(true); await user.click(load);
    expect(await screen.findByText('Latest saved review loaded.')).toBeVisible();
    expect(screen.getByLabelText('Annotation class')).toHaveValue('surface-mark');
    expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
  });
  it('treats an old committed operation superseded by a newer save as a conflict without replacing the local draft', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body) as SaveReviewRequest;
      return Response.json({ operationId: request.operationId, operationRevision: 1, writeSequence: 2,
        review: saved({ ...request, annotations: request.annotations.map(annotation => ({ ...annotation, classId: 'surface-mark' })) }, 2), outcome: 'superseded' });
    }));
    workspace(); const user = await edit(); await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(await screen.findByRole('button', { name: 'Load latest saved review' })).toBeVisible();
    expect(screen.getByLabelText('Annotation class')).toHaveValue('edge-defect');
  });
  it('converts saved snapshots and strips display-only fields while enforcing the annotation cap', () => {
    const initial = createReviewState({ inspectionId, result });
    const wire = savePayload(initial.draft, 0, 0, crypto.randomUUID());
    const reloaded = createReviewState({ inspectionId, result, review: saved(wire) });
    expect(isDirty(reloaded)).toBe(false);
    const full = { ...initial, draft: { ...initial.draft, annotations: Array.from({ length: 200 }, () => initial.draft.annotations[0]!) } };
    expect(reviewReducer(full, { type: 'add', id: `manual:${crypto.randomUUID()}`, classId: 'surface-mark', box: { x: 0, y: 0, width: 1, height: 1 } })).toBe(full);
  });
  it('counts removed saved manual annotations as dirty and resets to the saved baseline', async () => {
    const request = savePayload(createReviewState({ inspectionId, result }).draft, 0, 0, crypto.randomUUID());
    request.annotations.push({ id: `manual:${crypto.randomUUID()}`, origin: 'manual', disposition: 'accepted', classId: 'surface-mark',
      boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } });
    workspace(saved(request));
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: /Annotation 3:/ }));
    await user.click(screen.getByRole('button', { name: 'Remove manual annotation' }));
    expect(screen.getByText('Unsaved changes · 1 annotation changed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save review' })).toBeEnabled();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Reset draft' }));
    expect(screen.getByRole('button', { name: /Annotation 3:/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
  });
});

describe('router navigation protection', () => {
  it('blocks dirty in-app navigation and Back/Forward; clean saved drafts navigate without prompting', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (options?.method === 'PUT') return response(JSON.parse(options.body));
      if (String(url).endsWith(`/assets/${asset.id}`)) return Response.json(asset);
      return Response.json(completed);
    }));
    const { router } = renderApp();
    await act(async () => { await router.navigate(`/inspections/${inspectionId}`); });
    await screen.findByRole('button', { name: 'Edit local draft' });
    const user = await edit();
    await user.click(screen.getByRole('link', { name: 'Service status' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toContain('/inspections/');
    await act(async () => { await router.navigate(-1); });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toContain('/inspections/');
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    await screen.findByText('Review saved · revision 1.');
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => { expect(router.state.location.pathname).toBe('/'); });
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
