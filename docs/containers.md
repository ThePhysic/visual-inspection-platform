# Full Compose execution and validation

## Images and configuration

`infra/docker/Dockerfile` has three final targets: `web`, `api`, and `worker`.
They share one workspace build so contracts/backend artifacts come from the same
checkout. Node **24.22.0 bookworm-slim** and nginx-unprivileged **1.30.2 alpine**
are pinned by multi-platform manifest digest; pnpm is **10.34.7**. MongoDB
**8.0.34** and Redis **8.2.8** retain the existing version pins.

Manifest/lockfile copies precede source copies. BuildKit caches the pnpm store;
source edits reuse installed dependencies. All installs use `--frozen-lockfile`.
The build stage includes development tooling, but separate filtered production
installs package only each Node service's dependency closure. Runtime copies
preserve pnpm's relative workspace links and include compiled `dist` directories,
package manifests, and production node_modules. There is no runtime pnpm/tsx/Vite
requirement. nginx receives only web build output and its configuration.

`.dockerignore` excludes host modules/build outputs, Git history, private env
files, tool caches, reports, logs, and application data. Images need registry
access on initial build; caches are conveniences, not host prerequisites. Native
Sharp binaries are installed for the container platform, never copied from host
node_modules. No additional OS packages are installed.

The root Compose file runs all five services. `compose.dev.yaml` only adds
loopback MongoDB/Redis host ports for native development. Start explicit dependency
service names with that override; no application containers are required for
`pnpm dev`. Use separate project names (README: `vip-demo` / `vip-native`) to
separate networks, Redis queues, databases, and volumes. Existing native data is
not migrated, deleted, or silently copied into Docker storage.

Only web publishes a host port, `127.0.0.1:${WEB_PORT:-8080}`. API/worker receive
fixed internal settings from Compose: `mongodb://mongodb:27017/visual_inspection`,
`redis://redis:6379`, and `/data/images`. nginx uses `api:3001`. Native `.env` URIs,
Windows paths, and API host/port overrides cannot accidentally override these
container settings. API/backend startup still validates its existing settings.
No VITE-prefixed private configuration is passed to the web build.

## Storage and process lifecycle

MongoDB, Redis, and images use independent project-scoped named volumes. New image
volumes copy the image directory's UID/GID **1000:1000**, mode **0700**. The API
runs as that non-root user and performs its existing writable/hard-link readiness
probe. The worker uses the same UID but mounts the volume **read-only**; it never
calls storage initialization or staging. Both read canonical bytes from the same
path. nginx runs as its image's unprivileged user.

Existing nonempty volumes retain ownership; rebuilding images does not repair an
arbitrarily changed volume's permissions. Inspect/fix only the named image volume
if manually altered, preserving existing data. Do not recursively change unrelated
host directories. Back up MongoDB and canonical images together; neither includes
the other's contents. Redis uses AOF with `appendfsync everysec` and `noeviction`.
This does not establish power-loss durability, backups, or disaster recovery.

Application commands execute Node directly. Compose `init: true` forwards signals
and reaps child processes. Existing SIGTERM/SIGINT cleanup closes reconciliation,
Fastify, workers, Redis clients, and MongoDB connections. Grace periods are 30s
for API and 45s for worker. nginx retains its image's normal graceful stop signal.
`restart: unless-stopped` supervises exits; it does not restart a container merely
because a health check is unhealthy.

Health checks cover MongoDB ping, Redis ping, API admission readiness, and nginx's
`/healthz`. API/worker start after relevant dependencies; web waits for API health.
The worker has **no HTTP health endpoint**. An expiring local file records
MongoDB/normal-and-blocking-Redis connectivity, consumer state and bounded active
work. Compose checks that observation; smoke-test completion separately verifies
actual consumption. See [consumer supervision and limitations](reliability.md).

Startup conditions do not replace runtime recovery. MongoDB/ioredis reconnect,
API reconciliation, leases, bounded attempts, and idempotency are unchanged.
During Redis interruption the API can remain admission-ready and durably accept
MongoDB intent, while reporting Redis unavailable; completion waits for recovery.
MongoDB/storage failures make API readiness fail. Native pipeline integration
tests retain their existing interruption coverage. The explicit disposable
[reliability harness](reliability.md) adds bounded dependency outages and a
controlled MongoDB completion-write failure without changing execution semantics.

Ordinary restart, force-recreation, and `down` preserve named volumes. Use the
same project name on the next `up`. `down --volumes`, Docker volume deletion, or
pruning destroys persistent data. CI deletes only its generated, ownership-verified
`vip-reliability-<token>` project volumes after checks; this is not a demo shutdown command.

## nginx behavior

nginx serves the production SPA, falls back to `index.html` for React Router deep
links, and returns 404 for missing hashed assets. HTML uses `Cache-Control:
no-cache`; `/assets/` files use a one-year immutable cache policy. `/api/` is
proxied with the original path/query/method/body and useful response headers.
Errors pass through rather than becoming HTML fallbacks. Requests/responses are
not unnecessarily buffered. An 11 MiB proxy limit allows protocol overhead while
the API still enforces 10 MiB per uploaded image. Proxy read/send timeouts are 60s.

Docker DNS resolution is refreshed for the variable upstream, allowing API IP
changes after recreation without rebuilding/restarting nginx. See the primary
[NGINX proxy module reference](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
for variable upstream and buffering semantics. There is no public TLS,
authentication, custom service discovery, or Kubernetes configuration.

## Bounded container smoke checks

Use a disposable project; these checks create ordinary demo records and a small
hidden checkpoint in the image volume. They never flush databases, delete stored
images, or install host packages. `create` refuses to overwrite a checkpoint;
use `verify` afterward or start a different project for a fresh run.

In Bash, from the repository root:

```sh
export WEB_PORT=18080
docker compose -p vip-smoke up -d --build --wait --wait-timeout 120
docker compose -p vip-smoke exec -T -w /app/apps/api api node --input-type=module - create < infra/docker/smoke.mjs
docker compose -p vip-smoke exec -T -w /app/apps/worker worker node --input-type=module - < infra/docker/check-worker.mjs
docker compose -p vip-smoke restart api worker
docker compose -p vip-smoke up -d --wait --wait-timeout 120
docker compose -p vip-smoke exec -T -w /app/apps/api api node --input-type=module - verify < infra/docker/smoke.mjs
docker compose -p vip-smoke down
docker compose -p vip-smoke up -d --wait --wait-timeout 120
docker compose -p vip-smoke exec -T -w /app/apps/api api node --input-type=module - verify < infra/docker/smoke.mjs
docker compose -p vip-smoke down
```

In PowerShell, set `$env:WEB_PORT = '18080'` and replace each stdin redirection
with a pipeline, for example:

```powershell
Get-Content -Raw infra/docker/smoke.mjs | docker compose -p vip-smoke exec -T -w /app/apps/api api node --input-type=module - create
Get-Content -Raw infra/docker/check-worker.mjs | docker compose -p vip-smoke exec -T -w /app/apps/worker worker node --input-type=module -
```

The Node smoke checks run **inside** the built API/worker containers. They verify
internal service URLs, non-root execution, absence of source/env/dev-tooling in
runtime packaging, reverse-proxy health, HTML/deep-link/static caching, canonical
upload/content/checksum, actual worker inference, persisted corrections with
unchanged original predictions, history pagination, retry idempotency/lineage,
and API JSON errors for an oversized upload. The initial terminal-failure fixture
is seeded only for this smoke test; retry and subsequent execution are real.
No production fault-injection switch is added. `verify` checks the saved data and
submits a fresh job against the persisted image after restart/recreation. CI also
restarts MongoDB/Redis while API/worker remain running, then checks new processing,
and checks a dedicated Redis marker survives full down/up. This is a bounded
ordinary restart check, not exhaustive outage or crash-window fault injection.

For one real browser workflow through the containerized web server, optional host
test tooling is required (native prerequisites in README):

```sh
pnpm install --frozen-lockfile
pnpm --filter @vip/web exec playwright install chromium
# Set CONTAINER_BASE_URL=http://127.0.0.1:18080 if using the smoke port.
pnpm --filter @vip/web exec playwright test --config playwright.container.config.ts
```

It uploads, runs inference, drags a real canvas box, relabels, saves, refreshes a
deep link, and reopens through history. It uses no HTTP doubles or host API/worker.
The existing `pnpm test:e2e` suite remains independent and starts its native private
test stack as before. The Docker CI job runs bounded container checks and this
single browser test, rather than duplicating that entire suite.

Only trusted local/demo access is intended. No authentication, multi-host image
storage, rolling-deployment guarantees, load measurement, or advanced recovery
hardening is claimed. Linux container builds are portable in design; execution
on other CPU architectures/browser engines must be verified separately.
