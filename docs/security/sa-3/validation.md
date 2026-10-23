# Final execution and reproducibility

All commands ran from the repository root using local **Node 24.22.0**, **pnpm 10.34.7** and installed **Chromium 156.0.8078.4**. The frozen application/configuration commit is `b5de38321f2a12b5334b176576ffbcc5ff29eef2`; only the [listed audit harness and documentation changes](evidence/file-inventory.json) differ. Private instructions/config, Git history, retained data and the AI Security Platform were excluded.

## Actual sequence and isolation

```powershell
.\.tools\node.exe docs/security/sa-3/repro/prepare.mjs
# Corrected disposable harness and added its two focused regressions.
.\.tools\node.exe --test infra/benchmark/core.test.mjs
.\.tools\node.exe docs/security/sa-3/repro/setup.mjs
.\.tools\node.exe docs/security/sa-3/repro/validation.mjs
.\.tools\node.exe docs/security/sa-3/repro/boundaries.mjs
.\.tools\node.exe docs/security/sa-3/repro/components.mjs
.\.tools\node.exe docs/security/sa-3/repro/mongo-catalog.mjs
.\.tools\node.exe docs/security/sa-3/repro/image-scans.mjs
.\.tools\node.exe docs/security/sa-3/repro/native-advisories.mjs
.\.tools\node.exe docs/security/sa-3/repro/static.mjs
.\.tools\node.exe docs/security/sa-3/repro/runtime.mjs
```

`validation.mjs` runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, with private logs and exact exits. It intentionally does not query an external package registry. `boundaries.mjs` sequentially runs HTTP, cross-origin browser and legitimate-browser scripts so before/after collection counts cannot race. The native advisory script was corrected to use structured scanner records; unsupported exploratory output was not accepted as coverage.

The broader full suite ran with:

```powershell
$env:PATH = "$PWD\.tools;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.tools\playwright-browsers"
.\.tools\pnpm.cmd test:reliability --native --browser --ci-mongodb
```

This wrapper runs `pnpm test:integration`, `pnpm test:e2e` (including build), container smoke/worker packaging checks, **two** nginx browser tests, controlled Redis/MongoDB interruptions, API/worker restarts, offline storage maintenance guards, ordinary down/up persistence and final owned cleanup. It accepts no personal project name and does not prune or flush a shared queue. The two existing eight-submission idempotency injection cases were included with small deterministic fixtures; there was no eight-stream upload stress test.

Main project **`vip-reliability-9843eb8a1e864c43880bb2668613484b`** used web/Mongo/Redis ports **54871/54872/54873**, all loopback, its own `vip_reliability_<owner>` database, image volume and Redis server. Containers were **created, not started**, then all mounts/labels/names/ports were verified before service tests. The reliability wrapper used independent project **`vip-reliability-bf666306a4494bba8b33334196189fc9`**. Both had four named labeled volumes, including explicit `/data/configdb`, and a project-scoped Compose bridge (not an egress-isolation guarantee). Native E2E additionally used random DB/storage/queue identities and refused existing API/web servers. [Isolation/config hash/mount evidence](evidence/isolation.json), [image identities](evidence/images.json), [regressions](evidence/regressions.json).

Custom requests used 550 ms spacing, at most 50 per logical case, at most two held uploads plus one rejection probe where existing tests require it. Allowed destinations were assigned loopback/owned bridge services and an ephemeral loopback browser origin; the synthetic HTTPS document was fulfilled locally. No OOM/disk fill, unbounded fuzz, external callbacks, brute force, malicious archive/regex or arbitrary exploit payload was used.

## Counts and guarantee coverage

| Execution | Count/result | Preserved boundary |
| --- | --- | --- |
| Contracts/backend/worker/API/web unit/component | 42 + 35 + 2 + 65 + 134 = **278 passed**, **1 skip** | Schemas, finite geometry, storage errors, admission/Host/logging config, UI state and navigation |
| Node harness tests | **10 passed** | Existing isolation/cleanup guards plus exact configdb mount and read-only/extra-mount refusal cases |
| Real MongoDB/Redis integration | **143 passed**, 4 files, no skipped/deselected/failed | Canonical upload and inclusive limits; readiness/storage failures; first durable acceptance; Redis outage; semantic replay/conflict; eight-request races; worker lease/generation/token/attempts; stale commits; immutable results; review CAS/receipts; history cursors |
| Native browser | **18 passed** | Upload/results, zero detections, real canvas edits, lost-response retries, two-tab review conflicts, history/deep links, unsaved navigation |
| Container browser | **2 passed** | Production nginx/API/worker workflow, real review/reload/history and portfolio fixtures |
| Custom final HTTP | **13 recorded cases**, plus cache/log/staging assertions | Native/no-Origin compatibility, invalid/mismatched Origin rejection without records, unexpected Host, framing, MIME/ETag/cache and query-canary exclusion |
| Custom origin browser | **11 observations**, not a unit-test count | Zero unrelated-origin write effect, unreadable cross-origin responses, framing denial, bounded synthetic-public simulation |
| Captured legitimate browser | One actual upload/inspection/review/reload flow | Matching actual Origin on all mutations, original predictions unchanged |
| Source scans | 145 snapshot files; 92 Semgrep scanned paths; 0 matches/errors, 0 secret matches, 1 contextual misconfiguration | Narrow six-rule/local secret/config coverage only |
| Image/catalog scans | Four sub-budget images and one valid Mongo OS catalog | Same-feed advisory inventories; no complete native coverage claim |

The existing skip is the POSIX-specific storage case-separation test on Windows. The Windows casing/extended-path/DOS/junction regressions remain in the executed suite; no blanket Windows deselection was introduced. No remote Linux/Windows Actions job, alternate browser/CPU architecture, full history/settings audit, public-origin exploit chain, host-loss/restore, valid-near-cap peak-memory or physical disk failure experiment ran.

The recovery wrapper passed MongoDB-first 202 during Redis outage/API restart, MongoDB rejection and controlled completion-write recovery, worker health reconnection, finite/recovered attempts, retained original results/reviews/images, ordinary restart/down-up persistence and Redis marker preservation. These are bounded ordinary outage/restart guarantees, not exactly-once inference, immutable full review history, arbitrary hardware-loss durability or production availability.

After the service checks, the actual closeout commands were:

```powershell
.\.tools\node.exe docs/security/sa-3/repro/cleanup.mjs
# Strict network-ID comparison surfaced the built-in bridge drift; no restore.
$auditUntil = [DateTimeOffset]::UtcNow.ToString('o')
docker events --since 30m --until $auditUntil --filter type=network --filter network=bridge --format '{{json .}}'
docker network inspect bridge --format '{{.Id}} {{.Name}} {{.Driver}} {{len .Containers}}'
docker info --format '{{.ID}} {{.ServerVersion}} {{.OperatingSystem}}'
# Read-only completion after named resources had already been removed:
.\.tools\node.exe docs/security/sa-3/repro/cleanup.mjs --verify-after-cleanup
.\.tools\node.exe docs/security/sa-3/repro/finish.mjs
.\.tools\node.exe docs/security/sa-3/repro/report.mjs
.\.tools\node.exe docs/security/sa-3/repro/verify.mjs
```

The event query returned no lines; its literal evaluated UTC cutoff was not persisted. Selected Docker output identified Engine **29.9.1 / Docker Desktop**, an empty built-in bridge and the same after-ID recorded in preservation evidence. No before-engine identity or causal attribution is available; that gap is retained rather than filled with an inferred explanation.

## Failures, corrections and operational gap

The first lint failed on an unused import in the **new audit setup script**. That import was removed; final lint passes. Typecheck, all test suites and build passed without application edits. Initial execution evidence is retained alongside the final lint correction. The unsupported DB metadata experiment and its replacement are described in [supply-chain limitations](supply-chain.md); zero unsupported results never became a clean finding.

Owned cleanup succeeded, including configdb after the wrapper's down/up cycle, with **no new anonymous volume**. The first strict preservation comparison failed because Docker's built-in `bridge` ID changed. Pre-existing containers/states, all volume names and all other network IDs matched. A bounded read-only bridge-event query returned no explanation; no bridge modification or speculative restore was attempted. This remains an **unresolved operational observation**, not an application defect or a passing full-network-equality check. No further dynamic tests ran after this surfaced.

The pre-existing unowned anonymous volume was excluded and left untouched. Retained demo data was not mounted or queried; preservation compares metadata, not volume bytes or other actors' writes. [Preservation evidence](evidence/preservation.json) records both the successful owned cleanup and the precise limitation. Raw logs/full scanner output remain private in `.tools/sa3/<token>` or existing ignored test-report directories. Reproduction requires a **fresh authorized** environment; the recorded stack has already been removed.
