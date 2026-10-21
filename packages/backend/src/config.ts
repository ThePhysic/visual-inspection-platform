import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function readBackendConfig(env: NodeJS.ProcessEnv) {
  const mongodbUri = env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/visual_inspection';
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/.test(mongodbUri)) throw new Error('MONGODB_URI must be a MongoDB connection URI.');
  if (env.ASSET_STORAGE_DIR !== undefined && !env.ASSET_STORAGE_DIR.trim()) throw new Error('ASSET_STORAGE_DIR must not be blank.');
  const redisUrl = env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  try {
    const url = new URL(redisUrl);
    if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname
      || url.search || url.hash || (url.pathname && !/^\/\d*$/.test(url.pathname))) throw new Error();
  } catch { throw new Error('REDIS_URL must be a Redis connection URL.'); }
  return { mongodbUri, redisUrl, storageDirectory: resolve(workspaceRoot, env.ASSET_STORAGE_DIR ?? '.data/images') };
}
