# Reproducible performance measurements

All inference is **simulated**, using the unchanged deterministic mock provider.
These measurements characterize application orchestration, not computer-vision
accuracy or real-model throughput. No cloud performance is inferred.

## Run

Requires the repository's Node 24.22.0/pnpm 10.34.7, installed dependencies,
Docker Desktop/Engine plus Compose, and enough resources for the normal five
services. Run from the repository root without other load tests:

```sh
pnpm benchmark
# Bounded customization; defaults shown except optional diagnostics:
pnpm benchmark --count 8 --concurrency 4 --history-size 200 --history-samples 10 --poll-ms 100 --duration-ms 120000 --keep-logs
# Only when the documented CI MongoDB/kernel compatibility mode is needed:
pnpm benchmark --count 2 --concurrency 2 --history-samples 2 --ci-mongodb
```

Each run builds real production images and starts a new generated
`vip-reliability-<32 hex>` project through the existing isolation harness. It
never accepts a personal project name or target URL. Containers, network and
three volumes have checked ownership labels; private database namespaces and
dedicated Redis/image storage are verified. Before workload mutation, the
in-container script checks that its MongoDB URI matches that exact project.
Only loopback host ports are published. Cleanup re-verifies resource ownership
and removes only this disposable environment in `finally`, including failure
paths. Existing `vip-demo`/`vip-native` data is never a benchmark target.

Results overwrite `.tools/benchmark-latest.json` and `.txt`; `--keep-logs`
overwrites one bounded `.log` (last 100 service lines, capped at 1 MB). Containers
are not retained. Copy a particular result explicitly before the next run;
default execution does not accumulate an unbounded archive. A hard kill of the
host harness can bypass cleanup; inspect its printed project/ownership override
before removing resources. No Docker-wide prune is used.
Benchmark-built image tags also receive unique ownership labels and are removed
only after label/tag verification; shared BuildKit cache layers may remain.
Ordinary reliability-test image retention is unchanged.

## Workload and measurement definitions

- Upload the committed `fixtures/inspections/panel.png` once through nginx/API.
  Results record input/canonical byte counts, SHA-256, type and dimensions.
  Steady-state inspection measurements reuse this canonical asset; they do not
  include image-upload latency or broad image-size coverage.
- Record the first inspection after container readiness separately. This is a
  **first-request observation**, not an uncached host boot benchmark. Two more
  sequential inspections warm the path; neither contributes to steady-state
  percentiles or throughput.
- Baseline offers `count` inspections sequentially. Moderate offers the same
  count with `concurrency` outstanding lifecycles. The worker remains concurrency
  **one**. This is closed-loop offered load, not a fixed external request rate.
- HTTP acceptance latency measures request start through parsed 202 response,
  including proxy/network and durable MongoDB acceptance. Each intentional
  inspection uses its own key; no automatic POST retry hides uncertain responses.
- Visible latency measures receipt of acceptance to the first terminal API read.
  Polling is sequential per inspection at `pollMs`; it adds observation delay.
  Persisted creation-to-terminal and creation-to-last-processing-start timestamps
  are reported separately, with observed wall-clock visibility lag. Cross-process
  wall timestamps assume aligned clocks; monotonic elapsed measurements do not.
- Completion throughput is successful unique inspections divided by the entire
  scenario observation window. Accepted rate uses its separately reported
  submission window; it is not completed throughput. Failures, HTTP errors,
  timeouts, incomplete accepted jobs and unsubmitted work are counted explicitly.
  `planned` includes unsubmitted work; `offered` counts actual submission starts.
  Accepted counts mean confirmed 202 responses; `acceptanceUnconfirmed` records
  failed submissions whose server-side commit outcome may be unknown. They are
  never silently retried or counted as successful completions.
- Worker attempt and provider distributions come from real structured worker
  lifecycle logs matched to measured inspection IDs. The report includes logged
  sample counts. They are not the mock's constant `result.durationMs` and do not
  include warm-up/history seeds. Missing logs reduce evidence, not sample counts
  of authoritative terminal reads.
- History seeds valid completed fixtures directly into **only the disposable
  database**, up to the requested total size; they are explicitly excluded from
  processing throughput. Measurements cover status-filtered first pages and
  cursors after three pages, limits 20 and 50. Cursor discovery is untimed setup.
  Reports include actual dataset size, seed count, indexes, returned page sizes,
  individual samples and errors. Insufficient depth is explicitly recorded.

All latency distributions use milliseconds, sample count and nearest-rank p50/
p95. A p95 from eight samples is effectively the maximum, not a precise tail
estimate. No p99 or narrow CI performance threshold is asserted. Defaults are
8+8 measured inspections, concurrency 1/4, 200 history records, 10 reads per
page case and 100 ms polling. Bounds are 2–40 inspections per scenario,
1–8 concurrency, 100–2000 history records, 2–50 reads, 50–1000 ms polling and
30–180 seconds of workload. Individual terminal waits stop at 30 seconds;
requests stop at five seconds or the remaining workload deadline. Build/startup
have separate bounded operational waits and do not count as steady state.
The load generator runs inside the API container and sends real HTTP requests
through nginx. It shares resources with that API; host/browser/public-network
latency is not measured.

The report records host/container OS, CPU, runtime, Docker VM CPU/memory/kernel,
MongoDB/Redis versions, worker concurrency, fixture details, policy/configuration,
timings and raw process metrics. CPU/memory values describe reported environment,
not a reserved allocation or utilization measurement. Docker cache state, host
contention and filesystem/cache effects influence results. Single-host shared
storage and the existing five-second reconciliation cadence remain unchanged.

## Correctness coverage and interpretation

`pnpm test` includes benchmark argument, accounting, concurrency, isolation,
cleanup and log-extraction tests. Existing real integration tests verify metric
counts for duplicates, retries, cancellation, stale attempts and unavailable
Redis. Container smoke checks both local operator listeners and the absence of
public API metrics. CI runs a two-inspection-per-scenario harness smoke without
performance thresholds; larger runs are explicit operator work.

Compare API acceptance against persisted/visible latency before attributing
delays to inference. Queue delay can dominate even when the mock is fast.
History timing alone does not identify MongoDB versus filesystem bottlenecks;
claim only what the measurements establish. No speculative optimization, retry
policy change or real-inference performance claim belongs to this milestone.

## Observed Task 05C results

Executed **2026-10-22 UTC** (2026-10-21 local), consecutively after the reliability
and browser suites had finished. Machine-readable evidence:

- [200-record history run](performance-results/task05c-windows-history-200.json),
  workload 01:28:27–01:29:31 UTC.
- [1,000-record history run](performance-results/task05c-windows-history-1000.json),
  workload 01:30:58–01:32:02 UTC.

Both used Windows 10.0.26200, AMD Ryzen 9 7940HS, approximately 32 GB host RAM;
Docker Desktop engine **29.9.1**, **16 logical CPUs**, 16,353,484,800 bytes VM RAM,
WSL2 kernel **6.18.54.1**; Linux x64 containers, Node **24.22.0**, MongoDB
**8.0.34**, Redis **8.2.8**, one API and one concurrency-one worker. No individual
container CPU/memory quotas were configured; Redis retains its 256 MiB noeviction
setting. Docker base images, exact image IDs, execution policy, current indexes,
host/runtime metadata and process metric snapshots are in the JSON. Source was
an explicitly recorded dirty working tree; the recorded HEAD alone does not
include the uncommitted Task 05C changes. There was no deliberate competing load;
host contention was not independently controlled.

The fixture was **PNG, 64×64, 189 bytes**, both before and after canonicalization,
SHA-256 `9b28b8449555da30966b470b427c4286a7fcca8980754d2953861f9c31c5119c`.
Each run recorded one first post-startup inspection and two sequential warm-ups,
then eight baseline and eight moderate inspections. The measured scenario windows
were about 39.95/10.05 seconds and 39.97/10.01 seconds respectively. All **32
measured inspections completed**, with **zero errors, terminal failures,
timeouts, unknown acceptances or incomplete jobs**. Each worker distribution has
eight logged attempts and eight acknowledged completions. All **80 timed history
reads succeeded**; setup/cursor-discovery reads and history seeds are excluded.

All latency cells below are **p50 / p95 milliseconds**, each with **n=8**.
The history size identifies that run's later history phase; inspection scenarios
ran before seeding, against the small fresh database in both runs.

| Measurement | Run 200: sequential | Run 200: four outstanding | Run 1,000: sequential | Run 1,000: four outstanding |
| --- | ---: | ---: | ---: | ---: |
| 202 acceptance | 12.370 / 13.859 | 13.916 / 36.266 | 10.880 / 15.912 | 13.762 / 38.312 |
| Terminal visible after acceptance | 4955.314 / 5046.764 | 4962.566 / 5070.846 | 4965.422 / 5060.824 | 4939.452 / 5045.799 |
| Persisted creation to terminal | 4926 / 4980 | 4957 / 4974 | 4919 / 4977 | 4910 / 4968 |
| Creation to processing claim | 4916 / 4972 | 4949 / 4969 | 4913 / 4970 | 4904 / 4963 |
| Worker attempt | 7.340 / 13.768 | 6.193 / 7.405 | 7.195 / 10.589 | 5.592 / 6.992 |
| Mock provider invocation | 0.077 / 0.135 | 0.044 / 0.062 | 0.082 / 0.119 | 0.043 / 0.085 |
| Terminal visibility lag, wall clock | 45 / 85 | 77 / 107 | 65 / 109 | 36 / 92 |
| Offered requests/s, submission window | 0.229 | 1.565 | 0.229 | 1.609 |
| Completed inspections/s, entire scenario | 0.200 | 0.796 | 0.200 | 0.799 |

First post-startup observations remain separate: run 200 acceptance was
24.492 ms and terminal visibility 3429.862 ms (one sample). This does not measure
an uncached machine boot or establish a cold/steady-state performance difference.
Warm-up and the corresponding run 1,000 observation remain in the JSON.

History values are **p50 / p95 milliseconds, n=10 per cell**, zero failures:

| Page | 200 records | 1,000 records |
| --- | ---: | ---: |
| First, limit 20 | 6.484 / 6.963 | 6.817 / 10.398 |
| After three pages, limit 20 | 6.125 / 8.664 | 6.411 / 8.192 |
| First, limit 50 | 7.892 / 9.221 | 6.204 / 7.881 |
| After three pages, limit 50 | 7.908 / 13.636 | 7.139 / 10.401 |

The observed delay accumulated predominantly **before claim**, consistent with
the unchanged five-second reconciliation cadence. With four outstanding
inspections, completed throughput was about four times the sequential workload,
while per-inspection latency stayed near five seconds. This is workload evidence,
not a measured code optimization or maximum sustainable throughput. Provider time
is tiny for this synthetic fixture and says nothing about real models. The 100 ms
polling interval adds observable lag, separately reported above.

There is no demonstrated history-size bottleneck at these modest sizes. These
end-to-end timings do not isolate MongoDB from proxy, client, or filesystem costs;
no component-specific bottleneck or optimization benefit is claimed. Follow-up
work should first decide whether the existing dispatch cadence meets demo needs,
then collect larger samples and representative image sizes before proposing an
optimization or performance objective.
