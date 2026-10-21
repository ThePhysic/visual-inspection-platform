import { readBackendConfig } from '@vip/backend';

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

  return { host, port, ...readBackendConfig(env) };
}
