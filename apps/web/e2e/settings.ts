import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const envFile = resolve(workspaceRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
// Playwright passes this run identity to its workers and managed servers.
process.env.VIP_BROWSER_RUN_ID ??= randomUUID().replaceAll('-', '');
const runId = process.env.VIP_BROWSER_RUN_ID;
if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid browser-test run identity.');
export const databaseName = `vip_browser_test_${runId}`;
const mongo = new URL(process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017');
mongo.pathname = `/${databaseName}`;
export const mongodbUri = mongo.href;
const redis = new URL(process.env.E2E_REDIS_URL ?? process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379');
if (!process.env.E2E_REDIS_URL) redis.pathname = '/15';
export const redisUrl = redis.href;
export const storageDirectory = resolve(workspaceRoot, '.data/browser-tests', runId);
export const apiPort = '3003';
export const webPort = '4174';
