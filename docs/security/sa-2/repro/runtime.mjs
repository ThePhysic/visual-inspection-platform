import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, run, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment(); const containers = await test.verify();
const runtime = [];
for (const service of ['api', 'worker']) {
  const result = await test.compose(['exec', '-T', '-w', `/app/apps/${service}`, service, 'node', '--input-type=module', '-'], { input: `
    import {existsSync,readFileSync} from 'node:fs';
    import {createRequire} from 'node:module';
    const req=createRequire(process.cwd()+'/package.json');
    const sharp= ${service === 'api' ? "req('sharp')" : 'null'};
    console.log(JSON.stringify({uid:process.getuid(),node:process.version,versions:process.versions,
      npm:existsSync('/usr/local/bin/npm'),npx:existsSync('/usr/local/bin/npx'),npmTree:existsSync('/usr/local/lib/node_modules/npm'),
      sharp:sharp?.versions,processCapabilities:readFileSync('/proc/self/status','utf8').match(/^CapEff:\\s*(.*)$/m)?.[1]}));
  ` });
  const observation = JSON.parse(result.stdout);
  assert.equal(observation.uid, 1000); assert.equal(observation.npm, false); assert.equal(observation.npx, false); assert.equal(observation.npmTree, false);
  assert.equal(observation.processCapabilities, '0000000000000000');
  runtime.push({ service, ...observation });
}
const direct = await test.compose(['exec', '-T', '-w', '/app/apps/api', 'api', 'node', '--input-type=module', '-'], { input: `
  import assert from 'node:assert/strict'; import {request} from 'node:http';
  const cases=[];
  for(const [host,origin,status] of [['api:3001',undefined,200],['localhost:3001',undefined,200],['[::1]:3001',undefined,200],['invalid.example',undefined,421]]) {
    const result=await new Promise((done,reject)=>{const req=request('http://127.0.0.1:3001/api/v1/health',{headers:{Host:host,...(origin?{Origin:origin}:{})}},res=>{res.resume();res.on('end',()=>done(res.statusCode));});req.on('error',reject);req.end();});
    assert.equal(result,status); cases.push({host,status:result});
  }
  for(const origin of ['null','malformed','http://unrelated.invalid','https://api:3001']){
    const response=await fetch('http://api:3001/api/v1/assets',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{'});
    assert.equal(response.status,403); cases.push({origin,status:response.status});
  }
  console.log(JSON.stringify(cases));
` });
const linked = {};
for (const [service, binary] of [['api', '/usr/local/bin/node'], ['mongodb', '/usr/bin/mongod'], ['web', '/usr/sbin/nginx']]) {
  linked[service] = (await test.compose(['exec', '-T', service, 'ldd', binary])).stdout.trim().split('\n');
}
const perl = (await test.compose(['exec', '-T', 'redis', 'perl', '-V:archname', '-V:ivsize', '-V:ptrsize'])).stdout;
const mongosh = (await test.compose(['exec', '-T', 'mongodb', 'mongosh', '--version'])).stdout.trim();
const pins = [];
for (const [repository, tag, expected] of [['actions/checkout','v7.0.1','3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/setup-node','v7.1.0','949feb2413d6458794dcd2491c4babbbce0c15c1'],['pnpm/action-setup','v6.1.0','ea17c68df8912ef543352723c149a84f56e3d413']]) {
  const output = (await run('git', ['ls-remote', `https://github.com/${repository}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`])).stdout.trim();
  const lines = output.split('\n');
  const commit = (lines.find(line => line.endsWith('^{}')) ?? lines[0]).split('\t')[0];
  assert.equal(commit, expected, 'Use the peeled commit for an annotated tag');
  const workflow = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  assert.ok(workflow.includes(`${repository}@${expected} # ${tag}`));
  pins.push({ repository, tag, commit: expected, upstream: `https://github.com/${repository}`, verification: output });
}
await save('runtime.json', { runtime, directHttp: JSON.parse(direct.stdout), linked, redisPerlBuild: perl, mongoshVersion: mongosh,
  actions: pins, containers: containers.map(c => ({ service: c.Config.Labels['com.docker.compose.service'], user: c.Config.User,
    privileged: c.HostConfig.Privileged, ports: c.NetworkSettings.Ports,
    imageMount: c.Mounts.filter(m => m.Destination === '/data/images').map(m => ({ name: m.Name, writable: m.RW })) })),
  limitation: 'Read-only linkage/architecture checks establish prerequisites, not every native function call. No exploit, hosted CI run or credential validation.',
});
console.log('Runtime tooling removal, direct HTTP boundaries and immutable action identities verified.');
