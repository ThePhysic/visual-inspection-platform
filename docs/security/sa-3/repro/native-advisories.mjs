import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, state, save } from './support.mjs';

// Select exact records from structured scanner output. Do not infer a native
// library's coverage from a missing OS/npm record or raw database byte matches.
const old = JSON.parse(await readFile(resolve(root,'.tools/sa1/current.json'),'utf8'));
const inputs = [resolve(old.working,'image-scans/redis.json'), resolve(state.working,'mongo-catalog.json')];
const records = [];
for (const input of inputs) {
  const report=JSON.parse(await readFile(input,'utf8'));
  for(const result of report.Results??[]) records.push(...result.Vulnerabilities??[]);
}
const candidates = [];
for (const id of ['CVE-2026-114655','CVE-2026-85091','CVE-2026-13221','CVE-2026-8376','CVE-2026-42496']) {
  const found=records.filter(record=>record.VulnerabilityID===id);
  candidates.push({id,recordPresent:found.length>0,records:found.map(v=>({title:v.Title,package:v.PkgName,installed:v.InstalledVersion,
    fixed:v.FixedVersion,status:v.Status,vendor:v.DataSource,primaryURL:v.PrimaryURL,references:v.References,
    descriptionSha256:createHash('sha256').update(v.Description??'').digest('hex')})),
    coverageLimit:'Structured OS findings only. Missing bundled native records do not establish absence of vulnerabilities.'});
}
const components=JSON.parse(await readFile(resolve(state.evidence,'components.json'),'utf8'));
const build=JSON.parse(components.mongoshBuildInfo);
await save('native-advisories.json',{ database:'Preserved Trivy schema-v2 DB; hash/provenance in mongo-catalog.json',candidates,
  newlyIdentified:{artifact:'mongosh 2.13.0 compiled bundled dependencies',libmongocrypt:build.deps.libmongocryptVersion,
    nodeBindings:build.deps.libmongocryptNodeBindingsVersion,node:build.nodeVersion,
    candidate:'CVE-2026-114655',status:'unresolved bundled native candidate; verify upstream affected range and feature invocation before severity/application classification',
    requestBoundary:'Matroid uses ordinary Mongoose connections without autoEncryption/KMS configuration; health executes a fixed mongosh ping. No public request API accepts KMS providers/key-vault configuration.',
    next:'Reconcile exact embedded libmongocrypt build against signed/vendor advisory and determine whether affected KMS feature can be invoked in supported usage; do not infer clean coverage from OS scan.'},
  initialToolLimitation:'An initial bounded adjacent-JSON DB experiment returned zero records even for known CVEs; discarded as unsupported, never a clean result. Final evidence selects structured scanner records.',
  noExternalLookup:true,noExploitExecution:true });
console.log(JSON.stringify(candidates.map(c=>({id:c.id,records:c.records.length}))));
