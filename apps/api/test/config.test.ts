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

  it('rejects invalid database and storage configuration without echoing secrets', () => {
    expect(() => readConfig({ MONGODB_URI: 'secret' })).toThrow('MONGODB_URI must be a MongoDB connection URI.');
    expect(() => readConfig({ ASSET_STORAGE_DIR: ' ' })).toThrow('ASSET_STORAGE_DIR');
  });
});
