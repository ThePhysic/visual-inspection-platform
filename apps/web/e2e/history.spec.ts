import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { connectDatabase, createInspectionModel } from '@vip/backend';
import { MOCK_CONFIGURATION } from '@vip/contracts';
import { databaseName, mongodbUri, workspaceRoot } from './settings';

async function inspect(page: Page, fixture: 'panel' | 'empty' = 'panel') {
  await page.goto('/');
  await page.getByLabel('Image file').setInputFiles(resolve(workspaceRoot, `fixtures/inspections/${fixture}.png`));
  await page.getByRole('button', { name: 'Upload and inspect' }).click();
  await expect(page.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname.split('/').at(-1)!;
}

test('real stack: multiple inspections → history → filter → reopen saved review, with mobile and draft protection', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); });
  const reviewedId = await inspect(page);
  await page.getByRole('button', { name: 'Edit local draft' }).click();
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  await page.getByLabel('Annotation class', { exact: true }).selectOption('edge-defect');
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.getByText('Review saved · revision 1.', { exact: true })).toBeVisible();
  const emptyId = await inspect(page, 'empty');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByLabel('Inspection status').selectOption('completed');
  await expect(page).toHaveURL(/\/inspections\?status=completed$/);
  const reviewed = page.locator('.history-card').filter({ has: page.locator(`a[href="/inspections/${reviewedId}"]`) });
  const empty = page.locator('.history-card').filter({ has: page.locator(`a[href="/inspections/${emptyId}"]`) });
  await expect(reviewed).toContainText('Saved review · revision 1');
  await expect(empty).toContainText('0 original detections');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reviewed.getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await reviewed.getByRole('link', { name: /Inspection ·/ }).click();
  await page.getByRole('button', { name: /Annotation 1: Edge defect/ }).click();
  await page.getByRole('button', { name: 'Reject prediction' }).click();
  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.dismiss()),
    page.getByRole('link', { name: 'History', exact: true }).click(),
  ]);
  await expect(page.getByRole('button', { name: /Annotation 1: Edge defect.*rejected/ })).toBeVisible();
  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.accept()),
    page.getByRole('link', { name: 'Back to history' }).click(),
  ]);
  await expect(page.getByLabel('Inspection status')).toHaveValue('completed');
  await reviewed.getByRole('link', { name: /Inspection ·/ }).click();
  await expect(page.getByRole('button', { name: /Annotation 1: Edge defect.*accepted/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real stack: terminal failure → lost retry response → same retry → completed child and bidirectional lineage', async ({ page }) => {
  const bytes = await readFile(resolve(workspaceRoot, 'fixtures/inspections/panel.png'));
  const upload = await page.request.post('/api/v1/assets', { multipart: { image: { name: 'panel.png', mimeType: 'image/png', buffer: bytes } } });
  expect(upload.status()).toBe(201);
  const asset = await upload.json() as { id: string };
  const connection = await connectDatabase(mongodbUri);
  try {
    if (connection.name !== databaseName || !/^vip_browser_test_[a-f0-9]{32}$/.test(databaseName)) throw new Error('Unsafe browser failure fixture target');
    const inspections = createInspectionModel(connection);
    // Deterministic terminal-failure fixture only in this run's private DB.
    // Retry acceptance and all subsequent inference use the real API/worker.
    const failure = await inspections.create({ assetId: asset.id, requested: MOCK_CONFIGURATION,
      status: 'failed', attemptCount: 1, completedAt: new Date(),
      requestScope: 'browser-fixture', requestKey: randomUUID(), requestFingerprint: 'fixture', requestId: 'fixture',
      failure: { code: 'INFERENCE_FAILED', message: 'Simulated inference failed.' } });
    const before = await inspections.findById(failure._id).lean().orFail();
    const keys: string[] = [], acceptedIds: string[] = [];
    let uploads = 0;
    page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/assets')) uploads++; });
    await page.route(`**/api/v1/inspections/${failure.id}/retry`, async route => {
      keys.push(route.request().headers()['idempotency-key']!);
      const response = await route.fetch(); expect(response.status()).toBe(202);
      acceptedIds.push((await response.json()).id as string);
      if (keys.length === 1) await route.abort('failed'); else await route.fulfill({ response });
    });
    await page.goto('/inspections?status=failed');
    const card = page.locator('.history-card').filter({ has: page.locator(`a[href="/inspections/${failure.id}"]`) });
    await card.getByRole('link', { name: /Inspection ·/ }).click();
    await expect(page.getByRole('heading', { name: 'Inspection failed', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry inspection', exact: true }).click();
    await expect(page.getByText('The retry could not be confirmed.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry submission' }).click();
    await expect(page.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible({ timeout: 30_000 });
    expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]); expect(acceptedIds[1]).toBe(acceptedIds[0]); expect(uploads).toBe(0);
    await page.getByRole('link', { name: 'View previous attempt' }).click();
    await expect(page.getByRole('heading', { name: 'Inspection failed', exact: true })).toBeVisible();
    await expect(page.getByText('Simulated inference failed.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'View latest retry' }).click();
    await expect(page.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible();
    expect(await inspections.countDocuments({ retriedFrom: failure._id })).toBe(1);
    expect(await inspections.findById(failure._id).lean().orFail()).toEqual(before);
  } finally { await connection.close(); }
});
