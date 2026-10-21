import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { accepted, asset, completed } from '../src/test/fixtures';
import { workspaceRoot } from './settings';

test.use({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
type Box = { x: number; y: number; width: number; height: number };
const originalBox = completed.result.detections[0]!.boundingBox;
async function mockInspection(page: Page, orientation: 'landscape' | 'portrait', empty = false, failImage = false) {
  const width = orientation === 'landscape' ? 640 : 320;
  const height = orientation === 'landscape' ? 320 : 640;
  const bytes = await readFile(resolve(workspaceRoot, `apps/web/e2e/fixtures/${orientation}.png`));
  await page.route(`**${accepted.url}`, route => route.fulfill({ json: { ...completed, result: { ...completed.result, detections: empty ? [] : completed.result.detections } } }));
  await page.route(`**/api/v1/assets/${asset.id}`, route => route.fulfill({ json: { ...asset, width, height } }));
  await page.route(`**${asset.contentUrl}`, route => route.fulfill(failImage ? { status: 503, body: 'Unavailable' } : { body: bytes, contentType: 'image/png' }));
  await page.goto(`/inspections/${completed.id}`);
  await page.getByRole('button', { name: 'Edit local draft' }).click();
  if (failImage) await expect(page.getByRole('alert')).toContainText('your local draft is retained');
  else await expect(page.getByRole('group', { name: 'Annotation canvas', exact: true })).toBeVisible();
}
async function imageRectangle(page: Page) {
  const image = page.getByRole('img', { name: 'Canonical image for annotation editing' });
  await image.scrollIntoViewIfNeeded();
  const rectangle = (await image.boundingBox())!;
  const canvas = page.locator('.interactive-canvas canvas').first();
  await expect(async () => {
    const overlay = (await canvas.boundingBox())!;
    expect(Math.abs(overlay.x - rectangle.x)).toBeLessThan(1);
    expect(Math.abs(overlay.y - rectangle.y)).toBeLessThan(1);
    expect(Math.abs(overlay.width - rectangle.width)).toBeLessThan(1);
    expect(Math.abs(overlay.height - rectangle.height)).toBeLessThan(1);
  }).toPass();
  return rectangle;
}
async function currentBox(page: Page): Promise<Box> {
  const values = await Promise.all(['x', 'y', 'width', 'height'].map(key => page.getByLabel(`Box ${key}`, { exact: true }).textContent()));
  return { x: Number(values[0]), y: Number(values[1]), width: Number(values[2]), height: Number(values[3]) };
}
async function expectBox(page: Page, expected: Box) {
  await expect(async () => {
    const current = await currentBox(page);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(current[key]).toBeCloseTo(expected[key], 5);
  }).toPass();
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
}
async function moveSelected(page: Page, box: Box, dx: number, dy: number) {
  const image = await imageRectangle(page);
  const from = { x: image.x + (box.x + box.width / 2) * image.width, y: image.y + (box.y + box.height / 2) * image.height };
  await drag(page, from, { x: from.x + dx, y: from.y + dy });
  const expected = { ...box, x: Math.max(0, Math.min(1 - box.width, box.x + dx / image.width)), y: Math.max(0, Math.min(1 - box.height, box.y + dy / image.height)) };
  await expectBox(page, expected); return expected;
}
async function assertPaintedBorder(page: Page, box: Box, present = true) {
  // Inspect the transparent Konva overlay, not a test-only Konva-node API.
  // A full-alpha stroke must be painted at the expected canonical left edge.
  await expect(async () => {
    const alpha = await page.locator('.interactive-canvas canvas').first().evaluate((node, geometry) => {
      const canvas = node as HTMLCanvasElement;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const x = Math.max(0, Math.round(geometry.x * canvas.width) - Math.ceil(2 * ratio));
      const y = Math.max(0, Math.round((geometry.y + geometry.height * 0.4) * canvas.height));
      const data = canvas.getContext('2d')!.getImageData(x, y, Math.ceil(5 * ratio), 1).data;
      return Math.max(...Array.from(data).filter((_value, index) => index % 4 === 3));
    }, box);
    if (present) expect(alpha).toBeGreaterThan(200); else expect(alpha).toBe(0);
  }).toPass();
}

for (const orientation of ['landscape', 'portrait'] as const) {
  test(`actual canvas: select, move, resize, draw, reject, reset, and responsive ${orientation} at DPR 2`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); });
    await mockInspection(page, orientation);
    const image = await imageRectangle(page);
    await page.mouse.click(image.x + (originalBox.x + originalBox.width / 2) * image.width, image.y + (originalBox.y + originalBox.height / 2) * image.height);
    await expect(page.getByLabel('Annotation class', { exact: true })).toHaveValue('surface-mark');
    await expect(page.getByText('No unsaved changes.', { exact: true })).toBeVisible();
    let box = await moveSelected(page, originalBox, 22, 15);
    await assertPaintedBorder(page, box);
    const rectangle = await imageRectangle(page);
    const corner = orientation === 'portrait' ? { x: rectangle.x + box.x * rectangle.width, y: rectangle.y + box.y * rectangle.height }
      : { x: rectangle.x + (box.x + box.width) * rectangle.width, y: rectangle.y + (box.y + box.height) * rectangle.height };
    const dx = orientation === 'portrait' ? -18 : 24, dy = orientation === 'portrait' ? -15 : 20;
    await drag(page, corner, { x: corner.x + dx, y: corner.y + dy });
    box = orientation === 'portrait'
      ? { x: box.x + dx / rectangle.width, y: box.y + dy / rectangle.height, width: box.width - dx / rectangle.width, height: box.height - dy / rectangle.height }
      : { ...box, width: box.width + dx / rectangle.width, height: box.height + dy / rectangle.height };
    await expectBox(page, box); await assertPaintedBorder(page, box);
    await expect(page.getByRole('heading', { name: '2 annotations', exact: true })).toBeVisible(); // resizing did not draw
    await page.getByLabel('Annotation class', { exact: true }).selectOption('edge-defect');
    await expect(page.getByText(/Original confidence: 94.0%/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await imageRectangle(page); await expectBox(page, box); await assertPaintedBorder(page, box);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByLabel('Class for new annotation').selectOption('edge-defect');
    await page.getByRole('button', { name: 'Add annotation', exact: true }).click();
    const drawImage = await imageRectangle(page);
    await drag(page, { x: drawImage.x + drawImage.width * 0.9, y: drawImage.y + drawImage.height * 0.9 },
      { x: drawImage.x + drawImage.width * 0.65, y: drawImage.y + drawImage.height * 0.65 });
    await expect(page.getByRole('heading', { name: '3 annotations', exact: true })).toBeVisible();
    await expectBox(page, { x: 0.65, y: 0.65, width: 0.25, height: 0.25 });
    await expect(page.getByRole('button', { name: /Annotation 3: Edge defect.*Manually added; no model confidence/ })).toBeVisible();
    await moveSelected(page, { x: 0.65, y: 0.65, width: 0.25, height: 0.25 }, 12, -10);
    await page.getByLabel('Annotation class', { exact: true }).selectOption('surface-mark');
    await expect(page.getByRole('button', { name: /Annotation 3: Surface mark.*Manually added; no model confidence/ })).toBeVisible();
    await page.getByRole('button', { name: 'Remove manual annotation' }).click();
    await page.getByRole('button', { name: /Annotation 1:/ }).click();
    await page.getByRole('button', { name: 'Reject prediction' }).click();
    await expect(page.getByRole('button', { name: /Annotation 1:.*rejected/ })).toBeVisible();
    await assertPaintedBorder(page, box, false);
    await page.getByRole('button', { name: 'Restore prediction' }).click(); await expectBox(page, box);
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reset draft' }).click();
    await expectBox(page, box);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset draft' }).click();
    await expect(page.getByText('No unsaved changes.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Annotation 1: Surface mark/ }).click(); await expectBox(page, originalBox);
    expect(errors).toEqual([]);
  });
}

test('canvas constrains dragging and resize edges, and drops tiny drawings', async ({ page }) => {
  await mockInspection(page, 'landscape');
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  let box = await moveSelected(page, originalBox, -1000, 1000);
  expect(box.x).toBe(0); expect(box.y + box.height).toBeCloseTo(1, 8);
  box = await moveSelected(page, box, 1000, -1000);
  expect(box.x + box.width).toBeCloseTo(1, 8); expect(box.y).toBe(0);
  // Reset before testing minimum resize so the handle is comfortably on-screen.
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset draft' }).click();
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  const image = await imageRectangle(page);
  const corner = { x: image.x + (originalBox.x + originalBox.width) * image.width, y: image.y + (originalBox.y + originalBox.height) * image.height };
  await drag(page, corner, { x: image.x + originalBox.x * image.width + 1, y: image.y + originalBox.y * image.height + 1 });
  const minimum = await currentBox(page);
  expect(minimum.width * image.width).toBeGreaterThanOrEqual(12 - 1e-6); expect(minimum.height * image.height).toBeGreaterThanOrEqual(12 - 1e-6);
  await page.getByRole('button', { name: 'Add annotation', exact: true }).click();
  const drawImage = await imageRectangle(page);
  await drag(page, { x: drawImage.x + 10, y: drawImage.y + 10 }, { x: drawImage.x + 13, y: drawImage.y + 14 });
  await expect(page.getByRole('heading', { name: '2 annotations', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Add annotation', exact: true })).toBeVisible();
});

test('zero predictions permit drawing; navigation warns, and another inspection starts clean', async ({ page }) => {
  await mockInspection(page, 'landscape', true);
  await page.getByRole('button', { name: 'Add annotation', exact: true }).click();
  const image = await imageRectangle(page);
  await drag(page, { x: image.x + image.width * 0.2, y: image.y + image.height * 0.2 }, { x: image.x + image.width * 0.5, y: image.y + image.height * 0.6 });
  await expect(page.getByRole('heading', { name: '1 annotation', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'New inspection', exact: true }).click();
  await expect(page).toHaveURL(`/inspections/${completed.id}`);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('link', { name: 'New inspection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start an inspection', exact: true })).toBeVisible();
  const nextId = 'ffffffffffffffffffffffff';
  await page.route(`**/api/v1/inspections/${nextId}`, route => route.fulfill({ json: { ...completed, id: nextId } }));
  await page.goto(`/inspections/${nextId}`); await page.getByRole('button', { name: 'Edit local draft' }).click();
  await expect(page.getByText('No unsaved changes.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2 annotations', exact: true })).toBeVisible();
});

test('editor image failure retains labels and permits image retry', async ({ page }) => {
  await mockInspection(page, 'landscape', false, true);
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  await page.getByLabel('Annotation class', { exact: true }).selectOption('edge-defect');
  await expect(page.getByRole('alert')).toContainText('your local draft is retained');
  await expect(page.getByLabel('Annotation class', { exact: true })).toHaveValue('edge-defect');
  const bytes = await readFile(resolve(workspaceRoot, 'apps/web/e2e/fixtures/landscape.png'));
  await page.route(`**${asset.contentUrl}`, route => route.fulfill({ body: bytes, contentType: 'image/png' }));
  await page.getByRole('button', { name: 'Retry editor image' }).click();
  await expect(page.getByRole('group', { name: 'Annotation canvas', exact: true })).toBeVisible();
  await expect(page.getByLabel('Annotation class', { exact: true })).toHaveValue('edge-defect');
});

test('viewport changes cancel unfinished drag and drawing gestures without changing the draft', async ({ page }) => {
  await mockInspection(page, 'landscape');
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  let image = await imageRectangle(page);
  const from = { x: image.x + (originalBox.x + originalBox.width / 2) * image.width, y: image.y + (originalBox.y + originalBox.height / 2) * image.height };
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 30, from.y + 20, { steps: 5 });
  await page.setViewportSize({ width: 390, height: 844 }); await imageRectangle(page); await page.mouse.up();
  await expectBox(page, originalBox); await expect(page.getByText('No unsaved changes.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add annotation', exact: true }).click();
  image = await imageRectangle(page);
  await page.mouse.move(image.x + image.width * 0.1, image.y + image.height * 0.1); await page.mouse.down();
  await page.mouse.move(image.x + image.width * 0.4, image.y + image.height * 0.4, { steps: 5 });
  await page.setViewportSize({ width: 1440, height: 1100 }); await imageRectangle(page); await page.mouse.up();
  await expect(page.getByRole('heading', { name: '2 annotations', exact: true })).toBeVisible();
  await expect(page.getByText('No unsaved changes.', { exact: true })).toBeVisible();
});

test('real stack: local canvas edits never change stored predictions or send review requests', async ({ page, request }) => {
  const bytes = await readFile(resolve(workspaceRoot, 'fixtures/inspections/panel.png'));
  const uploaded = await request.post('/api/v1/assets', { multipart: { image: { name: 'panel.png', mimeType: 'image/png', buffer: bytes }, source: 'browser' } });
  expect(uploaded.status()).toBe(201);
  const submitted = await request.post('/api/v1/inspections', { headers: { 'Idempotency-Key': randomUUID() }, data: { assetId: (await uploaded.json()).id } });
  const accepted = await submitted.json();
  await expect.poll(async () => (await (await request.get(accepted.url as string)).json()).status, { timeout: 30_000 }).toBe('completed');
  const original = await (await request.get(accepted.url as string)).json();
  await page.goto(`/inspections/${String(accepted.id)}`); await page.getByRole('button', { name: 'Edit local draft' }).click();
  await expect(page.getByRole('group', { name: 'Annotation canvas', exact: true })).toBeVisible();
  const writes: string[] = []; page.on('request', event => { if (!['GET', 'HEAD'].includes(event.method())) writes.push(event.url()); });
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  await moveSelected(page, original.result.detections[0].boundingBox as Box, 20, 20);
  await page.getByLabel('Annotation class', { exact: true }).selectOption('edge-defect');
  await page.getByRole('button', { name: 'Reject prediction' }).click();
  expect((await (await request.get(accepted.url as string)).json()).result).toEqual(original.result);
  expect(writes).toEqual([]);
});
