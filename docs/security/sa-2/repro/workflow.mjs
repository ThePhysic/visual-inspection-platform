import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { root, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment(); await test.verify();
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.tools/playwright-browsers');
const { chromium } = createRequire(resolve(root, 'apps/web/package.json'))('@playwright/test');
const browser = await chromium.launch({ headless: true });
const events = []; const pending = [];
try {
  const page = await browser.newPage();
  page.on('response', response => {
    const request = response.request();
    if (response.url().startsWith(test.CONTAINER_BASE_URL + '/api/') && ['POST', 'PUT'].includes(request.method())) {
      pending.push(request.headerValue('origin').then(origin => events.push({ method: request.method(), path: new URL(response.url()).pathname,
        status: response.status(), origin, readableBySameOrigin: true })));
    }
  });
  await page.goto(test.CONTAINER_BASE_URL);
  await page.getByLabel('Image file').setInputFiles(resolve(root, 'fixtures/inspections/panel.png'));
  await page.getByRole('button', { name: 'Upload and inspect' }).click();
  await page.getByRole('heading', { name: 'Completed', exact: true }).waitFor({ timeout: 30000 });
  const id = new URL(page.url()).pathname.split('/').at(-1);
  const before = await (await page.request.get(`${test.CONTAINER_BASE_URL}/api/v1/inspections/${id}`)).json();
  await page.getByRole('button', { name: 'Edit local draft' }).click();
  await page.getByRole('button', { name: /Annotation 1:/ }).click();
  await page.getByLabel('Annotation class', { exact: true }).selectOption('edge-defect');
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await page.getByText('Review saved · revision 1.', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /Annotation 1: Edge defect.*accepted/ }).waitFor();
  const after = await (await page.request.get(`${test.CONTAINER_BASE_URL}/api/v1/inspections/${id}`)).json();
  assert.deepEqual(after.result, before.result);
  await Promise.all(pending);
  assert.ok(events.some(e => e.method === 'POST' && e.path === '/api/v1/assets' && e.status === 201));
  assert.ok(events.some(e => e.method === 'POST' && e.path === '/api/v1/inspections' && e.status === 202));
  assert.ok(events.some(e => e.method === 'PUT' && e.path.endsWith('/review') && e.status === 200));
  assert.ok(events.every(e => e.origin === test.CONTAINER_BASE_URL));
  await save('legitimate-browser.json', { browser: browser.version(), target: test.CONTAINER_BASE_URL, events,
    originalResultUnchanged: true, savedReviewRevision: after.review.revision, reloaded: true,
    noMatroidTrafficInterception: true, browserProtections: 'default; no permissions/security bypasses' });
  console.log('Real same-origin browser upload, JSON inspection, review and reload passed with captured matching Origins.');
} finally { await browser.close(); }
