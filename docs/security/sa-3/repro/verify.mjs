import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,readdir,access } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { root,state,run,save } from './support.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const baseline=JSON.parse(await readFile(resolve(state.evidence,'baseline.json'),'utf8'));
const inventory=JSON.parse(await readFile(resolve(state.evidence,'file-inventory.json'),'utf8'));
const allowed=new Set(['infra/docker/disposable.mjs','infra/benchmark/core.test.mjs','docs/reliability.md','docs/security/README.md']);
for(const file of baseline.files.filter(file=>!allowed.has(file.path)))assert.equal(hash(await readFile(resolve(root,file.path))),file.sha256);
assert.equal(hash((await run('git',['ls-files','--stage','-z'])).stdout),baseline.indexSha256);
await run('git',['diff','--check']);
for(const file of inventory.files.filter(file=>file.sha256!=='(self not hashed)'))assert.equal(hash(await readFile(resolve(root,file.path))),file.sha256,file.path);
const results=JSON.parse(await readFile(resolve(state.evidence,'workspace-validation-final.json'),'utf8'));
assert.equal(results.results.length,4);assert.ok(results.results.every(result=>result.code===0));
const preservation=JSON.parse(await readFile(resolve(state.evidence,'preservation.json'),'utf8'));
assert.equal(preservation.namedVolumesRemoved,4);assert.equal(preservation.preExistingContainerStatesAndVolumeNamesEqual,true);
assert.equal(preservation.previousUnownedVolume.directlyInspectedMountedOrRemoved,false);
let links=0;let markdown=0;let json=0;
async function visit(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(entry.name==='verification.json')continue;
    const file=resolve(directory,entry.name);
    if(entry.isDirectory()){await visit(file);continue;}
    const content=await readFile(file,'utf8');
    if(entry.name.endsWith('.json')){JSON.parse(content);json++;}
    if(entry.name.endsWith('.md')) {
      markdown++;assert.ok(!/C:[\\/]Users[\\/]ridle/i.test(content));
      for(const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const target=match[1].split('#')[0];if(!target||/^[a-z]+:\/\//i.test(target))continue;
        await access(resolve(dirname(file),target));links++;
      }
    }
  }
}
await visit(resolve(root,'docs/security/sa-3'));
const prior=baseline.preservedPriorSecurityFiles.filter(file=>file.path!=='docs/security/README.md');
await save('verification.json',{candidateCommit:baseline.commit,applicationDependencyRuntimeConfigurationUnchanged:true,
  priorSecurityPackageFilesUnchanged:prior.length,indexUnchanged:true,whitespace:'passed',inventoryHashes:'passed',
  markdownFilesChecked:markdown,localLinksChecked:links,jsonFilesParsed:json,workspaceGates:results.results.map(r=>({command:r.command,code:r.code})),
  ownedResourceCleanup:'passed, four named volumes per project; no new anonymous volume',
  operationalGap:'Built-in bridge ID drift remains unexplained; not counted as a passing full-network-equality check',
  finalAssurance:'PARTIALLY BLOCKED native/vendor/reachability and operational assurance; report and bounded regressions complete',
});
console.log(JSON.stringify({priorPackagesPreserved:prior.length,markdown,json,localLinks:links,gates:4}));
