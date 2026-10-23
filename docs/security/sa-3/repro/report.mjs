import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { root,state,run,save } from './support.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const baseline=await json('docs/security/sa-3/evidence/baseline.json');
const old=await json('docs/security/sa-1/findings.json');
const sa2=await json('docs/security/sa-2/findings.json');
const bytes=await readFile(resolve(state.working,'reliability.log'));
const log=stripVTControlCharacters(bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8'));
assert.match(log,/Tests\s+143 passed \(143\)/); assert.match(log,/18 passed/); assert.match(log,/2 passed/);
assert.match(log,/Container reliability passed:/);
const project=log.match(/Isolated reliability environment: (vip-reliability-[a-f0-9]{32})/)[1];
for(const kind of ['container','volume','network']) {
  const args=kind==='container'?['ps','-aq']:[kind,'ls','-q'];
  assert.equal((await run('docker',[...args,'--filter',`label=com.docker.compose.project=${project}`])).stdout.trim(),'');
}
await save('regressions.json',{command:'pnpm test:reliability --native --browser --ci-mongodb',exitCode:0,project,
  integration:{discovered:143,passed:143,failed:0,skipped:0,deselected:0},nativeBrowser:{passed:18,failed:0},containerBrowser:{passed:2,failed:0},
  phases:log.split('\n').map(s=>s.trim()).filter(line=>/^(Container smoke|Worker runtime check|Reliability phase|Container reliability|\{"version":)/.test(line)),
  fourNamedVolumesRemoved:true,configdbCleanupObserved:/Volume .*_mongodb-config-data Removed/.test(log),
  noAppBehaviorChanges:true,hostedCIExecuted:false,
  failuresAndCorrections:[{scope:'audit-owned setup script',check:'first lint',error:'unused root import',correction:'removed import; final lint recorded separately'},
    {scope:'read-only native advisory metadata experiment',error:'unstructured extraction could not retrieve known records',correction:'discarded unsupported result; select exact structured scanner records; missing native coverage remains blocked'},
    {scope:'cleanup preservation metadata',error:'built-in bridge ID changed',correction:'no network change attempted; container/volume/other-network identities verified separately; unexplained drift remains open'}],
});
const map={
  'SA1-01':['unresolved candidate','Image OS and bundled/native advisories remain incompletely reconciled; four exact image inventories stable on same feed; Mongo OS catalog recognized','supply-chain.md'],
  'SA1-02':['verified hardening','Cross-loopback upload property is now rejected without asset effects; no public exploitation reclassification','browser-resources.md'],
  'SA1-03':['accepted limitation','One/two slots and input bounds verified; cumulative retention quota explicitly deferred','browser-resources.md'],
  'SA1-04':['verified hardening','Host/port forwarding and frame denial verified; complete DNS rebinding and other browsers untested','browser-resources.md'],
  'SA1-05':['verified hardening','Private no-store image content and query-free normal access logs verified; no authentication or retrospective purge','browser-resources.md'],
  'SA1-06':['verified hardening','Action commit pins/checkout handling and absent runtime npm verified against accepted source; broader production controls deferred','operations.md'],
  'SA1-07':['verified existing control','Full API contract/query/projection regressions passed','validation.md'],
  'SA1-08':['verified existing control','Canonicalization, storage paths, inclusive limits, failures and interrupted cleanup regressions passed','validation.md'],
  'SA1-09':['verified existing control','Durable admission, idempotency, fenced attempts, immutable predictions and review concurrency regressions passed','validation.md'],
  'SA1-10':['verified existing control','Non-root effective service users, private operators and read-only worker image mount verified','operations.md'],
  'SA1-11':['false positive','Dockerfile-only missing-healthcheck finding remains contextual; all five Compose services had healthy configured checks','supply-chain.md'],
  'SA1-12':['false positive','nginx operator-looking URLs are SPA HTML; actual public API operator URLs remain 404','operations.md'],
  'SA1-13':['false positive','Prior Debian zlib1g MiniZip package/CVE-specific disposition retained; no global zlib suppression','supply-chain.md'],
  'SA1-14':['blocked assessment','Complete Mongo native/bundled coverage, vendor discrepancies, full history/hosted settings, other browser/public/DNS scenarios remain open','supply-chain.md'],
};
const items=old.items.map(item=>({id:item.id,priority:item.priority,title:item.title,originalClassification:item.classification,
  sa2Disposition:sa2.items.find(previous=>previous.id===item.id).disposition,classification:map[item.id][0],
  finalDisposition:map[item.id][1],localSeverity:item.localSeverity??'No new application severity assigned',
  publicSeverity:'Requires separately assessed deployment/exposure and feature reachability; not inherited from vendor CVSS',
  owner:'Repository owner',nextAction:map[item.id][0]==='unresolved candidate'||item.id==='SA1-14'?'Authorize artifact/vendor/feature-specific follow-up; preserve gap':'Retain selected controls and stated local assumptions',
  evidence:[map[item.id][2],'evidence/regressions.json'],originalRegister:'../sa-1/findings.json'}));
items.push(
  {id:'SA3-H01',classification:'verified hardening',title:'Disposable configdb ownership and cleanup corrected',localSeverity:'audit-harness safety improvement, not application vulnerability',
    evidence:['evidence/isolation.json','evidence/preservation.json','evidence/regressions.json'],owner:'Repository owner',nextAction:'Keep exact mount/owner guards for future isolated runs'},
  {id:'SA3-S01',classification:'unresolved candidate',title:'mongosh embedded libmongocrypt 1.20.0 needs advisory applicability reconciliation',localSeverity:'unassigned; no application exploit demonstrated',
    prerequisites:'Affected KMS/encryption feature and attacker-controlled provider/key-vault inputs; installed component is in mongosh, not API runtime encryption module',
    evidence:['evidence/components.json','evidence/native-advisories.json','evidence/runtime.json'],owner:'Repository owner',nextAction:'Verify vendor affected range and precise embedded build/feature; no automatic upgrade'},
  {id:'SA3-L01',classification:'accepted operational limitation',title:'Pre-existing unowned anonymous volume remains excluded',evidence:['evidence/preservation.json'],
    owner:'Host operator',nextAction:'Do not mount/delete without separate ownership evidence and authorization'},
  {id:'SA3-O01',classification:'unresolved operational observation',title:'Built-in Docker bridge identity changed during the run',localSeverity:'unassigned; causality/data impact not established',
    evidence:['evidence/preservation.json'],owner:'Host operator',nextAction:'If needed, separately review Docker Desktop/engine event history; no speculative restore or network change'},
);
await save('../findings.json',{candidateCommit:baseline.commit,model:'trusted single-user local demonstration with synthetic data',confirmedApplicationVulnerabilities:0,
  overall:'Authorized SA-3 validation/reporting complete; final security/dependency assurance PARTIALLY BLOCKED, not clean or certified',
  checkpoints:{'SA-3A':'PARTIALLY BLOCKED: bounded reconciliation complete, native/vendor/reachability coverage remains unresolved',
    'SA-3B':'PARTIALLY BLOCKED for full operational preservation assurance; bounded regressions and owned cleanup PASS; unexplained built-in bridge drift remains open',
    'SA-3C':'PASS: scoped report, risk ownership, evidence and portfolio package complete'},items});
const preserved=baseline.preservedPriorSecurityFiles.filter(file=>file.path!=='docs/security/README.md');
for(const file of preserved) assert.equal(sha(await readFile(resolve(root,file.path))),file.sha256,'Prior assessment package changed');
const allowed=new Set(['infra/docker/disposable.mjs','infra/benchmark/core.test.mjs','docs/reliability.md','docs/security/README.md']);
for(const file of baseline.files.filter(f=>!allowed.has(f.path))) assert.equal(sha(await readFile(resolve(root,file.path))),file.sha256,`Frozen source changed: ${file.path}`);
assert.equal(sha((await run('git',['ls-files','--stage','-z'])).stdout),baseline.indexSha256);
async function allFiles(directory) {
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {const path=resolve(directory,entry.name);
    if(entry.isDirectory())files.push(...await allFiles(path));else if(entry.isFile())files.push(relative(root,path).replaceAll('\\','/'));else throw new Error('Unexpected report entry');}
  return files;
}
const changed=(await run('git',['diff','--name-only'])).stdout.trim().split('\n').filter(Boolean);
assert.ok(changed.every(path=>allowed.has(path)),'Unexpected tracked change');
const paths=[...new Set([...changed,...await allFiles(resolve(root,'docs/security/sa-3')),'docs/security/sa-3/evidence/file-inventory.json'])].sort();
const inventory=[];
for(const path of paths) {
  const bytes=path.endsWith('/evidence/file-inventory.json')?null:await readFile(resolve(root,path));
  inventory.push({path,kind:changed.includes(path)?'modified':'created',sha256:bytes?sha(bytes):'(self not hashed)',bytes:bytes?.length,
    purpose:path.startsWith('infra/')?'audit-harness correction/regression':path.includes('/evidence/')?'sanitized validation/assessment evidence':path.includes('/repro/')?'audit-owned reproducibility script':'documentation/portfolio'});
}
await save('file-inventory.json',{candidateCommit:baseline.commit,files:inventory,applicationAndRuntimeConfigurationUnchanged:true,
  immutablePriorAssessmentFilesVerified:preserved.length,indexUnchanged:true,
  preservedSourceBoundary:'All baseline files except the two authorized harness files and two documentation indexes match frozen hashes. No source/dependency/schema/runtime/CI remediation.',
  privateArtifacts:`.tools/sa3/${state.token}: filtered read-only snapshot, scanner/build/runner logs and full reports; temporary image archives and generated project override removed; unique built tags/cache retained`,
});
console.log(JSON.stringify({priorEvidencePreserved:preserved.length,inventory:inventory.length,integrationPassed:143,browserPassed:[18,2]}));
