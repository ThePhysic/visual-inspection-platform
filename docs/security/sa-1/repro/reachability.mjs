import { save } from './support.mjs';
import { loadEnvironment } from './environment.mjs';
const test = await loadEnvironment();
await test.verify();
const node = await test.compose(['exec', '-T', 'api', 'node', '--input-type=module', '-'], { input: `
import fs from 'node:fs';
console.log(JSON.stringify({node:process.version,embeddedUndici:process.versions.undici,
npmBundledUndici:JSON.parse(fs.readFileSync('/usr/local/lib/node_modules/npm/node_modules/undici/package.json')).version,
fstabUserEntries:fs.readFileSync('/etc/fstab','utf8').split('\\n').filter(line=>!line.trim().startsWith('#')&&line.trim())}));
` });
const nginx = await test.compose(['exec', '-T', 'web', 'nginx', '-T']);
const redis = await test.compose(['exec', '-T', 'redis', 'redis-cli', 'CONFIG', 'GET', 'tls-port', 'enable-debug-command', 'enable-module-command', 'protected-mode']);
await save('reachability.json', { node: JSON.parse(node.stdout), nginxDirectives: (nginx.stdout + nginx.stderr).split('\n')
  .filter(line => /^\s*(listen|load_module|image_filter|ssl_|http3|quic|gzip|location|proxy_pass)/.test(line)),
  redisConfiguration: redis.stdout, note: 'Read-only prerequisites check; no mount, ACL, TLS, regex, command-execution or memory-corruption exploit attempted.' });
console.log(node.stdout);
