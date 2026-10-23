import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';

const test = await loadEnvironment(); const containers = await test.verify();
const mongod = await test.compose(['exec','-T','mongodb','mongod','--version']);
const mongoshHelp = await test.compose(['exec','-T','mongodb','mongosh','--help']);
const buildInfo = mongoshHelp.stdout.includes('--build-info') ? await test.compose(['exec','-T','mongodb','mongosh','--build-info']) : null;
const shellVersions = await test.compose(['exec','-T','-e','MONGOSH_DISABLE_TELEMETRY=1','mongodb','mongosh','--nodb','--quiet','--eval',
  'print(JSON.stringify({versions:process.versions,architecture:process.arch,platform:process.platform}))']);
const inventory = await test.compose(['exec','-T','mongodb','dpkg-query','-L','mongodb-mongosh']);
const identities = await test.compose(['exec','-T','mongodb','sha256sum','/usr/bin/mongod','/usr/bin/mongosh']);
const api = await test.compose(['exec','-T','-w','/app/apps/api','api','node','--input-type=module','-'], { input: `
  import {createRequire} from 'node:module'; import {readFileSync,existsSync} from 'node:fs'; import {createHash} from 'node:crypto';
  const req=createRequire(process.cwd()+'/package.json'); const sharp=req('sharp');
  // Exercise only tiny known-generated PNG/JPEG inputs to identify loaded libs.
  for(const format of ['png','jpeg']) { const image=await sharp({create:{width:2,height:2,channels:3,background:'#123456'}})[format]().toBuffer(); await sharp(image).raw().toBuffer(); }
  const paths=[...new Set(readFileSync('/proc/self/maps','utf8').split('\\n').map(line=>line.split(/\\s+/).at(-1)).filter(path=>path?.startsWith('/app/') && /\\.so/.test(path)))];
  console.log(JSON.stringify({node:process.version,nodeLibraries:process.versions,sharp:sharp.versions,uid:process.getuid(),
    npm:existsSync('/usr/local/lib/node_modules/npm'),npx:existsSync('/usr/local/bin/npx'),
    loadedNative:paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))}));
` });
const node = JSON.parse(api.stdout); assert.equal(node.npm,false); assert.equal(node.npx,false); assert.equal(node.uid,1000);
assert.ok(node.loadedNative.some(item=>item.path.includes('libvips')));
const perl = await test.compose(['exec','-T','redis','perl','-V:archname','-V:ivsize','-V:ptrsize']);
const archive = await test.compose(['exec','-T','redis','perl','-MArchive::Tar','-e','1'], {allowed:[0,2,255]});
const nginx = await test.compose(['exec','-T','web','nginx','-T']);
const crypto = await test.compose(['exec','-T','mongodb','ldd','/usr/bin/mongod']);
const rawBuild = mongod.stdout.slice(mongod.stdout.indexOf('{'));
const mongoBuild = JSON.parse(rawBuild);
assert.equal(mongoBuild.version, '8.0.34');
const original = JSON.parse(await readFile(resolve(root,'docs/security/sa-2/evidence/advisory-triage.json'),'utf8'));
const baseline = JSON.parse(await readFile(resolve(root,'docs/security/sa-2/evidence/runtime.json'),'utf8'));
assert.deepEqual(node.sharp, baseline.runtime.find(r=>r.service==='api').sharp);
const comparisons = [
  { candidate:'Redis CVE-2026-42496', observation:archive.code===0?'Archive::Tar available':'Archive::Tar unavailable',
    classification:archive.code===0?'unresolved candidate':'verified absent prerequisite in examined image', remaining:'Source-package record retained; no archive payload executed' },
  { candidate:'Redis CVE-2026-8376', observation:perl.stdout.trim(), classification:'verified 64-bit build, vendor 32-bit prerequisite absent', remaining:'No blanket package suppression' },
  { candidate:'Redis CVE-2026-13221', classification:'unresolved vendor applicability', remaining:'Prior vendor source table and introduced-version note disagree; no new authoritative vendor correction obtained offline' },
  { candidate:'MongoDB zlib CVE-2026-85091', classification:'unresolved affected sequence/reachability', remaining:'libz linked to mongod; no evidence that normal wire compression or driver queries invoke the advised nonblocking gzprintf sequence' },
  { candidate:'Sharp/native codecs', classification:'exact loaded artifact identities verified; advisory completeness blocked', remaining:'Runtime map and loaded libvips hashes do not provide an exhaustive embedded native SBOM/CVE mapping. JPEG/PNG input gate is not a proof against every decoder flaw' },
  { candidate:'Node embedded Undici versus removed npm Undici', classification:'distinct runtime artifact verified', remaining:'Node embedded version is not former npm-private 6.28.0; generic npm matches cannot be transferred to Node without affected-major-range evidence' },
];
await save('components.json', { images:containers.map(c=>({service:c.Config.Labels['com.docker.compose.service'],imageId:c.Image})),
  mongoBuild, mongoshBuildInfo:buildInfo?.stdout??'flag unavailable', mongoshRuntime:JSON.parse(shellVersions.stdout),
  mongoshPackageFiles:inventory.stdout.trim().split('\n'), binaryHashes:identities.stdout.trim().split('\n'), node,
  redisPerl:perl.stdout.trim(), archiveTarAvailable:archive.code===0,
  nginxFeatureDirectives:(nginx.stdout+nginx.stderr).split('\n').filter(line=>/^\s*(listen|load_module|image_filter|ssl_|http3|quic|gzip|location|proxy_pass)/.test(line)),
  mongoLinkedLibraries:crypto.stdout.trim().split('\n'), comparisons,
  priorVendorEvidenceSha256:createHash('sha256').update(JSON.stringify(original)).digest('hex'),
  limitations:'No live external systems or feed refresh. No crafted image bomb/regex/archive/memory-corruption test. Mongosh --nodb reads version identity only, not any database. Exact runtime versions narrow artifacts; they do not close embedded-library advisory coverage.',
});
console.log(JSON.stringify({mongo: mongoBuild.version,mongosh:JSON.parse(shellVersions.stdout).versions.node,sharp:node.sharp.sharp,loadedNative:node.loadedNative.length}));
