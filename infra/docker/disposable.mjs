import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export function pnpmCommand(args, options) {
  if (process.env.npm_execpath) return command(process.execPath, [process.env.npm_execpath, ...args], options);
  if (process.platform === 'win32') throw new Error('Run this script through pnpm on Windows.');
  return command('pnpm', args, options);
}
export function command(executable, args, { input, env = {}, echo = false, timeout = 180_000, onOutput } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(executable, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let errors = '';
    child.stdout.on('data', value => { output += value; if (echo) process.stdout.write(value); onOutput?.(output); });
    child.stderr.on('data', value => { errors += value; if (echo) process.stderr.write(value); });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${executable} timed out`)); }, timeout);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer);
      if (code === 0) done(output.trim());
      else reject(new Error(`${executable} ${args.join(' ')} exited ${code}\n${output.slice(-8000)}\n${errors.slice(-8000)}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.on('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}

export function assertOwnedBuildImage(image, project, owner) {
  assert.equal(project, `vip-reliability-${owner}`);
  assert.match(owner, /^[a-f0-9]{32}$/);
  assert.equal(image.Config.Labels['io.vip.disposable-owner'], owner, 'Foreign image: refusing cleanup');
  assert.ok(image.RepoTags?.length);
  for (const tag of image.RepoTags) assert.ok(['api', 'worker', 'web'].some(service => tag === `${project}-${service}:latest`), 'Unexpected image tag');
}

// Include every data mount, including the official Mongo image's configdb
// volume. An anonymous volume would survive a down/up persistence check without
// a stable identity and cannot be safely attributed afterward.
export function assertOwnedDataMounts(container, project) {
  assert.match(project, /^vip-reliability-[a-f0-9]{32}$/);
  const service = container.Config.Labels['com.docker.compose.service'];
  const expected = {
    web: {}, api: { '/data/images': ['images', true] }, worker: { '/data/images': ['images', false] },
    mongodb: { '/data/db': ['mongodb-data', true], '/data/configdb': ['mongodb-config-data', true] },
    redis: { '/data': ['redis-data', true] },
  }[service];
  assert.ok(expected, 'Unknown disposable service');
  assert.equal(container.Mounts.length, Object.keys(expected).length, 'Unexpected or missing mount: refusing disruption/cleanup');
  for (const [destination, [name, writable]] of Object.entries(expected)) {
    const matches = container.Mounts.filter(mount => mount.Destination === destination);
    assert.equal(matches.length, 1, 'Expected exactly one owned data mount');
    const [mount] = matches;
    assert.equal(mount.Type, 'volume');
    assert.equal(mount.Name, `${project}_${name}`, 'Foreign or anonymous data mount');
    assert.equal(mount.RW, writable, 'Unexpected data mount permissions');
  }
}

export async function disposableEnvironment({ ciMongoCompatibility = false, cleanupBuiltImages = false } = {}) {
  const owner = randomUUID().replaceAll('-', '');
  const project = `vip-reliability-${owner}`;
  const webPort = await freePort(); const mongoPort = await freePort(); const redisPort = await freePort();
  assert.equal(new Set([webPort, mongoPort, redisPort]).size, 3);
  const label = 'io.vip.disposable-owner';
  const file = resolve(root, '.tools', `${project}.compose.json`);
  const services = ['web', 'api', 'worker', 'mongodb', 'redis'];
  // Refuse even an astronomically unlikely project collision before mutation.
  for (const kind of ['container', 'volume', 'network']) {
    const args = kind === 'container' ? ['ps', '-aq'] : [kind, 'ls', '-q'];
    assert.equal(await command('docker', [...args, '--filter', `label=com.docker.compose.project=${project}`]), '');
  }
  if (cleanupBuiltImages) assert.equal(await command('docker', ['image', 'ls', '-q', '--filter', `reference=${project}-*`]), '');
  await mkdir(resolve(root, '.tools'), { recursive: true });
  const override = { services: Object.fromEntries(services.map(service => [service, { labels: { [label]: owner } }])),
    volumes: Object.fromEntries(['images', 'mongodb-data', 'mongodb-config-data', 'redis-data'].map(name => [name, { labels: { [label]: owner } }])),
    networks: { default: { labels: { [label]: owner } } } };
  if (cleanupBuiltImages) {
    // Unique labels prove ownership of benchmark image tags, including partial builds.
    for (const service of ['api', 'worker', 'web']) override.services[service].build = { labels: { [label]: owner } };
  }
  for (const service of ['api', 'worker']) override.services[service].environment = {
    MONGODB_URI: `mongodb://mongodb:27017/vip_reliability_${owner}`,
  };
  override.services.mongodb.ports = [`127.0.0.1:${mongoPort}:27017`];
  override.services.mongodb.volumes = ['mongodb-config-data:/data/configdb'];
  override.services.redis.ports = [`127.0.0.1:${redisPort}:6379`];
  await writeFile(file, JSON.stringify(override), { flag: 'wx' });
  const composeArgs = ['compose', '-p', project, '-f', 'compose.yaml',
    ...(ciMongoCompatibility ? ['-f', 'compose.ci.yaml'] : []), '-f', file];
  const compose = (args, options = {}) => command('docker', [...composeArgs, ...args], {
    ...options, env: { ...options.env, WEB_PORT: String(webPort) },
  });
  async function verifyOwnership() {
    assert.match(project, /^vip-reliability-[a-f0-9]{32}$/);
    const ids = (await command('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`])).split(/\s+/).filter(Boolean);
    if (ids.length) {
      const containers = JSON.parse(await command('docker', ['inspect', ...ids]));
      for (const container of containers) {
        assert.equal(container.Config.Labels[label], owner, 'Foreign container: refusing disruption/cleanup');
        assert.equal(container.Config.Labels['com.docker.compose.project'], project);
        assert.ok(services.includes(container.Config.Labels['com.docker.compose.service']));
        assertOwnedDataMounts(container, project);
      }
    }
    for (const kind of ['volume', 'network']) {
      const names = (await command('docker', [kind, 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`])).split(/\s+/).filter(Boolean);
      if (names.length) for (const resource of JSON.parse(await command('docker', [kind, 'inspect', ...names]))) {
        assert.equal(resource.Labels[label], owner, `Foreign ${kind}: refusing cleanup`);
        assert.equal(resource.Labels['com.docker.compose.project'], project);
        assert.ok(kind === 'network' ? resource.Name === `${project}_default`
          : ['images', 'mongodb-data', 'mongodb-config-data', 'redis-data'].some(name => resource.Name === `${project}_${name}`),
        'Unexpected labeled resource name: refusing cleanup');
      }
    }
    console.log(`Verified disposable ownership: ${project}`);
  }
  const disruptive = async args => { await verifyOwnership(); return compose(args, { echo: true }); };
  async function inside(script, phase) {
    return compose(['exec', '-T', '-w', '/app/apps/api', 'api', 'node', '--input-type=module', '-', phase], {
      input: await readFile(resolve(root, 'infra/docker', script), 'utf8'), echo: true,
    });
  }
  async function verifyMongoCompatibility() {
    if (!ciMongoCompatibility) return;
    await compose(['exec', '-T', 'mongodb', 'mongosh', '--quiet', '--eval',
      'const s=db.serverStatus(); print(JSON.stringify({version:s.version,usingPerCPUCaches:s.tcmalloc?.usingPerCPUCaches})); if(s.version!=="8.0.34" || s.tcmalloc?.usingPerCPUCaches!==false) { print("CI MongoDB allocator compatibility assertion failed"); quit(1); }'], { echo: true });
  }
  return { project, compose, verifyOwnership, verifyMongoCompatibility, disruptive, inside,
    environment: { MONGODB_TEST_URI: `mongodb://127.0.0.1:${mongoPort}`, REDIS_TEST_URL: `redis://127.0.0.1:${redisPort}`,
      CONTAINER_BASE_URL: `http://127.0.0.1:${webPort}` },
    async cleanup() {
      // Always prove ownership again, including after Compose down/up. Never
      // interpolate a user project name or remove another project's volumes.
      const images = cleanupBuiltImages ? (await command('docker', ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}',
        '--filter', `reference=${project}-*`])).split(/\s+/).filter(Boolean) : [];
      for (const name of images) {
        const [image] = JSON.parse(await command('docker', ['image', 'inspect', name]));
        assertOwnedBuildImage(image, project, owner);
      }
      await disruptive(['down', '--volumes', '--remove-orphans']);
      if (images.length) await command('docker', ['image', 'rm', ...images]); // No force/prune; layers may remain shared/cache-owned.
      await unlink(file);
    } };
}
