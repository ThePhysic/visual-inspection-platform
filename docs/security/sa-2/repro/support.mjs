import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const root = process.cwd();
export const state = JSON.parse(await readFile(resolve(root, '.tools/sa2/current.json'), 'utf8'));
export const save = (name, value) => writeFile(resolve(state.evidence, name), JSON.stringify(value, null, 2) + '\n');
export async function run(executable, args, { env = {}, input, timeout = 180_000, allowed = [0], privateLog, cwd = root } = {}) {
  const start = Date.now();
  const result = await new Promise((done, reject) => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('SA-2 command deadline exceeded')); }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); done({ code, stdout, stderr, durationMs: Date.now() - start }); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
  if (privateLog) await writeFile(resolve(state.working, privateLog), result.stdout + '\n' + result.stderr);
  if (!allowed.includes(result.code)) throw new Error(`${executable} ${args[0]} exited ${result.code}: ${result.stderr.slice(-1200)}`);
  return result;
}
export const pnpm = (args, options = {}) => run(process.execPath, [resolve(root, '.tools/package/bin/pnpm.cjs'), ...args], {
  ...options, env: { ...options.env, PATH: `${resolve(root, '.tools')};${process.env.PATH}` },
});
