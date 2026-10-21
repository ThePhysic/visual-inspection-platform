# Visual Inspection Platform

A full-stack image inspection application with a React frontend, Fastify API,
and shared, versioned TypeBox contracts. Upload a JPEG/PNG, follow asynchronous
inspection progress, and view read-only bounding boxes, labels, and confidence
scores over the canonical stored image. Copy an inspection URL to reopen it.

MongoDB persists assets and inspections; Redis/BullMQ and an independent worker
execute **simulated inference**. This is a software workflow demonstration, not a
real detector. Annotation editing, human reviews, and history browsing are future work.

## Prerequisites

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

## Install and develop

From the repository root:

```sh
pnpm install --frozen-lockfile
docker compose up -d --wait mongodb redis
pnpm dev
```

Open <http://127.0.0.1:5173>. The API listens on
<http://127.0.0.1:3001/api/v1/health>. Stop development processes with Ctrl+C.
`GET /api/v1/ready` verifies MongoDB and image storage and reports Redis status.
`pnpm dev` also starts the worker. The starting page is the upload workflow;
the existing API-health page is available at `/health`.

Compose runs MongoDB and Redis with loopback-only access, no authentication, and
persistent named volumes. Redis uses AOF (`appendfsync everysec`), a 256 MiB memory
limit, and `noeviction`. These are local development dependencies. To stop them while
preserving data, run `docker compose down`. Restart with the same startup command.
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

Defaults work without an env file once MongoDB and Redis are running. To override them,
copy `.env.example` to `.env` at the repository root.

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_HOST` | `127.0.0.1` | API bind address |
| `API_PORT` | `3001` | API port; integer from 1 through 65535 |
| `MONGODB_PORT` | `27017` | Host port published by Compose |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/visual_inspection` | API database connection |
| `ASSET_STORAGE_DIR` | `.data/images` | Image directory; relative paths resolve from the repository root |
| `MONGODB_TEST_URI` | `mongodb://127.0.0.1:27017` | Integration-test server; tests use a separate random database |
| `REDIS_PORT` | `6379` | Host port published by Compose |
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
  both with `docker compose up -d --wait mongodb redis`. Tests use genuine servers,
  isolated `vip_ingestion_test_*` / `vip_inspection_test_*` databases, unique
  `inspections-test-*` queues, and private temporary image directories. Cleanup
  drops only these test databases/queues; it never runs Redis `FLUSHDB`. Missing
  dependencies fail the command; tests are not silently skipped. Fault cases use
  controlled providers, events, explicit gates, and lease manipulation.
- **Build:** contracts and shared backend first, then API/worker JavaScript and
  frontend assets. Worker startup is also covered by the workspace typecheck.

GitHub Actions runs the same four checks after a frozen-lockfile install on
Linux and Windows. A separate Linux job runs integration tests with the same
MongoDB and Redis versions as Compose, followed by the Chromium browser suite.
The workflow does not publish or deploy anything.

## Run compiled output locally

```sh
pnpm build
docker compose up -d --wait mongodb redis
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
hosting solution. The API does not serve frontend assets. A future deployment
must route `/api` requests to the API and serve `apps/web/dist` separately.

## Structure and contracts

```text
apps/api/             Fastify construction, startup, configuration, and tests
apps/web/             React upload/results routes, viewer, unit and browser tests
apps/worker/          Independently executable inspection consumer
packages/contracts/   Browser-safe schemas, derived types, and validation
packages/backend/     Shared persistence, storage, inference, and queue execution
fixtures/inspections/  Documented synthetic demo images
.github/workflows/    CI validation
compose.yaml          MongoDB/Redis development dependencies and named volumes
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
500 message while logging exception details on the server.

## Image ingestion API

`POST /api/v1/assets` accepts multipart form data with exactly one **`image`** file
and optional **`source`** (`browser` or `api`, default `api`). Source is
caller-supplied metadata; this is the same endpoint for future external clients.
Source may appear before or after the file. Client filenames and declared MIME
types do not determine the storage path or accepted decoded format.

```sh
curl -i -F "image=@/path/to/image.jpg" -F "source=api" http://127.0.0.1:3001/api/v1/assets
```

On PowerShell, use `curl.exe` to avoid the legacy `curl` alias. A successful
request returns **201**, a `Location` metadata URL, and:

```json
{
  "id": "0123456789abcdef01234567",
  "mimeType": "image/jpeg",
  "width": 640,
  "height": 480,
  "byteLength": 12345,
  "sha256": "<64 lowercase hexadecimal characters>",
  "source": "api",
  "createdAt": "2026-10-20T00:00:00.000Z",
  "contentUrl": "/api/v1/assets/0123456789abcdef01234567/content"
}
```

`GET /api/v1/assets/:id` returns that metadata. `GET /api/v1/assets/:id/content`
streams the canonical image with MIME type, content length, checksum ETag,
`nosniff`, and immutable cache headers. Public responses contain neither storage
keys nor filesystem paths. Content retrieval verifies the file exists and its
size matches metadata before sending headers; later I/O failures can interrupt
the stream rather than return a JSON error after headers have been sent.

### Validation and canonical bytes

- JPEG/PNG only, at most **10 MiB input** and **20,000,000 decoded pixels**.
- Multipart bytes stream to private staging files. Container/header inspection
  precedes decoding. Unknown formats return 415; recognized corrupt images return
  422. GIF/TIFF/WebP are unsupported, including their multi-image variants.
- APNG animation declarations, MPO multipicture headers, and decoded page/frame
  metadata are rejected. Container scans have finite structural limits.
- Sharp fully decodes with strict warning handling and its own pixel cap, applies
  EXIF rotation/mirroring, converts to sRGB, and strips metadata. No resizing or
  cropping occurs. Saved dimensions describe the canonical output.
- JPEG stays JPEG: quality 90, 4:4:4 chroma, nonprogressive, default non-MozJPEG
  encoder. This is a lossy re-encoding. PNG stays PNG: compression level 9,
  nonprogressive, no palette quantization or adaptive filtering; alpha is retained.
  Output is an 8-bit sRGB representation rather than archival source data.
- Encoding settings are deterministic for the pinned Sharp/libvips stack. The
  original upload is discarded. Byte length and SHA-256 describe **stored bytes**.
  Identical uploads are permitted and produce separate asset IDs/storage keys.
- Canonical output is capped at 80 MiB after encoding. The server limits ingestion
  to two simultaneous requests, bounds Sharp cache/concurrency, and sets a decode
  timeout and request timeout. Files stream to disk rather than application buffers.

### Persistence and failure behavior

The `assets` collection contains `_id`, `storageKey`, `mimeType`, dimensions,
`byteLength`, `sha256`, `source`, and `createdAt`. Only `storageKey` has an added
unique index; checksum is not unique.

Each upload uses a server-created private directory under the configured image
root. Canonical encoding completes before an exclusive hard link atomically
publishes a UUID filename. Staging and published files must share a local
filesystem supporting hard links (for example, NTFS or ext4). Client paths and
keys are never accepted. The image directory is trusted application storage,
not a directory for untrusted local users to modify.

MongoDB metadata is inserted **after** publication. A response is successful only
after that insert succeeds. Cleanup removes only the request's staging files and
directory; it never recursively deletes the image root or published files.
Cleanup failures are logged without hiding the primary outcome.

Filesystem and MongoDB are not a transaction. A crash, failed database insert,
or lost acknowledgement can leave a published orphan. Published bytes are retained
on database errors because the insert might have committed; removing them could
break an existing record. There is no automatic orphan/stale-staging deletion in
this milestone. Back up/preserve the image directory along with MongoDB metadata.
Power-loss durability and protection against external file deletion are not claimed.

| Condition | Status / error code |
| --- | --- |
| Missing image | 400 `MISSING_IMAGE` |
| Invalid multipart/source | 400 `INVALID_UPLOAD` / `INVALID_SOURCE` |
| Unsupported type or multi-image container | 415 `UNSUPPORTED_IMAGE_TYPE` / `MULTIFRAME_IMAGE` |
| Recognized corrupt image or unsafe decode | 422 `CORRUPT_IMAGE` |
| Input bytes / decoded pixels over limit | 413 `UPLOAD_TOO_LARGE` / `IMAGE_DIMENSIONS_EXCEEDED` |
| Invalid asset ID / absent asset | 400 `INVALID_ASSET_ID` / 404 `ASSET_NOT_FOUND` |
| Storage / database failure | 503 `STORAGE_FAILURE` / `DATABASE_FAILURE` |
| Both ingestion slots occupied | 503 `INGESTION_BUSY` |

Integration tests cover accepted formats, metadata/content retrieval, checksums,
rotation/mirroring, duplicates/index enforcement, validation limits, staging
cleanup, publication failures, database disconnects, and an insert that commits
before its acknowledgement fails.

## Asynchronous inspection API

Upload a fixture through the asset API, then submit its returned ID:

```sh
curl -i -X POST http://127.0.0.1:3001/api/v1/inspections \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: demo-panel-001' \
  -d '{"assetId":"<asset-id>"}'
```

For PowerShell, JSON submission can use:

```powershell
$inspection = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/v1/inspections `
  -ContentType application/json -Headers @{ 'Idempotency-Key' = 'demo-panel-001' } `
  -Body (@{ assetId = '<asset-id>' } | ConvertTo-Json)
Invoke-RestMethod -Uri ("http://127.0.0.1:3001" + $inspection.url)
```

`POST /api/v1/inspections` returns **202** with `{id,status,createdAt,url}` and a
`Location` header after MongoDB accepts the record. Provider configuration may be
omitted or explicitly supplied as
`{"providerId":"mock","modelId":"mock-detector","modelVersion":"1.0.0"}`.
Redis dispatch happens independently. `GET /api/v1/inspections/:id` returns the
current lifecycle state and completed result or safe terminal failure details.
The frontend polls this endpoint; there are no WebSockets.

`POST /api/v1/inspections/:id/retry`, with an `Idempotency-Key` and no body (or `{}`),
creates a new inspection linked through `retriedFrom`. Only failed inspections may
be retried. It preserves the original failed record and returns another **202**.

Keys are case-sensitive, 1–128 ASCII letters/digits/`.`/`_`/`-`. Persistent scopes
are `inspection:create` and `inspection:retry`. Within a scope, the same key and
semantic request return the same inspection; different content returns **409**.
Explicit default provider configuration and omitted defaults are equivalent, as
are uppercase/lowercase asset IDs. Create and retry scopes are distinct, so a key
may be reused across those operations. Different keys create distinct runs.
Retry keys cover the parent inspection ID across the retry scope. Keys have no
automatic expiry. Replayed responses report the existing inspection's current
status, which may already be terminal.

The worker uses one queue (`inspections-v1`) and concurrency **1**. Each inspection
gets at most **3** application attempts, with exponential backoff starting at
**1 second**. Image loading and inference have a **10-second** deadline within a
**30-second** MongoDB execution lease. Native queue retries cannot reset the persistent attempt count.
The API reconciles at startup and every **5 seconds**, checking bounded batches
of queued work and expired execution leases. API and worker shut down with Ctrl+C;
interrupted work remains recoverable through the lease and attempt budget.

All outputs from `mock-detector@1.0.0` are explicitly marked `simulated: true` and
use taxonomy `mock-v1`. See [sample fixtures](fixtures/inspections/README.md).
The provider emits deterministic identities, boxes, and confidence values derived
from image content/version, plus curated panel/empty fixtures. Provider duration
is the deterministic placeholder `0`; measured worker wall time is stored as
`processingDurationMs`. Neither confidence nor timing implies real ML accuracy
or throughput. A result can contain zero through **200** detections.

Completed predictions are validated, copied, and committed once using an atomic
status/token/lease condition. Cross-field validation rejects boxes outside the
image, nonfinite values, duplicate prediction IDs, and oversized detection sets.
Human-review data is not implemented.

Both local processes use the same canonical image directory. This milestone
containerizes dependencies only. If application containers are added later, mount
the same image volume at their configured `ASSET_STORAGE_DIR`, writable for the
API and readable for the worker; no container-local path may be assumed shared.

See [execution and recovery architecture](docs/inspection-pipeline.md) for failure
windows, ownership rules, and operational limitations. Before Task 03A, review
the fixed lease/deadline policy, retention of images/idempotency keys, and future
cleanup of orphaned files. Editing and review persistence require separate authorization.

## Browser workflow

1. Start MongoDB, Redis, API, worker, and frontend using the commands above.
2. Open <http://127.0.0.1:5173> and select one JPEG/PNG up to 10 MiB. For a predictable
   demo, select `fixtures/inspections/panel.png`; `empty.png` demonstrates zero detections.
3. Choose **Upload and inspect**. The server validates, auto-orients, and saves the
   image. After acceptance, the browser navigates to `/inspections/:inspectionId`.
4. Queued/processing pages poll every two seconds while the tab is visible. Terminal
   completed/failed states stop interval polling. Brief processing states may not
   be observed because the mock finishes quickly. Refresh status manually if needed.
5. Completed results show the canonical image, numbered boxes, class labels,
   confidence scores, model/provider metadata, and an explicit simulated-inference
   disclosure. Select a detection to emphasize its box; results cannot be edited.
6. Copy the detail URL. Refreshing or opening it directly fetches the saved inspection;
   Vite supports these routes. Any future static host must route frontend URLs to
   `index.html` while continuing to route `/api` requests to the API.

Upload and inspection creation are distinct steps. A failed creation request keeps
the asset and idempotency key in the current upload page. **Retry inspection
submission** sends the same logical request without uploading again, including
when the server accepted a request but its response was lost. Selecting another
file starts a fresh submission with a new key. Reloading/leaving an unfinished
upload page clears this in-memory submission; it is not a resumable upload session.
An upload acknowledgement lost before the browser receives an asset ID can leave
an asset behind; an explicit upload retry may create another asset.

Network-fetch errors are separate from terminal processing failures. Cached
results remain visible when a background refresh fails, and image-loading errors
leave prediction details available. There is no UI for retrying a failed inspection
yet. See [frontend behavior](docs/browser-workflow.md) for implemented boundaries.
