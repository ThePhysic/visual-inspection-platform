# Visual Inspection Platform

A full-stack TypeScript foundation with a React frontend, Fastify API, and shared,
versioned TypeBox contracts. The page checks API health and handles loading,
connection failures, incompatible responses, and retrying.

The API also ingests JPEG/PNG images, stores canonical image bytes locally, and
persists asset metadata in MongoDB. The frontend remains the health-status page;
use the upload API directly. Inspection jobs, inference, and editing are future work.

## Prerequisites

- Node.js **24.22.0**, pinned in `.node-version` and `package.json`.
- pnpm **10.34.7**, pinned in `package.json`.
- Docker with Compose v2 for the MongoDB development dependency (or an existing
  MongoDB 8.0 server).

Install the pinned Node version using your preferred version manager or the
official Node distribution. With that Node version active, install pnpm:

```sh
npm install --global pnpm@10.34.7
node --version
pnpm --version
```

The versions should print `v24.22.0` and `10.34.7`. Engine checks reject an
incompatible runtime. MongoDB is required to start the full API.

## Install and develop

From the repository root:

```sh
pnpm install --frozen-lockfile
docker compose up -d --wait mongodb
pnpm dev
```

Open <http://127.0.0.1:5173>. The API listens on
<http://127.0.0.1:3001/api/v1/health>. Stop development processes with Ctrl+C.
`GET /api/v1/ready` verifies a MongoDB ping and writable image staging storage.

Compose runs MongoDB **8.0.34**, with loopback-only access, no authentication, and
a persistent named volume. It is a local development dependency. To stop it while
preserving data, run `docker compose down`. Restart with the same startup command.
Do not remove the named volume unless you intend to discard the development DB.

`pnpm dev` builds contracts first, then watches contracts, API code, and frontend
code together. To run the applications in separate terminals instead:

```sh
pnpm dev:api
```

```sh
pnpm dev:web
```

The separate commands build contracts on startup; use `pnpm dev` when editing
contracts to keep their compiled output up to date automatically.

## Configuration

Defaults work without an env file once MongoDB is running. To override them,
copy `.env.example` to `.env` at the repository root.

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_HOST` | `127.0.0.1` | API bind address |
| `API_PORT` | `3001` | API port; integer from 1 through 65535 |
| `MONGODB_PORT` | `27017` | Host port published by Compose |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/visual_inspection` | API database connection |
| `ASSET_STORAGE_DIR` | `.data/images` | Image directory; relative paths resolve from the repository root |
| `MONGODB_TEST_URI` | `mongodb://127.0.0.1:27017` | Integration-test server; tests use a separate random database |

If changing `MONGODB_PORT`, update both MongoDB URIs to match. Keep database
credentials out of source control. The API and integration test command load the
root `.env`; existing shell environment variables take precedence.

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

- **Lint:** ESLint for JavaScript, TypeScript, and React hooks.
- **Typecheck:** strict TypeScript across production code, tests, and Vite config.
- **Test:** Vitest contract checks, Fastify injection tests, configuration tests,
  local-storage tests, and React Testing Library smoke tests in jsdom. `pnpm test`
  needs neither MongoDB nor a running API.
- **Integration test:** `pnpm test:integration` requires reachable MongoDB. Start
  it with `docker compose up -d --wait mongodb` first. Tests use genuine Mongoose
  writes, reads, and unique indexes, generate an isolated `vip_ingestion_test_*`
  database, and drop only that database afterward. No MongoDB mock or in-memory
  database substitute is used. Each test uses an isolated OS temporary directory.
  Missing MongoDB fails this command; tests are not silently skipped.
- **Build:** contracts first, followed by API JavaScript and frontend assets.

GitHub Actions runs the same four checks after a frozen-lockfile install on
Linux and Windows. A separate Linux job runs integration tests with the same
MongoDB version as Compose. The workflow does not publish or deploy anything.

## Run compiled output locally

```sh
pnpm build
docker compose up -d --wait mongodb
pnpm --filter @vip/api start
```

In another terminal:

```sh
pnpm --filter @vip/web preview
```

Open <http://127.0.0.1:4173>. Vite preview is a local build check, not a production
hosting solution. The API does not serve frontend assets. A future deployment
must route `/api` requests to the API and serve `apps/web/dist` separately.

## Structure and contracts

```text
apps/api/             Fastify construction, startup, configuration, and tests
apps/web/             React health page, Vite configuration, and smoke tests
packages/contracts/   Browser-safe schemas, derived types, and validation
.github/workflows/    CI validation
compose.yaml          MongoDB development dependency and named volume
```

`apps/api/src/app.ts` constructs an app without listening or reading environment
variables. `server.ts` owns startup, database connection/index initialization,
storage initialization, logging, and signal handling. MongoDB must connect and
the unique storage-key index must initialize before the server listens. The
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
when a runtime dependency fails. `/api/v1/ready` returns 200 only when both
dependencies respond, otherwise 503. TypeBox defines the
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

Before Task 02B, review retry/idempotency policy for submissions, shared worker
access to canonical images, and eventual orphan/staging maintenance. Redis,
inspection jobs, inference, and frontend upload/editing require separate authorization.
