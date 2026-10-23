import { readBackendConfig } from '@vip/backend';
import { readAllowedHosts } from './admission.js';

export function readConfig(env: NodeJS.ProcessEnv) {
  const host = env.API_HOST ?? '127.0.0.1';
  const rawPort = env.API_PORT ?? '3001';
  const port = Number(rawPort);
  const rawUploads = env.API_UPLOAD_CONCURRENCY ?? '2';
  if (rawUploads !== '1' && rawUploads !== '2') {
    throw new Error('API_UPLOAD_CONCURRENCY must be 1 or 2.');
  }
  const uploadConcurrency: 1 | 2 = rawUploads === '1' ? 1 : 2;

  if (!host.trim()) {
    throw new Error('API_HOST must be a nonempty host name or IP address.');
  }

  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer from 1 to 65535.');
  }

  return { host, port, uploadConcurrency, allowedHosts: readAllowedHosts(env.API_ALLOWED_HOSTS), ...readBackendConfig(env) };
}
