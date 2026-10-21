import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function readConfig(env: NodeJS.ProcessEnv) {
  const host = env.API_HOST ?? '127.0.0.1';
  const rawPort = env.API_PORT ?? '3001';
  const port = Number(rawPort);

  if (!host.trim()) {
    throw new Error('API_HOST must be a nonempty host name or IP address.');
  }

  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer from 1 to 65535.');
  }

  const mongodbUri = env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/visual_inspection';
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/.test(mongodbUri)) {
    throw new Error('MONGODB_URI must be a MongoDB connection URI.');
  }
  if (env.ASSET_STORAGE_DIR !== undefined && !env.ASSET_STORAGE_DIR.trim()) {
    throw new Error('ASSET_STORAGE_DIR must not be blank.');
  }
  const storageDirectory = resolve(workspaceRoot, env.ASSET_STORAGE_DIR ?? '.data/images');

  return { host, port, mongodbUri, storageDirectory };
}
