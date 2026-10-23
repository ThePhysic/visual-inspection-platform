import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test=await loadEnvironment(); const containers=await test.verify();
const identities=[];
for(const service of ['api','worker','web','mongodb','redis']) {
  const raw=await test.compose(['exec','-T',service,'cat','/proc/1/status']);
  const container=containers.find(c=>c.Config.Labels['com.docker.compose.service']===service);
  identities.push({service,configuredUser:container.Config.User,serviceUid:raw.stdout.match(/^Uid:\s+(\d+)/m)?.[1],
    effectiveCapabilities:raw.stdout.match(/^CapEff:\s+(\w+)/m)?.[1],privileged:container.HostConfig.Privileged,
    publishedPorts:container.NetworkSettings.Ports,health:container.State.Health?.Status});
  assert.equal(container.HostConfig.Privileged,false); assert.equal(container.State.Health?.Status,'healthy');
  assert.equal(identities.at(-1).effectiveCapabilities,'0000000000000000');
}
const api=await test.compose(['exec','-T','-w','/app/apps/api','api','node','--input-type=module','-'],{input:`
  import {createRequire} from 'node:module'; import {stat} from 'node:fs/promises'; import assert from 'node:assert/strict';
  import {setTimeout as pause} from 'node:timers/promises'; import {request} from 'node:http';
  const req=createRequire(process.cwd()+'/package.json'); const mongooseReq=createRequire(req.resolve('mongoose'));
  const mongoReq=createRequire(mongooseReq.resolve('mongodb')); let encryptionAvailable=true;
  try {mongoReq.resolve('mongodb-client-encryption');} catch(error){if(error.code==='MODULE_NOT_FOUND') encryptionAvailable=false;else throw error;}
  const storage=await stat('/data/images'); assert.equal(storage.mode&0o777,0o700);
  const cases=[];
  for(const host of ['api:3001','localhost:3001','[::1]:3001','unexpected.invalid']) {
    await pause(550);
    const status=await new Promise((done,reject)=>{const r=request('http://127.0.0.1:3001/api/v1/health',{headers:{Host:host}},res=>{res.resume();res.on('end',()=>done(res.statusCode));});r.on('error',reject);r.end();});
    assert.equal(status,host==='unexpected.invalid'?421:200); cases.push({host,status});
  }
  for(const path of ['/metrics','/queue','/api/v1/metrics']) {await pause(550);const r=await fetch('http://api:3001'+path);assert.equal(r.status,404);cases.push({publicApi:path,status:r.status});}
  for(const path of ['/metrics','/queue']) {await pause(550);const r=await fetch('http://127.0.0.1:9464'+path);assert.equal(r.status,200);cases.push({privateApi:path,status:r.status});}
  console.log(JSON.stringify({cases,encryptionAvailable,mongoose:req('mongoose').version,driver:mongooseReq('mongodb/package.json').version,storage:{uid:storage.uid,gid:storage.gid,mode:(storage.mode&0o777).toString(8)}}));
`});
const observations=JSON.parse(api.stdout); assert.equal(observations.encryptionAvailable,false);
const spa=[];
for(const path of ['/metrics','/queue']) {const response=await fetch(test.CONTAINER_BASE_URL+path);const body=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.ok(!body.includes('vip_http_requests_total'));spa.push({path,status:200,content:'SPA HTML, not operator data'});}
const prior=JSON.parse(await readFile(resolve(root,'docs/security/sa-2/evidence/runtime.json'),'utf8'));
const workflow=await readFile(resolve(root,'.github/workflows/ci.yml'),'utf8');
for(const action of prior.actions) assert.ok(workflow.includes(`${action.repository}@${action.commit} # ${action.tag}`));
assert.equal((workflow.match(/persist-credentials: false/g)??[]).length,3); assert.match(workflow,/contents: read/);
const lock=await readFile(resolve(root,'pnpm-lock.yaml'));
const oldAll=JSON.parse(await readFile(resolve(root,'docs/security/sa-2/evidence/pnpm-audit-all.json'),'utf8'));
const oldProd=JSON.parse(await readFile(resolve(root,'docs/security/sa-2/evidence/pnpm-audit-prod.json'),'utf8'));
await save('runtime.json',{identities,api:observations,spa,actions:prior.actions.map(a=>({repository:a.repository,commit:a.commit,tag:a.tag,
  provenance:'Preserved SA-2 upstream tag/peeled-commit evidence; current workflow matches locally. No new external lookup.'})),
  workflowSha256:createHash('sha256').update(workflow).digest('hex'),lockSha256:createHash('sha256').update(lock).digest('hex'),
  historicalPnpmAudits:{source:'SA-2 unchanged dependency graph; not newly queried in SA-3',all:oldAll.metadata,prod:oldProd.metadata},
  hostedCIExecuted:false,noExternalLookup:true});
console.log('Runtime users, private operators, fixed Host forwarding, absent API encryption module and preserved CI pins verified.');
