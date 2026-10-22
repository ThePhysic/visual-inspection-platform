# Native development and verification

## Native application development

This workflow uses host Node/pnpm with only MongoDB/Redis in Docker. Existing
compatible local servers can also be used. Prerequisites:

- Node.js **24.22.0**, pinned in `.node-version` and `package.json`.
- pnpm **10.34.7**, pinned in `package.json`.
- Docker with Compose v2 for MongoDB **8.0.34** and Redis **8.2.8** development
  dependencies (or compatible existing servers).

Install the pinned Node version using your preferred version manager or the
official Node distribution. With that Node version active, install pnpm:

```sh
npm install --global pnpm@10.34.7
node --version
pnpm --version
```

The versions should print `v24.22.0` and `10.34.7`. Engine checks reject an
incompatible runtime. MongoDB is required to start the API; Redis and the worker
are required to execute inspections. Redis can recover after API startup.

### Install and develop

From the repository root:

```sh
pnpm install --frozen-lockfile
docker compose -p vip-native -f compose.yaml -f compose.dev.yaml up -d --wait mongodb redis
pnpm dev
```

Open <http://127.0.0.1:5173>. The API listens on
<http://127.0.0.1:3001/api/v1/health>. Stop development processes with Ctrl+C.
`GET /api/v1/ready` verifies MongoDB and image storage and reports Redis status.
`pnpm dev` also starts the worker. The starting page is the upload workflow;
the existing API-health page is available at `/health`.

The explicit `compose.dev.yaml` override exposes MongoDB and Redis on loopback
only. The service names in the command start just these dependencies, not the
containerized web/API/worker. They use persistent named volumes without
authentication. Redis uses AOF (`appendfsync everysec`), a 256 MiB memory
limit, and `noeviction`. These are local development dependencies. To stop them while
preserving data, run `docker compose -p vip-native -f compose.yaml -f compose.dev.yaml down`.
Restart with the same startup command. Retain the project name when reusing an
existing dependency volume; switching names creates a separate environment.
Do not remove the named volume unless you intend to discard the development DB.

`pnpm dev` builds contracts and the shared backend first, then watches all packages
and applications together. To use separate terminals instead:

```sh
pnpm dev:api
```

```sh
pnpm dev:web
```

```sh
pnpm dev:worker
```

The separate commands build shared packages on startup. Use `pnpm dev` when editing
shared code to keep compiled output up to date automatically.

## Configuration

Native defaults work without an env file once MongoDB and Redis are running. To override them,
copy `.env.example` to `.env` at the repository root.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_PORT` | `8080` | Full-container web host port, loopback only |
| `API_HOST` | `127.0.0.1` | API bind address |
| `API_PORT` | `3001` | API port; integer from 1 through 65535 |
| `MONGODB_PORT` | `27017` | Host port published only by `compose.dev.yaml` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/visual_inspection` | API database connection |
| `ASSET_STORAGE_DIR` | `.data/images` | Image directory; relative paths resolve from the repository root |
| `MONGODB_TEST_URI` | `mongodb://127.0.0.1:27017` | Integration-test server; tests use a separate random database |
| `REDIS_PORT` | `6379` | Host port published only by `compose.dev.yaml` |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Shared API dispatch / worker Redis connection |
| `REDIS_TEST_URL` | `redis://127.0.0.1:6379` | Integration-test Redis server |
| `E2E_REDIS_URL` | `REDIS_TEST_URL` with database `/15` | Optional browser-test Redis override; reserve this DB for tests |

If changing `MONGODB_PORT`, update both MongoDB URIs to match. Keep database
credentials out of source control. The API and integration test command load the
root `.env`; existing shell environment variables take precedence.
The worker loads the same `.env` and resolves `ASSET_STORAGE_DIR` from the same
repository root. If changing `REDIS_PORT`, update both Redis URLs to match.
API and worker must use the same MongoDB database, Redis URL, and canonical image
directory. The default queue name represents one application environment.

Full Compose intentionally sets `API_HOST=0.0.0.0`, `API_PORT=3001`,
`MONGODB_URI=mongodb://mongodb:27017/visual_inspection`,
`REDIS_URL=redis://redis:6379`, and `ASSET_STORAGE_DIR=/data/images` in the service
configuration. The native URI/path variables above do not override these container
values. This avoids accidentally using localhost or a Windows path inside Linux.

The web app requests relative `/api` URLs. Vite's development and preview servers
proxy them to `127.0.0.1:API_PORT`; keep the API reachable on loopback when using
these commands. Restart development servers after changing `.env`. Environment
variables set in the shell take precedence. No secrets or browser environment
variables are required.

## Validation

Run from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

For frontend tests only, run `pnpm --filter @vip/contracts build` followed by
`pnpm --filter @vip/web test`. These tests mock HTTP responses and exercise upload,
retry identity, polling, route reloads, validation, and viewer states. jsdom tests
check normalized style values; Playwright checks actual browser layout.

Install Chromium once, then run the browser suite with MongoDB/Redis available:

```sh
pnpm --filter @vip/web exec playwright install chromium
pnpm test:e2e
```

On a fresh Linux machine, use `playwright install --with-deps chromium` for system
libraries. `pnpm test:e2e` builds the workspace, then Playwright starts compiled API
and worker processes and Vite preview on dedicated ports **3003** and **4174**.
It refuses to reuse existing servers. Tests create a random `vip_browser_test_*`
database and private `.data/browser-tests` directory; teardown removes only that
run's data/jobs. An abruptly terminated test runner can leave test resources.
Redis database **15** is reserved by default; set `E2E_REDIS_URL` for Redis
configurations with a different test database. No `FLUSHDB` is used.

The browser suite performs real uploads, real queue execution, result rendering,
mobile resizing, direct-link reloads, empty results, and a lost acceptance response
followed by an idempotent retry. Separate controlled-HTTP tests expose queued and
processing states deterministically and test portrait/landscape geometry; those
tests mock inspection/asset responses and image bytes. The fast real mock provider
may finish processing between polls. No production inference delays are added.

- **Lint:** ESLint for JavaScript, TypeScript, and React hooks.
- **Typecheck:** strict TypeScript across production code, tests, and Vite config.
- **Test:** Vitest contract checks, Fastify injection tests, configuration tests,
  local-storage tests, and React Testing Library smoke tests in jsdom. `pnpm test`
  needs neither MongoDB nor a running API.
- **Integration test:** `pnpm test:integration` requires MongoDB and Redis. Start
  both with the native dependency startup command above. Tests use genuine servers,
  isolated `vip_ingestion_test_*` / `vip_inspection_test_*` / `vip_review_test_*` /
  `vip_history_test_*` databases, unique
  `inspections-test-*` queues, and private temporary image directories. Cleanup
  drops only these test databases/queues; it never runs Redis `FLUSHDB`. Missing
  dependencies fail the command; tests are not silently skipped. Fault cases use
  controlled providers, events, explicit gates, and lease manipulation.
- **Build:** contracts and shared backend first, then API/worker JavaScript and
  frontend assets. Worker startup is also covered by the workspace typecheck.

GitHub Actions runs lint, typecheck, unit tests and build after a frozen-lockfile install on
Linux and Windows. A separate Linux job runs integration tests with the same
MongoDB and Redis versions as Compose, followed by the Chromium browser suite.
A Docker job builds all three runtime targets and verifies a bounded container
workflow, browser workflows through nginx, and persistence across ordinary restart
and down/up. See [container validation commands](containers.md).
The workflow does not publish or deploy anything.

## Run compiled output locally

```sh
pnpm build
docker compose -p vip-native -f compose.yaml -f compose.dev.yaml up -d --wait mongodb redis
pnpm --filter @vip/api start
```

In another terminal:

```sh
pnpm --filter @vip/web preview
```

Start the worker in a third terminal:

```sh
pnpm --filter @vip/worker start
```

Open <http://127.0.0.1:4173>. Vite preview is a local build check, not a production
hosting solution. The API does not serve frontend assets. Full Compose already
routes `/api` requests to the API and serves the frontend build separately through nginx.

## Structure and contracts

```text
apps/api/             Fastify construction, startup, configuration, and tests
apps/web/             React upload/results routes, viewer, unit and browser tests
apps/worker/          Independently executable inspection consumer
packages/contracts/   Browser-safe schemas, derived types, and validation
packages/backend/     Shared persistence, storage, inference, and queue execution
../fixtures/inspections/  Documented synthetic demo images
.github/workflows/    CI validation
compose.yaml          Full five-service application and persistent named volumes
```

`apps/api/src/app.ts` constructs an app without listening or reading environment
variables. `server.ts` owns startup, database connection/index initialization,
storage initialization, logging, and signal handling. MongoDB must connect and
the asset and inspection indexes must initialize before the server listens. The
database connection is closed with Fastify on shutdown; failed initial startup
exits unsuccessfully. Disconnected queries do not wait in Mongoose's command buffer.
Contracts build to `dist` and are consumed as a normal workspace package by both
applications. No TypeScript path aliases or server dependencies are required in
the contracts package.

`GET /api/v1/health` returns HTTP 200:

```json
{
  "apiVersion": "v1",
  "service": "visual-inspection-api",
  "status": "ok"
}
```

The endpoint accepts no query parameters. It reports API process liveness even
when a runtime dependency fails. `/api/v1/ready` returns 200 when MongoDB and
storage are ready, otherwise 503. Its `dependencies.redis` is `ok` or `unavailable`;
unavailable dispatch does not disable durable acceptance. This is admission
readiness, not a guarantee of worker availability or prompt completion. TypeBox defines the
response schema and derives its TypeScript type; Fastify uses the schema for
serialization, and the frontend validates received JSON against the same schema.
Incompatible wire changes require a new API version.

Errors use `{ "error": { "code", "message", "requestId" } }`. Validation failures
return 400, missing routes return 404, and unexpected server errors return a safe
500 message while logging a bounded server-side failure category/code.

