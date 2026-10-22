# Reliability evidence and recovery boundaries

MongoDB remains authoritative. Redis/BullMQ schedules at-least-once attempts;
inference can execute repeatedly. This milestone adds evidence and operational
checks without changing acceptance, prediction, review, queue, or retry semantics.

## Audit and guarantees

| Mechanism / supported guarantee | Automated evidence | Assumptions and limits |
| --- | --- | --- |
| A 202 follows MongoDB insertion, independently of Redis | `inspections.integration.test.ts`: dispatch failure after acceptance; container `redis-down` phase checks the document directly | MongoDB acknowledged writes and its persistent disk remain intact. No distributed transaction or host-loss guarantee |
| Persistent submission identity prevents concurrent duplicate acceptance | Integration: semantic replay/conflict and eight concurrent submissions; manual retry lineage | Distinct intentional keys allow distinct inspections. No claim of exactly-once HTTP delivery |
| Startup/periodic bounded reconciliation repairs queued intent | Integration: startup Redis outage, scan rotation; container: Redis stopped, accepted intent, API restarted, Redis restored | Requires a running reconciler/API and eventual database/queue/consumer availability. No completion SLA |
| Only an owned processing attempt can commit predictions | Integration: duplicate execution, stale attempt after successor, three abrupt child-process interruptions | MongoDB conditional updates guard token/generation/status/lease/result absence. Providers may execute more than once |
| Abandoned processing consumes the persistent attempt budget | Integration: actual lease expiry after child termination; timeout exhaustion and abandoned final attempt | Three application attempts, independent of queue redispatch counts. Fixed lease requires synchronized clocks |
| Completion is one atomic result/state update | Integration: failure before write, failure after commit before queue acknowledgement; container pre-commit MongoDB outage and subsequent recovery | A lost acknowledgement can be ambiguous. Replay/reconciliation resolves authoritative state rather than undoing committed writes |
| Concurrent reconciliation does not multiply lease recovery | Integration: independent concurrent reconcilers produce one new generation and a second successful attempt | No leader election; per-record conditional updates provide arbitration |
| Redis socket loss during processing cannot overwrite a committed result | Integration: controlled TCP proxy disconnects only test consumer sockets at a provider barrier; reconnection acknowledges the unchanged document | Redis data loss/host failure is outside this socket-outage test |
| Review saves preserve predictions and reject stale revisions | `reviews.integration.test.ts`: concurrency, lost response, no-op, bounded receipts, rollback prevention | Current snapshot plus last 32 operation receipts, not a complete immutable audit history; see [reviews](reviews.md) |
| Upload publication precedes metadata success; failures clean known staging | `assets.integration.test.ts`: actual aborted HTTP multipart, malformed/oversized input, failed publication, lost insert acknowledgement | Hard-link publication is atomic on the configured local filesystem. No fsync/power-loss guarantee |
| Filesystem write/canonicalization errors stay distinct from invalid images | Existing `apps/api/test/storage.test.ts`: actual write-to-directory and canonical output failure, interrupted source, missing/incomplete content | These exercise local filesystem errors, not a physically full or failing disk |
| Published bytes survive uncertain database insert outcomes | Integration: commit then lost acknowledgement retains readable bytes; ordinary failed insert retains orphan | Intentional conservative leak until operator investigation. Published-image deletion is not implemented |
| Application state survives ordinary restarts and down/up | Container smoke: API/worker restart, MongoDB/Redis stop/start, full down/up, image checksums, unchanged results/reviews, history, lineage, new processing and Redis marker | Dedicated named volumes retained. No arbitrary disk corruption, backup restore, host power loss, or disaster recovery test |

The new child-process fixture is outside runtime images. It starts a real BullMQ
consumer, synchronizes over private IPC at a provider or collection-write
boundary, and is killed through the exact process handle created by its parent.
Recovery waits for the recorded **actual** two-second test lease to expire.
Production retains the ten-second deadline / thirty-second fixed lease. There
are no production fault environment switches or publicly callable fault routes.

The container pre-commit fixture runs on stdin, with the normal consumer stopped.
It claims an API-accepted record through the real processor and pauses immediately
before the MongoDB completion write. Only after its stdout barrier does the host
stop the owned MongoDB container and release the write. The database error must
reach the processor, not a success response. After MongoDB and the consumer
return, normal reconciliation and lease expiry produce a completed second attempt.
This is a controlled processor execution, not an abrupt container kill at that
write boundary; abrupt OS worker termination is covered by the IPC tests.

## Running the checks safely

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Requires Docker Engine/Desktop + Compose, and installed workspace tooling:
pnpm test:reliability
# Also run all existing integration and native browser tests on these private
# dependency ports, plus the existing browser smoke through containerized nginx:
pnpm --filter @vip/web exec playwright install chromium
pnpm test:reliability --native --browser
```

The harness creates a new `vip-reliability-<32 hex characters>` project; it never
accepts a user project name. Before creation it checks for collisions. Its
generated override is recorded under Git-ignored `.tools/`. All five containers,
three volumes, and the network receive a unique ownership label. API/worker use
a private `vip_reliability_<token>` database, a dedicated Redis instance and
image volume. Temporary loopback-only ports support the optional native tests;
those tests additionally use random databases, queue names, and private storage.

Before every stop/restart/down and final volume removal, the harness verifies
Compose project and ownership labels, allowed service names, and expected data
volume mounts. A mismatch stops disruption/cleanup. Logs are collected on
failure. `finally` removes only this verified disposable project's resources;
ordinary `vip-demo`, `vip-native`, and their volumes are never targets. There is
no prune, FLUSHDB, broad process kill, or user-data fixture modification.

A hard termination of the host harness or runner may prevent `finally` cleanup.
The printed project name and retained override identify resources for inspection;
do not substitute another project name into destructive commands. Built image
tags/cache are retained (no broad image cleanup). Free-port selection can race
another host process; such startup errors fail the run rather than killing it.

CI retains the lint/typecheck/unit/build matrix and real MongoDB/Redis integration
and native-browser job. Its container job runs `pnpm test:reliability --browser --ci-mongodb`,
including the existing packaging/workflow smoke, bounded dependency outages,
offline staging maintenance, restart/recreation checks, and one real browser
workflow. It does not duplicate the entire native suite in that job. CI execution
is separate from local execution evidence; a successful local run does not assert
that a remote GitHub Actions run has occurred.

The [CI MongoDB compatibility environment](ci-mongodb-compatibility.md) retains
MongoDB 8.0.34 and asserts its non-per-CPU allocator mode without relying on an
Ubuntu label to pin the runner kernel. Native CI uses `pnpm test:ci:integration`
to run the same integration and browser suites after explicit dependency startup.

## Storage maintenance

No cleanup runs automatically during API startup or ingestion. With the standard
full-Compose layout, these optional operator commands require host Node/pnpm and
Docker (normal full-container application use still requires Docker only):

```sh
# Read-only, database-checked report; safe to run while application is online.
pnpm storage:maintenance vip-demo
# Schedule a maintenance window. Stop all image-volume users first.
docker compose -p vip-demo stop api worker
pnpm storage:maintenance vip-demo clean-staging-offline
docker compose -p vip-demo up -d --wait
```

The report lists staging candidates and possible unreferenced canonical images,
and a `truncated` flag after 1,000 root entries. The library supports an explicit
bounded limit up to 10,000 and a longer age. Minimum age is **24 hours**, checked
on the staging directory and each file. Unknown names/entries, fresh files,
symlinks, subdirectories and nonregular files are skipped. The configured root
must have no symlink components. Canonical candidates use server storage-key
syntax and are checked against the authoritative `assets.storageKey` index with
a healthy database before and after scanning. A report is not proof of orphan
ownership: an uncertain or in-flight MongoDB write may still establish a reference.

Windows path spelling needs special care: `resolve()` can retain DOS 8.3 names
or alternate casing while `realpath()` returns long, on-disk names. These are
valid aliases, not proof of a junction. Maintenance accepts a differing Windows
spelling only after checking its lexical directory entries for symlinks/junctions
and matching the original/canonical directory's BigInt device and file IDs. It
then operates on the canonical path. It does not lowercase paths to infer
identity. POSIX retains the strict canonical-path comparison. Root links,
ancestor junctions and staging links remain rejected/skipped; offline exclusivity
and the existing age/database safeguards still apply. No path diagnostics are
enabled in normal execution.

The Windows regressions exercise actual case variants, extended paths and DOS
aliases read through Windows' filesystem API. The DOS-specific test is explicitly
reported as unsupported if a volume provides no short alias. Junction security
tests run without requiring Windows file-symlink creation privileges. POSIX runs
the same junction cases as directory symlinks and additionally checks distinct
case-sensitive directories; platform-specific spelling tests are conditional.

Only the real DOS-alias regression has a 20-second test deadline to accommodate
cold PowerShell/COM startup on Windows runners. Its owned alias-lookup process
still has a separate 10-second limit with forced termination; it must settle
before fixture cleanup. CI records phase durations (staging, alias lookup,
identity and cleanup) without filesystem paths. Set `VIP_TEST_TIMINGS=1` to
record the same diagnostics locally; use Vitest's `--reporter=verbose` to see
them on successful runs as well. Other test deadlines and production filesystem
checks are unchanged.

**Published images are never deleted**, whether referenced, orphaned, or associated
with an inspection whose asset reference needs investigation. There is no orphan
apply option. This avoids destroying bytes after a lost insert acknowledgement
or introducing a distributed upload/deletion coordinator.

Staging apply verifies the project's actual API container, image-volume mount,
volume label, and network. It refuses while **any** running container mounts that
volume, then uses a uniquely named maintenance container to exclude another
maintenance invocation. It rechecks age/type, removes only `input`/`canonical`
files and their now-empty `.upload-XXXXXX` directory, and never recursively deletes.
Database failures fail closed. The maintenance container uses UID 1000, a
read-only root filesystem, and only the image volume writable. Report mounts it
read-only. No application services are started or stopped by this operator tool.

The operator must keep writers stopped throughout maintenance, including other
Docker clients or processes accessing the volume outside the standard Compose
layout. This is an explicit offline operational boundary, **not** a filesystem
lock against a concurrent administrator starting an API. Nonstandard shared
mounts/remote writers are unsupported; do not apply staging cleanup there. Age
alone never establishes an active upload is abandoned. CI tests refusal with live
writers, then removal in a verified disposable maintenance window and subsequent
readability of existing saved images/reviews. Unit tests cover healthy-DB and
exclusivity failures, fresh/unknown entries, symlink boundaries, and bounded scans.

## Consumer supervision

Compose sets `WORKER_HEALTH_FILE=/tmp/vip-worker-health.json`. Every five seconds
the consumer samples a bounded MongoDB ping, both normal/blocking Redis connection
states, BullMQ running/paused state, oldest active delivery and last completion.
It writes an atomic local heartbeat, outside the read-only image mount. The Docker
probe rejects missing/expired (>15 seconds), unhealthy, or implausibly future
observations. Active work older than lease plus ten seconds is unhealthy. Shutdown
removes the file. Native execution opts in only when this environment variable is
set; no extra service/port is introduced.

Process liveness, connection readiness, and observed job progress remain different.
An idle connected worker can be healthy without recent completions. A fresh health
file does not prove every queue job is schedulable, repair is running, or a future
provider will make useful progress. Completion assertions in smoke tests establish
actual consumption. Redis-outage checks verify an alive process reports unhealthy;
unit tests cover disconnected/paused/overdue states and publication/cleanup.
Docker `restart: unless-stopped` restarts exits, **not** unhealthy containers.

## Remaining limitations

- MongoDB and Redis have separate persistence systems. There is no exactly-once
  execution, distributed transaction, or zero-data-loss claim under arbitrary
  host/storage failure. Default acknowledged standalone MongoDB writes and Redis
  AOF `everysec` are not coordinated backups or high availability.
- Recovery depends on reconciler availability and bounded scan throughput. No
  lease renewal, distributed leader election, or end-to-end recovery SLA is added.
- A deadline does not terminate an uncooperative provider or CPU-bound work. Tokens
  reject stale persistence; they cannot cancel every resource-consuming task.
- Storage is single-host, shared local filesystem. It limits topology and requires
  consistent database/image backups, which are not implemented here.
- Tests do not simulate power loss, fsync ordering, disk corruption/full hardware,
  arbitrary network partitions, multi-region failover, or every possible crash
  interleaving. Filesystem errors and uncertain writes use controlled injection;
  container outages exercise real dependency processes in a disposable project.
- No authentication/public deployment hardening, metrics platform, tracing, load
  benchmarking, or real ML inference is introduced. Task 05C remains separate.
