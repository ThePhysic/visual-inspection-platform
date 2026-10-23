import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readAllowedHosts } from '../src/admission.js';

describe('local HTTP admission before body parsing or handler effects', () => {
  const applications: ReturnType<typeof buildApp>[] = [];
  function fixture(allowedHosts?: readonly string[]) {
    const app = buildApp(allowedHosts ? { allowedHosts } : {}); applications.push(app);
    let effects = 0;
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'] as const) {
      app.route({ method, url: '/boundary', handler: () => { effects++; return { ok: true }; } });
    }
    return { app, effects: () => effects };
  }
  afterEach(async () => { await Promise.all(applications.splice(0).map(app => app.close())); });

  it.each(['127.0.0.1:3001', 'localhost:5173', '[::1]:3001', 'LOCALHOST:8080'])('admits native and matching browser callers through %s', async host => {
    const { app, effects } = fixture();
    for (const origin of [undefined, new URL(`http://${host}`).origin]) {
      const response = await app.inject({ method: 'POST', url: '/boundary', headers: { host, ...(origin ? { origin } : {}) } });
      expect(response.statusCode).toBe(200);
    }
    expect(effects()).toBe(2);
  });

  it.each(['null', '', 'garbage', 'http://127.0.0.1:8081', 'http://localhost:8080', 'https://127.0.0.1:8080',
    'http://127.0.0.1:8080/', 'http://user@127.0.0.1:8080', 'http://127.0.0.1:8080?x=1',
    'http://127.0.0.1:8080 http://evil.invalid', 'http://127.0.0.1:8080,http://evil.invalid'])('rejects unexpected browser Origin %j before parsing an invalid body', async origin => {
    const { app, effects } = fixture();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({ method, url: '/boundary', headers: { host: '127.0.0.1:8080', origin,
        'content-type': 'application/json', 'x-forwarded-host': 'evil.invalid', 'x-forwarded-proto': 'https' }, payload: '{' });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('ORIGIN_NOT_ALLOWED');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(effects()).toBe(0);
  });

  it.each(['evil.invalid', '127.1:3001', 'localhost.evil.invalid', 'localhost.', 'localhost:0',
    'localhost:65536', 'localhost:03001', 'user@localhost', 'localhost/path', 'localhost,evil.invalid'])('rejects Host %j including safe reads', async host => {
    const { app, effects } = fixture();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health', headers: { host } });
    expect(response.statusCode).toBe(421);
    expect(response.json().error.code).toBe('HOST_NOT_ALLOWED');
    expect(effects()).toBe(0);
  });

  it('admits explicit internal service hosts, ignores forwarded authority, and restricts framing on errors too', async () => {
    const { app } = fixture(readAllowedHosts('api,web,127.0.0.1,localhost,[::1]'));
    expect((await app.inject({ method: 'POST', url: '/boundary', headers: { host: 'web:8080', origin: 'http://web:8080' } })).statusCode).toBe(200);
    const denied = await app.inject({ method: 'POST', url: '/boundary', headers: { host: 'web:8080', origin: 'https://evil.invalid',
      'x-forwarded-host': 'evil.invalid', 'x-forwarded-proto': 'https' } });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['x-frame-options']).toBe('DENY');
    expect(denied.headers['content-security-policy']).toBe("frame-ancestors 'none'");
    const read = await app.inject({ url: '/api/v1/health', headers: { origin: 'null' } });
    expect(read.statusCode).toBe(200);
    expect(read.headers['access-control-allow-origin']).toBeUndefined();
  });
});
