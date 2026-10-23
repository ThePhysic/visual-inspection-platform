# Matroid browser and runtime assessment

Dynamic assessment used only an owned disposable environment. [Isolation evidence](evidence/isolation.json) was recorded before startup. The source baseline, ordinary Compose file and existing CI MongoDB allocator override were retained. A generated audit-only override supplied ownership labels, a unique database namespace and assigned loopback ports; existing runtime configuration files were not edited.

## Isolation and test bounds

Project `vip-reliability-0c17e342f20a4fcba92b975aba08ffb6` owned its five service containers, default network and three named volumes. Its database was `vip_reliability_0c17e342f20a4fcba92b975aba08ffb6`; MongoDB and Redis used dedicated disposable server instances. Web/MongoDB/Redis host ports were **57952/57953/57954**, all on `127.0.0.1`. The actual owner label, image identities, ports and mounts were verified before probes and cleanup. MongoDB 8.0.34 reported `usingPerCPUCaches: false` with the approved CI override.

The retained `vip-demo_images`, `vip-demo_mongodb-data` and `vip-demo_redis-data` volumes were not mounted or queried. No `vip-demo` containers existed before or after assessment. No unrelated service was started/stopped, and unrelated container identities/states and volume inventory matched after cleanup.

Custom HTTP requests used 550 ms spacing, no more than 50 requests per logical case, and at most two concurrent incomplete uploads plus one admission probe. The entire custom resource script issued 48 completed HTTP requests plus three deliberately interrupted streams. No disk filling, OOM, brute force, uncontrolled fuzzing, external callback or exploit execution was attempted. Existing deterministic integration cases used private test databases/queues and bounded fixtures; two eight-submission cases were deliberately deselected. Native E2E used independently verified free loopback ports 3003/4174, a generated browser-test database/storage directory and database 15 of the audit Redis server.

Only synthetic PNG/JPEG, malformed small containers, a single 10 MiB-plus-one-byte boundary payload, a tiny PNG with an over-cap dimension header, dummy metadata and query markers were used. The dimensional fixture tests rejection before decoding; it is not a decompression-bomb test. Scanner artifact work had separate bounds and never targeted retained data.

## Browser origin and HTTP boundaries

[browser.mjs](repro/browser.mjs) used **Chromium 156.0.8078.4** with default Playwright browser protections, no permission grants and no `disable-web-security` or local-network bypass flag. The final run left Matroid traffic unintercepted so browser preflight behavior was genuine. Only `https://sa1-public.invalid` was fulfilled locally as synthetic HTML; it never used external DNS/networking. That synthetic origin is not a real public server and does not establish behavior for every public network/browser configuration.

| Case | Final observation | Security interpretation |
| --- | --- | --- |
| Multipart Blob from `http://127.0.0.1:56898` | Asset count **7 → 8**; JavaScript received CORS `TypeError` | Browser response confidentiality did not prevent this state change from another loopback origin |
| JSON plus `Idempotency-Key` from that origin | Browser rejected preflight; server OPTIONS 404; inspection count unchanged | No creation request admitted through this tested preflight path |
| Review PUT from that origin | Browser rejected preflight; server OPTIONS 404 | No demonstrated cross-origin review mutation |
| History GET from that origin | Response unreadable due missing ACAO | Publicly reachable by an allowed local API caller, but not readable by this cross-origin script |
| iframe from that origin | SPA navigated/rendered; parent could not read its document | Framing permitted; same-origin document confidentiality retained. No clickjacking action chain tested |
| Multipart/JSON/PUT/history from synthetic public HTTPS origin | Permission denied for loopback address space; no new asset or inspection | This browser configuration blocked the tested public-origin simulation; no general browser/version guarantee |
| iframe from synthetic public HTTPS origin | No Matroid child frame navigation observed | No successful public-origin framing established here |
| Direct HTTP with `Host: sa1-rebinding.invalid` | Health 200 | Arbitrary Host accepted; no DNS rebinding chain tested |

[Browser console/CDP observations](evidence/browser-origin.json) distinguish attempted browser requests from server-received requests. CDP `requestWillBeSent` alone is not proof of arrival. [Selected server log evidence](evidence/http-followup.json) supplies actual OPTIONS 404 for the local-origin preflights; database before/after counts prove the multipart effect. No claim of cookie-based CSRF or cross-origin image/history exfiltration follows from these observations.

## Upload and resource controls

[HTTP/resource evidence](evidence/http-resources.json) contains 51 initial assertions. **49 matched their expectations; two expected 404 at nginx SPA paths and were corrected through two passing follow-up checks**, without changing the application. Those original expectation failures remain visible and are not counted as vulnerabilities.

| Boundary | Observed result |
| --- | --- |
| Filename/type trust | Actual PNG accepted with `../../SA1_ESCAPE.png` and declared `text/html`; canonical response/storage remained PNG |
| Format/container checks | SVG 415, truncated PNG 422, APNG declaration 415 |
| Multipart limits | Unknown file field, invalid source and second file rejected 400; 10 MiB plus one byte rejected 413 |
| Pixel bound | Tiny fixture declaring 5001 × 4000 pixels rejected 413 before decoding/publication |
| Canonical orientation/metadata | Synthetic EXIF-orientation-6 JPEG became 5 × 8; canonical EXIF absent |
| Interrupted upload | Real chunked connection aborted; asset count unchanged and staging returned to zero |
| Simultaneous admission | Two held incomplete uploads occupied two staging directories; third upload returned 503 `INGESTION_BUSY`; both aborts released staging |
| Repeat valid uploads/submissions | Three uploads retained three assets and 567 canonical bytes; six new keys retained six inspections. Expected persistence, no aggregate quota claim |
| Readiness | Five successful probes left asset, inspection, file and byte counts unchanged; source inspection confirms temporary staging/link work still occurs |
| Memory | One post-probe API observation was **149.2 MiB**, with no configured container memory quota. This is not peak memory, capacity, or a worst-case near-20-MP decode measurement |

Canonical content carried the expected JPEG/PNG type, `nosniff`, checksum ETag and public immutable caching. Rejected uploads left no staging files. The existing integration cases additionally exercised inclusive 10 MiB acceptance, MPO rejection, mirrors, publication/storage failures and uncertain database acknowledgements. No physical full-disk or failing-disk experiment was performed.

The bounded resource-growth observations support SA1-03's accepted local-demo limitation. They neither demonstrate nor rule out denial of service by large sustained workloads. Slow streams were aborted early; the full 30-second Fastify request-timeout and nginx timeout interaction were inspected in source but not driven to worst-case expiry. Parser source also shows a 1 MiB default JSON body limit; no assumption that multipart uses that limit replaces its separate checks.

## API and persistence integrity

Sampled HTTP cases rejected invalid/nonexistent IDs, limits 51/00, duplicate limit parameters, operator-shaped query input, bad cursors, extra query fields, operator-shaped asset IDs, forged lifecycle/result fields and client review confidence. Rejected inspection inputs created no records. Idempotency replay returned the original inspection; conflicting content returned 409. Valid review save succeeded; stale review save returned 409 and original results remained byte-equivalent in the returned JSON representation. Public inspection/asset projections omitted request keys/fingerprints, ownership tokens, storage keys and internal receipt state.

The existing selected integration suite executed **139 passed, 0 failed, 2 deselected out of 141 discovered** against the audit-owned MongoDB/Redis servers. [Per-case results](evidence/integration-tests.json) include stale attempts, lease recovery, finite retries, Redis interruptions, corrupt persisted asset/configuration/result handling, lost acknowledgements, immutable predictions, concurrent review saves, bounded receipts and rollback prevention. The two eight-request duplicate-acceptance cases were reviewed but not run under this pass's concurrency budget. Their exclusion is not a passing result.

The existing native browser suite executed **18 passed, 0 failed**, including upload/results, zero detections, canvas edits, save/reopen, ambiguous response recovery, two-tab conflicts, history and navigation warnings. It uses controlled response fixtures for some lifecycle/geometry cases; those are not all real-provider transitions. No real ML accuracy or inference-capacity claim is made.

## Runtime privileges and sensitive output

[Actual runtime observations](evidence/runtime.json) confirmed API/worker UID 1000, nginx UID 101 and MongoDB/Redis service PID 1 UID 999. `docker exec id` is root for the official DB images because their configuration leaves `User` empty, while entrypoints drop the service process to UID 999; the distinction is preserved in evidence. It is not a demonstrated service-running-as-root finding.

All inspected service PID 1 processes had zero effective capabilities. App containers were not privileged, the worker image mount was read-only and the image root was `1000:1000`, mode 0700. Read-only root filesystems and per-service CPU/memory quotas were not configured. The default network was a shared bridge with `internal: false`, not per-service isolation. Audit-only MongoDB/Redis host bindings were loopback; ordinary Compose publishes only web. This assessment did not inspect host-wide firewall/tunnel configuration.

Direct Fastify `/metrics`, `/queue` and `/api/v1/metrics` returned JSON 404. Container-loopback API operator `/metrics` and `/queue` returned 200; nginx `/metrics` and `/queue` returned SPA HTML, no metric series. No operator port was published or reachable through an nginx operator mapping. Source confirms exact GET path allowlisting and private bind addresses. All five running containers had health checks; Trivy's Dockerfile-only warning is a deployment-context false positive.

Synthetic logs showed caller-controlled query strings in normal access logs and no raw metadata marker in the inspected window. This is not an all-secret/all-log proof. No real credentials, customer images, full environment dump or production data were used. Public image caching remains appropriate only under the stated local/synthetic-data assumption.

Cleanup removed only ownership-verified audit resources. [Preservation evidence](evidence/preservation.json) records unchanged source/index and unrelated inventories. Runtime failures of arbitrary hardware, restore operations, other browser engines and stronger deployment boundaries remain outside the exercised scope.
