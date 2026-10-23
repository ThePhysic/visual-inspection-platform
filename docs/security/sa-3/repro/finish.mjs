import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { state,pnpm,save } from './support.mjs';

const first=JSON.parse(await readFile(resolve(state.evidence,'workspace-validation-initial.json'),'utf8'));
assert.ok(first.results.filter(result=>result.command!=='pnpm lint').every(result=>result.code===0));
const lint=await pnpm(['lint'],{privateLog:'lint-corrected.log',allowed:[0,1],timeout:120_000});
const unit=stripVTControlCharacters(await readFile(resolve(state.working,'workspace-test-final.log'),'utf8'));
const counts=[...unit.matchAll(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?/g)];
const passed=counts.reduce((n,m)=>n+Number(m[1]),0);const skipped=counts.reduce((n,m)=>n+Number(m[2]??0),0);
assert.equal(passed,278);assert.equal(skipped,1);assert.match(unit,/[ℹ#]\s*tests\s+10/);
await save('workspace-validation-final.json',{node:process.version,pnpm:'10.34.7',
  results:first.results.map(result=>result.command==='pnpm lint'?{command:'pnpm lint',code:lint.code,durationMs:lint.durationMs,testCounts:[]}:result),
  unit:{passed,skipped,failed:0,nodeHarnessPassed:10,nodeHarnessFailed:0},
  accounting:'Typecheck/test/build are the actual first execution against unchanged application and final harness source. Only lint rerun after audit-script import correction and documentation/reproduction additions. Initial failed lint preserved.',
});
assert.equal(lint.code,0);console.log(JSON.stringify({lint:0,typecheck:0,build:0,unitPassed:passed,unitSkipped:skipped,harnessPassed:10}));
