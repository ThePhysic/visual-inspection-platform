import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { workspaceRoot } from './settings';

async function inspect(page: Page) {
  await page.goto('/');
  await page.getByLabel('Image file').setInputFiles(resolve(workspaceRoot, 'fixtures/inspections/panel.png'));
  await page.getByRole('button', { name: 'Upload and inspect' }).click();
  await expect(page.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Edit local draft' }).click();
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  return page.url();
}
async function relabel(page: Page) { await page.getByLabel('Annotation class', { exact: true }).selectOption('edge-defect'); }
async function save(page: Page, revision: number) {
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.getByText(`Review saved · revision ${revision}.`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save review', exact: true })).toBeDisabled();
}

test('real stack: upload → inspect → edit/draw/reject → save → refresh → reopen corrections', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); });
  const url = await inspect(page);
  const original = await page.request.get(new URL(url).pathname.replace('/inspections/', '/api/v1/inspections/'));
  const predictions: unknown = (await original.json()).result;
  await relabel(page);
  await page.getByRole('button', { name: 'Reject prediction' }).click();
  await page.getByRole('button', { name: 'Add annotation', exact: true }).click();
  const image = page.getByRole('img', { name: 'Canonical image for annotation editing' });
  await image.scrollIntoViewIfNeeded();
  const rectangle = (await image.boundingBox())!;
  await page.mouse.move(rectangle.x + rectangle.width * 0.6, rectangle.y + rectangle.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(rectangle.x + rectangle.width * 0.9, rectangle.y + rectangle.height * 0.9, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: '2 annotations', exact: true })).toBeVisible();
  await save(page, 1);
  await page.reload();
  await expect(page.getByRole('button', { name: /Annotation 1: Edge defect.*rejected/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Annotation 2:.*Manually added; no model confidence/ })).toBeVisible();
  await page.getByRole('button', { name: /Annotation 2:/ }).click();
  for (const key of ['x', 'y'] as const) expect(Number(await page.getByLabel(`Box ${key}`, { exact: true }).textContent())).toBeCloseTo(0.6, 5);
  for (const key of ['width', 'height'] as const) expect(Number(await page.getByLabel(`Box ${key}`, { exact: true }).textContent())).toBeCloseTo(0.3, 5);
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  await page.getByRole('button', { name: 'Restore prediction' }).click();
  await save(page, 2);
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await page.getByRole('link', { name: 'New inspection', exact: true }).click();
  await expect(page.getByLabel('Image file')).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole('button', { name: /Annotation 1: Edge defect.*accepted/ })).toBeVisible();
  const stored = await page.request.get(new URL(url).pathname.replace('/inspections/', '/api/v1/inspections/'));
  expect((await stored.json()).result).toEqual(predictions);
  expect(dialogs).toBe(0); expect(errors).toEqual([]);
});

test('real stack: committed save with lost HTTP response retries the exact operation once', async ({ page }) => {
  const payloads: unknown[] = [];
  const url = await inspect(page); await relabel(page);
  await page.route('**/api/v1/inspections/*/review', async route => {
    payloads.push(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (payloads.length === 1) await route.abort('failed'); else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry save' })).toBeEnabled();
  await expect(page.getByLabel('Annotation class', { exact: true })).toHaveValue('edge-defect');
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByText('Review saved · revision 1.', { exact: true })).toBeVisible();
  expect(payloads).toHaveLength(2); expect(payloads[0]).toEqual(payloads[1]);
  const record = await page.request.get(new URL(url).pathname.replace('/inspections/', '/api/v1/inspections/'));
  expect((await record.json()).review.revision).toBe(1);
});

test('real stack: two tabs conflict, retain local edits, and explicitly load the latest saved review', async ({ page, context }) => {
  const url = await inspect(page);
  const other = await context.newPage(); await other.goto(url);
  await other.getByRole('button', { name: 'Edit local draft' }).click();
  await other.getByRole('button', { name: /Annotation 1:/ }).click();
  await other.getByRole('button', { name: 'Reject prediction' }).click();
  await relabel(page); await save(page, 1);
  await other.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('A newer review exists');
  await expect(other.getByRole('button', { name: /Annotation 1: Surface mark.*rejected/ })).toBeVisible();
  other.once('dialog', dialog => dialog.dismiss());
  await other.getByRole('button', { name: 'Load latest saved review' }).click();
  await expect(other.getByRole('button', { name: /Annotation 1: Surface mark.*rejected/ })).toBeVisible();
  other.once('dialog', dialog => dialog.accept());
  await other.getByRole('button', { name: 'Load latest saved review' }).click();
  await expect(other.getByRole('button', { name: /Annotation 1: Edge defect.*accepted/ })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Save review', exact: true })).toBeDisabled();
  await other.getByRole('button', { name: 'Reject prediction' }).click(); await save(other, 2);
  await other.close();
});

test('browser Back/Forward and reload protect dirty drafts; saving clears warnings', async ({ page }) => {
  const url = await inspect(page); await relabel(page);
  const backPrompt = page.waitForEvent('dialog');
  await page.evaluate(() => { history.back(); });
  const back = await backPrompt; expect(back.type()).toBe('confirm'); await back.dismiss();
  await expect(page.getByRole('button', { name: /Annotation 1: Edge defect/ })).toBeVisible();
  await expect(page).toHaveURL(url);
  const reloadPrompt = new Promise<void>(resolvePrompt => {
    page.once('dialog', async dialog => { expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); resolvePrompt(); });
  });
  // Dismissed reloads never emit a load navigation event; synchronize on the
  // actual dialog instead of waiting for page.reload() to complete a navigation.
  await page.evaluate(() => { window.location.reload(); });
  await reloadPrompt;
  await expect(page.getByText(/Unsaved changes ·/)).toBeVisible();
  await save(page, 1);
  let dialogs = 0; page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await page.goBack(); await expect(page.getByLabel('Image file')).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('button', { name: /Annotation 1: Edge defect/ })).toBeVisible();
  expect(dialogs).toBe(0);
});
