# Final browser, HTTP and resource verification

The final source implements the [accepted SA-2 policy](../sa-2/browser-boundary.md) without a SA-3 application change. Every API request needs a permitted syntactically valid Host. Defaults admit `127.0.0.1`, `localhost`, `[::1]`; Compose additionally admits private `api`/`web` callers. API rejection is 421 JSON; nginx's local-host filter can reject earlier with 421 HTML. nginx forwards `$http_host`, retaining the browser-facing port. Fastify does not trust forwarded host/protocol headers.

GET/HEAD do not require matching Origin. Other methods, including OPTIONS, allow an absent Origin for native clients; when present it must be the exact serialized HTTP(S) origin matching request protocol and host/port. Null, empty, malformed, multiple, userinfo/path/query/fragment and mismatched scheme/alias/port Origins receive 403 before body parsing, staging or business handlers. This is not authentication against native clients. Native Vite's relative `/api` proxy and nginx's same-origin workflow remain compatible.

## Preserved before/after chain

| Evidence phase | Unrelated loopback multipart | Framing / Host |
| --- | --- | --- |
| [Original SA-1](../sa-1/evidence/browser-origin.json) | Synthetic asset count 7 → 8; browser cannot read response | Framing allowed; arbitrary Host accepted; no public exploit demonstrated |
| [SA-2 before](../sa-2/evidence/browser-before.json) | 0 → 1 | Same prerequisites reproduced |
| [SA-2 after](../sa-2/evidence/browser-after.json) | 13 → 13 | Cross-origin frame refused; arbitrary Host 421 |
| [SA-3 fresh candidate](evidence/browser-after.json) | **2 → 2** | Frame refused; arbitrary Host 421; no new CORS response disclosure |

Default **Chromium 156.0.8078.4** was used with no permission grants or security bypass flags. The unrelated page used an ephemeral loopback port. A synthetic HTTPS document was fulfilled locally at `https://sa1-public.invalid`; it made no actual external callback. Matroid traffic was not intercepted. That synthetic origin's loopback denial does not prove every public-site/private-network/browser scenario. CORS TypeError is response confidentiality, not itself proof that a request was rejected; asset counts, direct HTTP status and the early-hook regression establish the tested write result.

[HTTP matrix](evidence/http-after.json) records native no-Origin and matching-Origin uploads returning 201; null/malformed/port/alias/scheme/path/multiple Origins returning 403; unexpected Host returning 421; no mutation on rejection and no residual staging. Three additional framing-route cases cover deep links, missing assets and API health. Direct internal API Host aliases, private operator boundaries and permissions are independently checked in [runtime evidence](evidence/runtime.json).

[Actual same-origin browser capture](evidence/legitimate-browser.json) records matching Origin for multipart upload **201**, JSON/custom-header inspection **202** and review PUT **200**, followed by reload of the saved review and byte-equivalent original prediction JSON. The broader native 18/container 2 browser suites also pass navigation, canvas, history and conflict cases. API and production SPA responses retain XFO `DENY` and CSP `frame-ancestors 'none'`; Vite development UI itself is not served by nginx and does not inherit its SPA headers.

## Privacy and input/resource controls

Canonical image content retains `private, no-store`, expected PNG MIME, 189-byte fixture length, checksum ETag and `nosniff`; integration tests additionally compare actual bytes/checksums and JPEG/PNG geometry. Images still render and can be edited/reopened. No confidential-image authorization, retrospective cache purge, encryption or browser-download prevention is claimed. Hashed frontend bundles retain their separate immutable cache policy.

Dummy query values were absent from **both normal API and nginx access logs**, while request correlation remained present. API logs use route templates; nginx omits query arguments. Unit tests also exclude an arbitrary unknown-path marker. This is not a universal logging/DLP assertion; exceptional diagnostics, path IDs and existing historical logs remain local operational data.

All existing input/storage tests ran in the full real **143-case integration suite**, with no exclusions. Evidence covers inclusive **10 MiB**, over-limit rejection, **20,000,000-pixel** bounds, malformed/multi-frame formats, EXIF rotation/mirroring, metadata stripping, canonical publication, storage/readiness failures and retained published bytes after uncertain inserts. Existing actual client-abort cleanup and two-held-upload/third-503 checks pass. The SA-2 one-slot setting test holds/intercepts a deterministic synthetic write, rejects the second request, interrupts/releases the first, proves empty staging/no records and admits the next upload. It is not a network OOM/slow-stream worst-case benchmark.

`API_UPLOAD_CONCURRENCY` remains 1 or 2, default 2; it cannot increase the established upper bound. There is **no aggregate quota** for assets, orphan bytes or distinct inspection intent. A race-prone count/scan would miss uncertain publication and crash/reservation accounting; the [deferred ledger design](../sa-2/resources-operations.md) remains a proposal. No existing images are deleted and no durably accepted inspection is discarded because of a new quota. Disk filling, OOM, unbounded fuzzing and sustained resource exhaustion were not attempted.
