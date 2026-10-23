/* global window, document */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { root, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment();
const phase = 'after';
await test.verify();
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const mongoose = apiRequire('mongoose');
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.tools/playwright-browsers');
const { chromium } = webRequire('@playwright/test');
const bytes = await readFile(resolve(root, 'fixtures/inspections/panel.png'));
const db = await mongoose.createConnection(test.MONGODB_TEST_URI, { dbName: `vip_reliability_${test.owner}` }).asPromise();
const assets = db.collection('assets');
const inspections = db.collection('inspections');
const originServer = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>SA1 controlled unrelated origin</title>'); });
await new Promise(done => originServer.listen(0, '127.0.0.1', done));
const localOrigin = `http://127.0.0.1:${originServer.address().port}`;
const syntheticOrigin = 'https://sa1-public.invalid';
const target = test.CONTAINER_BASE_URL;
const report = { browser: '', defaults: 'No disabled browser protections, permission grants, or security flags',
  fixtureSha256: createHash('sha256').update(bytes).digest('hex'), origins: [localOrigin, syntheticOrigin], target,
  cases: [], network: [], console: [] };
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
try {
  for (const origin of [localOrigin, syntheticOrigin]) {
    const context = await browser.newContext();
    // Intercept only the synthetic origin. Routing application traffic can alter
    // browser preflight handling, so real loopback HTTP remains unintercepted.
    if (origin === syntheticOrigin) await context.route(syntheticOrigin + '/**', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>SA1 synthetic public origin</title>' }));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', event => {
      if (event.request.url.startsWith(target + '/api/')) report.network.push({ kind: 'request', from: origin,
        method: event.request.method, path: new URL(event.request.url).pathname, type: event.type,
        origin: event.request.headers.Origin ?? null });
    });
    page.on('response', response => {
      if (response.url().startsWith(target + '/api/')) report.network.push({ from: origin, method: response.request().method(),
        path: new URL(response.url()).pathname, status: response.status(), origin: response.request().headers().origin ?? null });
    });
    page.on('console', message => { if (message.type() === 'error') report.console.push({ from: origin, text: message.text().slice(0, 1500) }); });
    await page.goto(origin);
    const secureContext = await page.evaluate(() => window.isSecureContext);
    const before = await assets.countDocuments();
    const multipart = await page.evaluate(async ({ target, base64 }) => {
      const form = new FormData();
      form.append('image', new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }), 'synthetic.png');
      form.append('source', 'browser');
      try { const response = await fetch(target + '/api/v1/assets', { method: 'POST', body: form, signal: AbortSignal.timeout(10000) });
        return { readable: true, status: response.status, text: (await response.text()).slice(0, 100) }; }
      catch (error) { return { readable: false, error: error.name }; }
    }, { target, base64: bytes.toString('base64') });
    await pause(600);
    const after = await assets.countDocuments();
    report.cases.push({ name: 'cross-origin multipart', origin, secureContext, beforeAssets: before, afterAssets: after,
      effect: after - before, browserResult: multipart });
    const beforeInspections = await inspections.countDocuments();
    const json = await page.evaluate(async target => {
      try { const response = await fetch(target + '/api/v1/inspections', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'sa1-cross-origin-json' },
        body: JSON.stringify({ assetId: '0123456789abcdef01234567' }), signal: AbortSignal.timeout(10000) });
        return { readable: true, status: response.status }; } catch (error) { return { readable: false, error: error.name }; }
    }, target);
    await pause(600);
    report.cases.push({ name: 'JSON and custom header preflight', origin, browserResult: json,
      inspectionEffect: await inspections.countDocuments() - beforeInspections });
    const put = await page.evaluate(async target => {
      try { const response = await fetch(target + '/api/v1/inspections/0123456789abcdef01234567/review', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
        return { readable: true, status: response.status }; } catch (error) { return { readable: false, error: error.name }; }
    }, target);
    await pause(600);
    report.cases.push({ name: 'review PUT preflight', origin, browserResult: put });
    const get = await page.evaluate(async target => {
      try { const response = await fetch(target + '/api/v1/inspections?limit=1', { signal: AbortSignal.timeout(10000) });
        return { readable: true, status: response.status }; } catch (error) { return { readable: false, error: error.name }; }
    }, target);
    await pause(600);
    report.cases.push({ name: 'history response confidentiality', origin, browserResult: get });
    await page.evaluate(target => { const iframe = document.createElement('iframe'); iframe.src = target; iframe.id = 'audit-frame'; document.body.append(iframe); }, target);
    let rendered = false;
    try { await page.frameLocator('#audit-frame').getByRole('heading', { name: /upload|new inspection/i }).first().waitFor({ timeout: 5000 }); rendered = true; }
    catch { rendered = page.frames().some(frame => frame.url().startsWith(target)); }
    const parentRead = await page.evaluate(() => document.querySelector('#audit-frame').contentDocument !== null);
    report.cases.push({ name: 'cross-origin framing', origin, frameNavigated: rendered, parentCanReadDocument: parentRead,
      childFrameUrls: page.frames().map(frame => frame.url()).filter(url => url.startsWith(target)) });
    await context.close();
  }
  const hostResponse = await new Promise((done, reject) => {
    const req = httpRequest(new URL(target + '/api/v1/health'), { headers: { Host: 'sa1-rebinding.invalid', Origin: 'https://sa1-public.invalid' } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(5000, () => req.destroy()); req.on('error', reject); req.end();
  });
  report.cases.push({ name: 'arbitrary Host over direct HTTP', result: hostResponse,
    limit: 'No DNS changes or actual DNS rebinding attack; direct HTTP alone proves only Host acceptance' });
  assert.ok(report.cases.length === 11);
  const localUpload = report.cases.find(item => item.name === 'cross-origin multipart' && item.origin === localOrigin);
  assert.equal(localUpload.effect, phase === 'before' ? 1 : 0);
  assert.equal(localUpload.browserResult.readable, false);
  const localFrame = report.cases.find(item => item.name === 'cross-origin framing' && item.origin === localOrigin);
  assert.equal(localFrame.frameNavigated, phase === 'before');
  assert.equal(hostResponse.status, phase === 'before' ? 200 : 421);
  report.phase = phase;
  await save(`browser-${phase}.json`, report);
  console.log(JSON.stringify({ browser: report.browser, cases: report.cases, requests: report.network }));
} finally {
  await browser.close();
  await db.close();
  await new Promise(done => originServer.close(done));
}
