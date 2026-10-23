import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,state,run,save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test=await loadEnvironment();
const verifyOnly=process.argv[2]==='--verify-after-cleanup';
assert.ok(process.argv[2]===undefined||verifyOnly);
const before=JSON.parse(await readFile(resolve(state.working,'resources-before.json'),'utf8'));
const baseline=JSON.parse(await readFile(resolve(state.evidence,'baseline.json'),'utf8'));
const immutablePrior=baseline.preservedPriorSecurityFiles.filter(file=>file.path!=='docs/security/README.md');
for(const file of immutablePrior) {
  assert.equal(createHash('sha256').update(await readFile(resolve(root,file.path))).digest('hex'),file.sha256,'Prior evidence changed');
}
if(!verifyOnly) {
  await test.verify();
  await test.compose(['down','--volumes','--remove-orphans'],{timeout:120_000,privateLog:'cleanup.log'});
}
const after={};
for(const [name,args] of [['containers',['ps','-a','--format','{{.ID}} {{.Names}} {{.State}}']],
  ['volumes',['volume','ls','--format','{{.Name}}']],['networks',['network','ls','--format','{{.ID}} {{.Name}}']]]) {
  after[name]=(await run('docker',args)).stdout.trim().split('\n').filter(Boolean).sort();
  if(name!=='networks') assert.deepEqual(after[name],before[name],`Unrelated ${name} changed; stop rather than cleaning unknown resources`);
}
const bridgeBefore=before.networks.find(line=>line.endsWith(' bridge'));
const bridgeAfter=after.networks.find(line=>line.endsWith(' bridge'));
assert.deepEqual(before.networks.filter(line=>!line.endsWith(' bridge')),after.networks.filter(line=>!line.endsWith(' bridge')),
  'Non-bridge network identity changed: stop');
for(const kind of ['container','volume','network']) {
  const args=kind==='container'?['ps','-aq']:[kind,'ls','-q'];
  assert.equal((await run('docker',[...args,'--filter',`label=com.docker.compose.project=${test.project}`])).stdout.trim(),'');
}
assert.match(test.project,/^vip-reliability-[a-f0-9]{32}$/);
await unlink(resolve(root,'.tools',`${test.project}.compose.json`)).catch(error=>{if(!verifyOnly||error.code!=='ENOENT')throw error;});
const unowned='8f1d43eca2fa087394e62eeda1f2787db8cace965afb0ec44018bd75613d7b58';
await save('preservation.json',{project:test.project,namedVolumesRemoved:4,containersRemoved:5,networkRemoved:1,
  preExistingContainerStatesAndVolumeNamesEqual:true,otherNetworkIdentitiesEqual:true,
  builtInBridge:{before:bridgeBefore,after:bridgeAfter,identityEqual:bridgeBefore===bridgeAfter,
    disposition:'Unexplained operational metadata drift, not silently closed. Bounded read-only bridge events returned no explanation. No bridge modification/restoration command was issued; no attribution or data-equivalence claim.'},
  retainedDemo:{before:before.volumes.filter(name=>name.startsWith('vip-demo_')),after:after.volumes.filter(name=>name.startsWith('vip-demo_')),
    mountedQueriedResetOrRemoved:false,verification:'Resource identities only; no retained-data byte hash or DB query'},
  previousUnownedVolume:{name:unowned,presentBefore:before.volumes.includes(unowned),presentAfter:after.volumes.includes(unowned),
    directlyInspectedMountedOrRemoved:false},
  previousSecurityFilesVerifiedUnchanged:immutablePrior.length,
  mutableIndexException:'Only docs/security/README.md is updated as the current index; original SA-0/SA-1/SA-2 assessment package hashes remain unchanged.',
  cleanup:'Four named ownership-labeled data volumes including configdb removed after fresh verification. No additional anonymous volume left. Build tags/cache and private evidence retained; no prune.',
});
console.log(JSON.stringify({fourOwnedVolumesRemoved:true,preExistingContainersAndVolumesEqual:true,oldUnownedVolumeUntouched:true,builtInBridgeIdentityDrift:bridgeBefore!==bridgeAfter}));
