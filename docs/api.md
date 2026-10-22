# Asset and inspection API reference

Examples use the native API at `http://127.0.0.1:3001`. For full Compose, use
the same `/api/v1/...` paths on `http://127.0.0.1:8080` through nginx.

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
break an existing record. Published orphan cleanup is report-only. Offline stale-staging cleanup is described in [storage maintenance](reliability.md). Back up/preserve the image directory along with MongoDB metadata.
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
After sending the response, the API gives its existing reconciler a bounded,
coalesced prompt-dispatch hint. Redis dispatch happens independently; failed or
dropped hints leave durable work for startup/periodic repair. The same applies to
manual retries. `GET /api/v1/inspections/:id` returns the
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
use taxonomy `mock-v1`. See [sample fixtures](../fixtures/inspections/README.md).
The provider emits deterministic identities, boxes, and confidence values derived
from image content/version, plus curated panel/empty fixtures. Provider duration
is the deterministic placeholder `0`; measured worker wall time is stored as
`processingDurationMs`. Neither confidence nor timing implies real ML accuracy
or throughput. A result can contain zero through **200** detections.

Completed predictions are validated, copied, and committed once using an atomic
status/token/lease condition. Cross-field validation rejects boxes outside the
image, nonfinite values, duplicate prediction IDs, and oversized detection sets.
Human reviews are persisted separately; see [review contracts and revision semantics](reviews.md).

Both native processes use the same configured canonical image directory. Full
Compose uses the shared `images` volume at `/data/images`, writable for the API
and mounted read-only for the worker. It is a separate image store from native
`.data/images`; container-local paths must not be assumed shared between services.

See [execution and recovery architecture](inspection-pipeline.md) for failure
windows, ownership rules, and operational limitations. The fixed lease/deadline
policy, retention of images/idempotency keys, and cleanup of orphaned files remain
operational considerations. Review saves do not change pipeline execution.

