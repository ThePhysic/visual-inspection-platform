import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

describe('API configuration', () => {
  it('works without an env file', () => {
    expect(readConfig({})).toMatchObject({ host: '127.0.0.1', port: 3001,
      mongodbUri: 'mongodb://127.0.0.1:27017/visual_inspection' });
    expect(readConfig({}).storageDirectory).toMatch(/[\\/]\.data[\\/]images$/);
  });

  it('uses explicit environment overrides', () => {
    expect(readConfig({ API_HOST: 'localhost', API_PORT: '4001' }))
      .toMatchObject({ host: 'localhost', port: 4001 });
  });

  it.each(['', '0', '65536', '3.5', '1e3', 'abc'])('rejects invalid port %j', (API_PORT) => {
    expect(() => readConfig({ API_PORT })).toThrow('API_PORT');
  });

  it('rejects a blank host', () => {
    expect(() => readConfig({ API_HOST: ' ' })).toThrow('API_HOST');
  });

  it.each(['', '*', 'localhost:3001', 'localhost,', 'http://localhost', '127.1', 'user@localhost'])('rejects invalid allowed hosts %j without echoing input', API_ALLOWED_HOSTS => {
    expect(() => readConfig({ API_ALLOWED_HOSTS })).toThrow(/^API_ALLOWED_HOSTS must be/);
  });

  it('supports explicit private Compose service aliases without changing listen configuration', () => {
    expect(readConfig({ API_ALLOWED_HOSTS: 'localhost,127.0.0.1,[::1],api,web' }).allowedHosts)
      .toEqual(['localhost', '127.0.0.1', '[::1]', 'api', 'web']);
  });

  it('defaults to two upload slots and permits reducing to one', () => {
    expect(readConfig({}).uploadConcurrency).toBe(2);
    expect(readConfig({ API_UPLOAD_CONCURRENCY: '1' }).uploadConcurrency).toBe(1);
  });

  it.each(['0', '3', '', '1.0', '-1', '100'])('rejects unsafe upload concurrency %j', API_UPLOAD_CONCURRENCY => {
    expect(() => readConfig({ API_UPLOAD_CONCURRENCY })).toThrow('API_UPLOAD_CONCURRENCY');
  });

  it('rejects invalid database and storage configuration without echoing secrets', () => {
    expect(() => readConfig({ MONGODB_URI: 'secret' })).toThrow('MONGODB_URI must be a MongoDB connection URI.');
    expect(() => readConfig({ ASSET_STORAGE_DIR: ' ' })).toThrow('ASSET_STORAGE_DIR');
  });
});
