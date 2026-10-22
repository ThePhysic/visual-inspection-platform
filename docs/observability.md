# Operational observability

## Audit before Task 05C changes

Fastify/Pino already log HTTP requests (`reqId`); acceptance persists that same
identifier as `requestId`. The worker logs claims, attempt IDs, transitions,
duration and safe failure codes. MongoDB stores acceptance/start/completion
timestamps and the bounded application attempt count. Reconciliation logs expired
ownership and dispatch errors. Readiness distinguishes admission dependencies
from Redis; the worker health file checks connectivity and bounded active work.
Existing reliability tests establish token ownership, duplicate delivery, lease
recovery and retry exhaustion.

Gaps: HTTP and pipeline field names differ; dispatch logs omit request/generation
context; there are no request/attempt counters, duration distributions or queue
snapshots. Provider-reported mock duration is deliberately zero, not measured
runtime. A BullMQ completion event can also describe a no-op delivery, so it
cannot count authoritative completed inspections.

Task 05C instruments these existing boundaries; it does not change attempts,
leases, dispatch, committed predictions or public API contracts.

## Correlation and diagnosis

HTTP logs now use `requestId`, the same Fastify identifier returned in
`X-Request-Id` and error envelopes. Acceptance logs carry `inspectionId`,
`assetId`, `acceptanceRequestId` and `dispatchGeneration`. An idempotent replay
has a new HTTP request ID but retains the original acceptance ID. Dispatch and
worker logs carry that persisted `requestId`, inspection/asset IDs, generation,
`jobId`, and (after claim) `attemptId`/`attemptCount`. Manual retry events also
carry `retriedFrom`. These are log fields, never metric labels.

```sh
docker compose -p vip-demo logs --no-color --tail 500 api worker
# POSIX example; PowerShell equivalent: ... | Select-String 'INSPECTION_ID'
docker compose -p vip-demo logs --no-color api worker | grep 'INSPECTION_ID'
```

Start with an inspection ID from its detail URL. Find acceptance, dispatch,
claim and terminal/retry events. Follow generation and attempt ID when ownership
changes. Use the acceptance request ID to find its original HTTP request.
Fastify's existing request IDs are process-local and may repeat after restart;
use inspection ID and attempt ID as well when correlating across restarts.
`Dispatch pending` means MongoDB intent remains; check Redis and reconciliation.
No claim after dispatch: inspect queue connectivity and the worker health file.
`Stale result ignored` means a token/generation/lease no longer owns that write;
check the successor attempt rather than treating the old result as authoritative.
For failure codes, follow [reliability guarantees](reliability.md); avoid deleting
volumes as a troubleshooting step.

## Operator access and process boundaries

Compose enables **API port 9464 and worker port 9465, each bound to 127.0.0.1
inside its own container**. Neither is published or routed through nginx.
They expose process-local `/metrics`; only the API operator listener has `/queue`.
There is no metrics endpoint on the public Fastify API. Only exact GET paths are
accepted; dependency sampling fails with a safe 503 after a bounded wait.

```sh
docker compose -p vip-demo exec -T api node -e "fetch('http://127.0.0.1:9464/metrics',{signal:AbortSignal.timeout(3000)}).then(r=>r.text()).then(console.log)"
docker compose -p vip-demo exec -T worker node -e "fetch('http://127.0.0.1:9465/metrics',{signal:AbortSignal.timeout(3000)}).then(r=>r.text()).then(console.log)"
docker compose -p vip-demo exec -T api node -e "fetch('http://127.0.0.1:9464/queue',{signal:AbortSignal.timeout(3000)}).then(r=>r.text()).then(console.log)"
```

Native execution opts in with `API_OPERATOR_PORT=9464` and
`WORKER_OPERATOR_PORT=9465`; access each on host loopback. No monitoring consumer
is required for processing. Registries reset independently on process restart;
they are neither persisted nor aggregated across replicas. Local OS/container
access is the trust boundary, not authentication. Do not publish these ports.

The pinned [official Prometheus Node client](https://github.com/prometheus/client_js)
is published as `@prometheus-io/client` (the successor to deprecated `prom-client`).
Its transitive OpenTelemetry API dependency does not enable a tracing SDK,
exporter or collection service here. No tracing infrastructure is introduced.

## Metrics and definitions

Names below have the `vip_` prefix. Durations end in `_seconds`; counters in
`_total`. Histograms have cumulative buckets at **1, 5, 10, 25, 50, 100, 250,
500 ms; 1, 2.5, 5, 10, 30, 60 seconds**, plus infinity. These cover fast local
requests and existing execution/lease/reconciliation scales; they are diagnostic
bins, not SLOs. Benchmark percentiles use individual samples instead of bins.

| Metric | Labels | Meaning |
| --- | --- | --- |
| `http_requests_total` | allowlisted route template, method, status class | One completed response; unknown routes/methods collapse to bounded labels |
| `http_request_duration_seconds` | route, method | Monotonic onRequest to onResponse, including streamed content; aborted requests without onResponse are excluded |
| `http_errors_total` | validation/conflict/not_found/dependency/internal/request | One HTTP error response, not one exception/hook invocation |
| `inspection_attempts_started_total` | none | Successful MongoDB claims |
| `inspection_attempts_finished_total`, `inspection_attempt_duration_seconds` | completed/retry/failed/stale/persistence_error | Observed claimed attempts; not queue delivery counts |
| `provider_duration_seconds` | returned/error/cancelled | Measured invocation until return/error or observed cancellation, excluding image reads; an uncooperative provider may keep running afterward |
| `inspection_deliveries_ignored_total` | invalid/unclaimed | No application attempt executed; unclaimed includes duplicate, stale generation, terminal and not-due records |
| `inspection_failures_total` | retry/terminal, allowlisted failure code | Acknowledged failure state transitions |
| `inspection_terminals_total`, `inspection_terminal_latency_seconds` | completed/failed | Acknowledged conditional terminal updates; creation-to-terminal persisted wall timestamps, with negative clock shifts clamped |
| `dispatch_total` | added/present/finished/error | Dispatch observations during repair, not unique inspections |
| `reconciliation_total` | ok/error | Completed repair passes; concurrent callers sharing a pass do not multiply observations |
| `lease_repairs_total` | queued/failed | Acknowledged expired-lease repairs |

Health/readiness traffic has distinct route labels and can be excluded from
application request analysis. No IDs, filenames, cursor values, image contents,
review snapshots or arbitrary error messages are metric labels.
HTTP error categories are status-derived: the 503 `dependency` bucket also
includes ingestion-busy responses. Use the logged safe `failureCode` to diagnose
the particular cause rather than inferring it from that aggregate category.

Attempt duration starts after the successful claim response and includes image
loading, provider invocation, validation and completion/failure persistence.
Structured terminal logs include monotonic `attemptDurationMs` and
`providerDurationMs`. The existing persisted `processingDurationMs` retains its
original definition, ending before completion persistence. Mock
`result.durationMs=0` remains deterministic and is not a runtime measurement.

`/queue` samples waiting/active/delayed/completed/failed/paused BullMQ counts and
separately aggregates the four MongoDB lifecycle totals. It is on-demand, with a
2.5-second response deadline, existing Redis command bounds and a 1-second MongoDB
aggregation deadline. Counts are not transactionally simultaneous. Retained or
removed Redis deliveries do not correspond one-to-one with business records.
MongoDB aggregation can scan status index entries; do not scrape it frequently
for a large database. It is not run on normal API requests or processing paths.
A successful reconciliation pass means its bounded scan finished; dispatch
errors can still occur within that pass. Check dispatch outcomes and MongoDB
queued state as well, rather than treating a pass counter as execution readiness.

Metrics are best-effort observations. A crash or lost MongoDB acknowledgement
can omit an increment after an authoritative commit. A process crash can leave
starts unmatched by finishes. MongoDB records remain authoritative; metrics are
not exactly-once business accounting, an audit history or a replacement for
the existing worker health/progress mechanism. Logs are not centrally retained.

Container validation exposed a recovery-test timing race: Compose can reject an
already-unhealthy running worker immediately after its dependency is restored,
even while the consumer resumes work. The harness now waits up to 45 seconds
for the actual Docker health observation before its existing Compose/API checks;
it does not restart the worker, relax health criteria, or change queue semantics.
