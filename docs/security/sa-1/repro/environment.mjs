import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, state, run } from './support.mjs';

export async function loadEnvironment() {
  const env = JSON.parse(await readFile(resolve(state.working, 'environment.json'), 'utf8'));
  assert.match(env.project, /^vip-reliability-[a-f0-9]{32}$/);
  assert.ok(env.project.endsWith(env.owner));
  const override = resolve(root, '.tools', `${env.project}.compose.json`);
  const args = ['compose', '--env-file', '.env.example', '-p', env.project, '-f', 'compose.yaml', '-f', 'compose.ci.yaml', '-f', override];
  const compose = async (params, options = {}) => run('docker', [...args, ...params], {
    ...options, env: { ...options.env, WEB_PORT: String(new URL(env.CONTAINER_BASE_URL).port) },
  });
  async function verify() {
    const ids = (await run('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${env.project}`])).stdout.trim().split(/\s+/).filter(Boolean);
    assert.equal(ids.length, 5, 'Expected the five audit-owned service containers');
    const containers = JSON.parse((await run('docker', ['inspect', ...ids])).stdout);
    for (const container of containers) {
      assert.equal(container.Config.Labels['io.vip.disposable-owner'], env.owner);
      assert.ok(['api', 'worker', 'web', 'mongodb', 'redis'].includes(container.Config.Labels['com.docker.compose.service']));
      for (const mount of container.Mounts.filter(item => ['/data/images', '/data/db', '/data'].includes(item.Destination))) {
        assert.equal(mount.Type, 'volume');
        assert.ok(['images', 'mongodb-data', 'redis-data'].some(name => mount.Name === `${env.project}_${name}`));
      }
    }
    for (const kind of ['volume', 'network']) {
      const names = (await run('docker', [kind, 'ls', '-q', '--filter', `label=com.docker.compose.project=${env.project}`])).stdout.trim().split(/\s+/).filter(Boolean);
      assert.equal(names.length, kind === 'volume' ? 3 : 1);
      for (const item of JSON.parse((await run('docker', [kind, 'inspect', ...names])).stdout)) {
        assert.equal(item.Labels['io.vip.disposable-owner'], env.owner);
      }
    }
    return containers;
  }
  return { ...env, compose, verify };
}
