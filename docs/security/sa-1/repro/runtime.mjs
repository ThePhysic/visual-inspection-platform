import { state, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const test = await loadEnvironment();
const containers = await test.verify();
const observations = [];
for (const item of containers) {
  const service = item.Config.Labels['com.docker.compose.service'];
  const status = await test.compose(['exec', '-T', service, 'sh', '-c', 'id; sed -n "/^Uid:/p; /^Gid:/p; /^CapEff:/p; /^NoNewPrivs:/p" /proc/1/status']);
  observations.push({ service, id: item.Id, image: item.Image, configuredUser: item.Config.User, actual: status.stdout,
    status: item.State.Status, health: item.State.Health?.Status, portBindings: item.HostConfig.PortBindings,
    privileged: item.HostConfig.Privileged, readonlyRootfs: item.HostConfig.ReadonlyRootfs,
    capAdd: item.HostConfig.CapAdd, capDrop: item.HostConfig.CapDrop, securityOpt: item.HostConfig.SecurityOpt,
    memoryLimit: item.HostConfig.Memory, nanoCpus: item.HostConfig.NanoCpus,
    networks: Object.keys(item.NetworkSettings.Networks), mounts: item.Mounts.map(mount => ({ type: mount.Type, name: mount.Name,
      destination: mount.Destination, writable: mount.RW })),
    healthcheckDefined: Boolean(item.Config.Healthcheck?.Test) });
}
const api = observations.find(item => item.service === 'api');
const network = JSON.parse((await run('docker', ['network', 'inspect', `${test.project}_default`])).stdout)[0];
const direct = await test.compose(['exec', '-T', 'api', 'node', '--input-type=module', '-'], { input: `
const result=[];
for(const path of ['/metrics','/queue','/api/v1/metrics']) {
const r=await fetch('http://127.0.0.1:3001'+path);result.push({path,status:r.status,contentType:r.headers.get('content-type')}); }
for(const path of ['/metrics','/queue']) { const r=await fetch('http://127.0.0.1:9464'+path);result.push({operator:path,status:r.status}); }
const fs=await import('node:fs');const s=fs.statSync('/data/images');
console.log(JSON.stringify({routes:result,imageRoot:{uid:s.uid,gid:s.gid,mode:(s.mode&511).toString(8)}}));
` });
const nginxRoutes = [];
for (const path of ['/metrics', '/queue']) {
  const r = await fetch(test.CONTAINER_BASE_URL + path);
  const body = await r.text();
  nginxRoutes.push({ path, status: r.status, contentType: r.headers.get('content-type'),
    isSpaHtml: body.includes('<!doctype html>') && body.includes('<div id="root">'),
    includesMetricSeries: /vip_http_requests_total\{/.test(body) });
}
const stats = await run('docker', ['stats', '--no-stream', '--format', '{{json .}}', api.id]);
const logs = (await test.compose(['logs', '--no-color', '--tail', '2000', 'api'])).stdout;
await writeFile(resolve(state.working, 'api-access-private.log'), logs);
const logReview = { canaryFoundInRequestUrl: logs.includes('SA1_CANARY'),
  rawBodyMarkerFound: logs.includes('SA1_SYNTHETIC_METADATA'),
  observation: 'Default HTTP request logs include caller-controlled URLs/query strings; values should not contain secrets. Synthetic canary only.' };
await save('runtime.json', { observations, network: { name: network.Name, internal: network.Internal, driver: network.Driver,
  attached: Object.values(network.Containers).map(item => item.Name) }, direct: JSON.parse(direct.stdout), nginxRoutes,
  resourceSample: JSON.parse(stats.stdout), logReview, source: JSON.parse(await readFile(resolve(state.evidence, 'source-baseline.json'), 'utf8')).commit,
  note: 'Docker stats is one post-probe observation, not peak-memory or capacity evidence. Audit overrides intentionally publish DB/Redis only on assigned loopback ports.' });
console.log(JSON.stringify({ services: observations.map(item => ({ service: item.service, configuredUser: item.configuredUser, actual: item.actual })),
  nginxRoutes, direct: JSON.parse(direct.stdout), logReview }));
