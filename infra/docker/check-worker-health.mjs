import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';

const dependency = process.argv[2];
assert.ok(['redis', 'mongodb'].includes(dependency));
const deadline = Date.now() + 20_000;
let verified = false;
while (Date.now() < deadline) {
  const observation = JSON.parse(await readFile('/tmp/vip-worker-health.json', 'utf8'));
  assert.ok(Date.now() - observation.observedAt < 15_000, 'Worker heartbeat expired');
  if (!observation[dependency] && !observation.healthy) { verified = true; break; }
  await pause(200);
}
assert.ok(verified, `Worker did not report ${dependency} unavailable`);
console.log(`Worker health correctly reports ${dependency} unavailable (process remains alive).`);
