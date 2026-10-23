import type { FastifyRequest } from 'fastify';
import { ApiError } from './errors.js';

export const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'] as const;

function authority(value: string | undefined) {
  if (!value) return undefined;
  const match = /^(\[[a-f0-9:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i.exec(value);
  if (!match) return undefined;
  const hostname = match[1]!.toLowerCase();
  const port = match[2];
  if (port && (Number(port) < 1 || Number(port) > 65535 || String(Number(port)) !== port)) return undefined;
  try {
    const parsed = new URL(`http://${value}`);
    if (parsed.hostname !== hostname) return undefined;
    return { hostname, host: value.toLowerCase() };
  } catch { return undefined; }
}

export function readAllowedHosts(value: string | undefined): readonly string[] {
  if (value === undefined) return LOCAL_HOSTS;
  const hosts = value.split(',').map(host => host.trim().toLowerCase());
  if (!hosts.length || hosts.some(host => authority(host)?.hostname !== host)) {
    throw new Error('API_ALLOWED_HOSTS must be comma-separated host names or bracketed IPv6 addresses without ports.');
  }
  return [...new Set(hosts)];
}

// Browser admission is defense in depth for a trusted local application. Native
// callers can forge these headers; they are not an authentication boundary.
export function admitRequest(request: FastifyRequest, allowedHosts: readonly string[]) {
  const host = authority(request.headers.host);
  if (!host || !allowedHosts.includes(host.hostname)) {
    throw new ApiError(421, 'HOST_NOT_ALLOWED', 'Request host is not allowed.');
  }
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.origin;
  if (origin === undefined) return; // Intended native clients and health tooling.
  let parsed: URL;
  try { parsed = new URL(origin); } catch {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin
    || parsed.origin !== new URL(`${request.protocol}://${host.host}`).origin) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.');
  }
}
