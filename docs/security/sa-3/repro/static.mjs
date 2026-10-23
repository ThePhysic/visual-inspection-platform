import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { root, state, run, save } from './support.mjs';

const snapshot=resolve(state.working,'source'); const output=resolve(state.working,'static');
await mkdir(snapshot,{recursive:true}); await mkdir(output,{recursive:true});
const roots=new Set(['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.node-version','.npmrc','.gitignore','.dockerignore',
  'tsconfig.base.json','eslint.config.js','compose.yaml','compose.dev.yaml','compose.ci.yaml']);
const tracked=(await run('git',['ls-files','-z'])).stdout.split('\0').filter(Boolean);
const files=tracked.filter(path=>roots.has(path)||/^(apps|packages|infra|\.github)\//.test(path)&&/\.(ts|tsx|mjs|json|ya?ml|html|css)$/.test(path)
  ||['infra/docker/Dockerfile','infra/docker/nginx.conf'].includes(path));
const manifest=[];
for(const path of files.sort()) {
  assert.ok(!/(^|\/)(AGENTS\.md|SKILL\.md|\.env[^/]*|\.git|\.agents|\.codex|\.aws|node_modules|dist)(\/|$)/i.test(path));
  assert.ok((await lstat(resolve(root,path))).isFile());
  const bytes=await readFile(resolve(root,path)); const target=resolve(snapshot,path);
  await mkdir(dirname(target),{recursive:true}); await writeFile(target,bytes,{flag:'wx'}); await chmod(target,0o444);
  manifest.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const rules=resolve(root,'docs/security/sa-1/repro/semgrep-rules.yaml');
const engines={semgrep:'sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b',trivy:'sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c'};
for(const id of Object.values(engines)) {
  const [engine]=JSON.parse((await run('docker',['image','inspect',id])).stdout);
  assert.equal(Object.keys(engine.Config.Volumes??{}).length,0,'Scanner must not create anonymous volumes');
}
const base=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','2g',
  '--tmpfs','/tmp:rw,size=256m','--mount',`type=bind,src=${snapshot},dst=/src,readonly`,'--mount',`type=bind,src=${output},dst=/out`];
const semgrep=await run('docker',[...base,'--env','SEMGREP_SEND_METRICS=off','--env','SEMGREP_ENABLE_VERSION_CHECK=0','--env','HOME=/tmp',
  '--mount',`type=bind,src=${rules},dst=/rules.yaml,readonly`,engines.semgrep,'semgrep','scan','--config','/rules.yaml','--metrics','off',
  '--disable-version-check','--no-git-ignore','--json','--output','/out/semgrep.json','/src'],{allowed:[0,1,2,3,7],privateLog:'semgrep.log'});
const trivy=await run('docker',[...base,'--env','TRIVY_DISABLE_TELEMETRY=true',engines.trivy,'fs','--scanners','secret,misconfig','--skip-check-update',
  '--skip-db-update','--skip-java-db-update','--offline-scan','--cache-dir','/tmp/trivy','--format','json','--output','/out/trivy.json','/src'],
{allowed:[0,1],privateLog:'trivy-source.log'});
const sem=JSON.parse(await readFile(resolve(output,'semgrep.json'),'utf8'));
const tri=JSON.parse(await readFile(resolve(output,'trivy.json'),'utf8'));
for(const file of manifest) assert.equal(createHash('sha256').update(await readFile(resolve(snapshot,file.path))).digest('hex'),file.sha256);
await save('source-scans.json',{snapshotFiles:manifest,manifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  engines,versions:{semgrep:sem.version,trivy:tri.Trivy?.Version??'0.76.1'},ruleFile:'../sa-1/repro/semgrep-rules.yaml',
  rulesSha256:createHash('sha256').update(await readFile(rules)).digest('hex'),network:'none',sourceExecuted:false,snapshotUnchanged:true,
  semgrep:{code:semgrep.code,errors:sem.errors,scannedPaths:sem.paths.scanned,
    findings:sem.results.map(r=>({id:r.check_id,path:r.path.replace(/^\/src\//,''),line:r.start.line,message:r.extra.message}))},
  trivy:{code:trivy.code,targets:(tri.Results??[]).map(r=>({target:r.Target.replace(/^\/src\//,''),type:r.Type,
    secrets:(r.Secrets??[]).map(s=>({rule:s.RuleID,severity:s.Severity,line:s.StartLine})),
    misconfiguration:(r.Misconfigurations??[]).map(m=>({id:m.ID,title:m.Title,severity:m.Severity,status:m.Status}))}))},
  exclusions:'Private instructions/config, Git history, docs, fixtures/images, data, dependencies/build outputs. Default Semgrep ignores still apply; rule coverage is narrow, not exhaustive taint analysis.',
  dependencyAudit:'No new npm registry request authorized. Preserved SA-2 metadata responses remain historical for unchanged manifest/lockfile; current advisory assurance uses pinned offline image feed and manual review.',
});
console.log(JSON.stringify({files:manifest.length,semgrepMatches:sem.results.length,semgrepErrors:sem.errors.length,
  secretMatches:(tri.Results??[]).reduce((n,r)=>n+(r.Secrets?.length??0),0),misconfiguration:(tri.Results??[]).reduce((n,r)=>n+(r.Misconfigurations?.length??0),0)}));
