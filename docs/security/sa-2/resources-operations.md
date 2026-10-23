# Resource, privacy and operational decisions

Selected findings: SA1-03, SA1-05 and narrow parts of SA1-06. These remain accepted local-demo limits/opportunities, not confirmed vulnerabilities.

## Admission and retention

`API_UPLOAD_CONCURRENCY` accepts **1 or 2**, default **2**. It can reduce concurrent image work on a constrained native runtime or through an explicit Compose environment override; it cannot increase the established maximum. Invalid values fail startup. Admission still returns deterministic 503 `INGESTION_BUSY` before staging when slots are occupied, and `finally` releases a slot after successful, rejected or interrupted uploads. Existing 10 MiB inclusive input, 20,000,000-pixel inclusive bound, 80 MiB post-encoding output, one-file/two-part multipart policy, Sharp cache/concurrency and timeouts are unchanged.

The existing two-upload gate plus third-request rejection test still passes. A new deterministic integration test configures one slot, holds a synthetic write, verifies 503 for the second request, interrupts the first, checks empty staging/no records, then accepts the next upload. Existing genuine disconnected-client, inclusive byte cap, EXIF rotation/mirroring, metadata stripping, image validation, storage failure and uncertain MongoDB acknowledgement cases all pass in the full 143-case suite. No full-disk/OOM or sustained capacity test was performed.

**No aggregate quota was implemented.** Assets, distinct inspections and conservative published orphans can grow. A database count omits uncertain published files; a directory scan plus process-local counter cannot safely coordinate publication, concurrent reservations, restart/crash recovery or another writer. A quota checking only before insertion can race; releasing a reservation on an uncertain acknowledgement can undercount durably accepted work. Introducing such accounting would exceed this small change's safety/architecture bounds.

A concrete deferred design is:

1. Define separate configurable count/byte capacities for **new asset admission**, including reserved maximum canonical bytes and retained orphan bytes. Establish a supported single-writer or shared persistent reservation authority; fail startup/admission closed if ownership/accounting cannot be established. Do not enable a guessed quota on an existing retained volume.
2. Introduce a durable admission ledger/counter and per-upload reservation identity with atomic compare/reserve. Standalone MongoDB plus filesystem is not a transaction: retain reservations across uncertain publication/insertion, and reconcile conservatively under exclusive operator control after crashes. Account for existing files/records with a bounded inventory and explicit incomplete-inventory failure.
3. Commit reservations only after publication/metadata resolution; never free potentially referenced bytes merely because the client disconnected or a database acknowledgement was lost. Never automatically delete accepted/referenced images. Free demonstrably unpublished reservations through an ownership-verified recovery procedure, not an age-only assumption.
4. Asset quota rejection must not affect inspection/review/retry replay on existing records. Any separate inspection-intent limit must look up semantic replay first and preserve durable accepted intent through Redis outages. No worker-side quota may discard accepted inspections.
5. Require separately authorized schema/ledger design and tests for concurrent capacity edges, interrupted writes, lost acknowledgements, process crash/restart, multiple writers, unknown/orphan files, unavailable storage/accounting, exact replay/conflict and retained-data adoption/rollback. A ledger migration must be reversible without deleting images or accepted records.

This is a proposal, not an implemented reservation guarantee. Retention/deletion, backups and operator capacity planning remain local responsibilities. Existing readiness fails on uncertain database/storage availability; no new quota accounting claims follow from it.

## Image privacy and logs

Canonical image content changes from `public, max-age=31536000, immutable` to **`private, no-store`**. MIME, byte length, `nosniff`, checksum ETag, canonical bytes and URLs are preserved. Integration checks compare bytes/dimensions/checksum and the new header; actual native and nginx browser workflows still render/edit/reopen images. This is a safer cache instruction, not access control, encryption, retroactive cache eviction or confidential-image protection. Previously cached responses, browser downloads and user screenshots are untouched.

API normal request logs now contain method, route template (or `unmatched`), status, elapsed time and the same request ID returned in HTTP. Existing asset/inspection/review correlation and safe failure codes remain. Fastify `LogController` disables its raw-URL automatic access entries; explicit hooks emit bounded metadata. nginx uses a defined access format with `$uri`, excluding query arguments, plus upstream request ID/status/timing. nginx paths can still contain record IDs; native framework/proxy diagnostics and extraordinary I/O errors are not a comprehensive data-loss-prevention system. Never put credentials in URLs or use real confidential images under the synthetic local-demo assumption.

Before/after dummy query canaries appeared in both normal API/nginx logs before and neither afterward. The API unit test also excludes an arbitrary unknown-path marker. Current request correlation remains observable in both components. Historical logs/caches were not scrubbed or collected into shared evidence. [HTTP evidence](evidence/http-after.json) retains only presence booleans and safe headers; raw logs are local/private.

## CI and runtime scope

Existing versions now use upstream-verified commits: checkout `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node `949feb2413d6458794dcd2491c4babbbce0c15c1`, and pnpm/action-setup `ea17c68df8912ef543352723c149a84f56e3d413`. The pnpm tag is annotated and was peeled to the commit before final verification. All three checkout steps disable credential persistence. Existing events, `contents: read`, matrix, cache, frozen install, timeouts and guarded test wrappers are preserved. [Provenance](evidence/runtime.json) records exact upstream tag results. Local validation does not establish a hosted workflow run, branch protection or remote token policy.

Unused npm/npx are removed from API/worker final runtime filesystems, with no package-version changes. Builds retain npm/pnpm where installation is needed. Non-root UIDs, `/data/images` permissions, worker read-only image mount, heartbeat/temp writes, health and queue execution pass actual runtime/reliability checks. Previous base/build layers still contain build tooling; no whole-image layer erasure or size-reduction claim is made.

Broader read-only root filesystems, cap/network rewrites, MongoDB/Redis credentials and image version changes were deferred. Their compatibility/operational implications are not justified merely by scanner counts. Application processes retain non-root execution and private operator interfaces, and the original loopback publication remains. No service identity/infrastructure expansion was introduced.
