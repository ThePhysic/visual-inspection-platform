# Matroid SA-0 evidence and open assumptions

SA-0 reviewed source, configuration, documentation and test definitions on **2026-10-23**, starting from clean commit `ec1167e49783618bd049f3992fafb38f9cf475ed`. The package adds documentation only. No exploit, advisory scan or live-service assessment was run, so no confirmed security vulnerability or clean security bill is claimed.

## Source evidence map

| Area | Inspected evidence and relevant symbols |
| --- | --- |
| Product and operational scope | [README](../../README.md), [architecture](../architecture.md), [API](../api.md), [development](../development.md), [containers](../containers.md) |
| HTTP and ingestion | [app.ts](../../apps/api/src/app.ts): `buildApp`, hooks/error handler and AJV options; [assets.ts](../../apps/api/src/assets.ts): routes, `multipartLimits`, two upload slots; [images.ts](../../apps/api/src/images.ts): `inspectContainer`, `canonicalizeImage`; [server.ts](../../apps/api/src/server.ts): startup and Sharp bounds |
| Inspection/review/history API | [inspections.ts](../../apps/api/src/inspections.ts): all inspection routes; [contracts](../../packages/contracts/src/index.ts), [inspection schemas](../../packages/contracts/src/inspections.ts), [review validators](../../packages/contracts/src/reviews.ts), [history schemas](../../packages/contracts/src/history.ts), [box schema](../../packages/contracts/src/annotations.ts) |
| Data access and integrity | [database.ts](../../packages/backend/src/database.ts), [inspection-model.ts](../../packages/backend/src/inspection-model.ts), [acceptance.ts](../../packages/backend/src/acceptance.ts): scoped uniqueness/fingerprints; [reviews.ts](../../packages/backend/src/reviews.ts): `saveReview`, receipt bound; [history.ts](../../packages/backend/src/history.ts): cursor and aggregate projection |
| Storage and maintenance | [storage.ts](../../packages/backend/src/storage.ts): `LocalImageStorage`, `isImageStorageKey`; [storage-maintenance.ts](../../packages/backend/src/storage-maintenance.ts): root/type/age/exclusivity checks; [operator wrapper](../../infra/docker/storage-maintenance.mjs) |
| Queue and worker | [queue.ts](../../packages/backend/src/queue.ts): execution policy and Redis clients; [execution.ts](../../packages/backend/src/execution.ts): processor, claims/checksum/result guards; [reconciliation.ts](../../packages/backend/src/reconciliation.ts); [provider.ts](../../packages/backend/src/provider.ts); [worker startup](../../apps/worker/src/main.ts) and [health](../../apps/worker/src/health.ts) |
| Diagnostics and browser | [operations.ts](../../packages/backend/src/operations.ts), [metrics.ts](../../packages/backend/src/metrics.ts), [client API](../../apps/web/src/api.ts), [app routes](../../apps/web/src/App.tsx), [viewer](../../apps/web/src/DetectionViewer.tsx), [history page](../../apps/web/src/HistoryPage.tsx), [Vite config](../../apps/web/vite.config.ts) |
| Runtime exposure and supply chain | [Compose](../../compose.yaml), [development override](../../compose.dev.yaml), [CI override](../../compose.ci.yaml), [Dockerfile](../../infra/docker/Dockerfile), [nginx](../../infra/docker/nginx.conf), [workflow](../../.github/workflows/ci.yml), [root manifest](../../package.json), workspace package manifests, [lockfile](../../pnpm-lock.yaml), [.npmrc](../../.npmrc), [build allowlist](../../pnpm-workspace.yaml), [.env.example](../../.env.example), Git/Docker ignore rules |
| Reliability claims and historical QA | [Pipeline guarantees](../inspection-pipeline.md), [reviews](../reviews.md), [history](../history.md), [reliability evidence](../reliability.md), [observability](../observability.md), [release QA](../release-readiness.md), [CI MongoDB compatibility](../ci-mongodb-compatibility.md) |

Repository instructions were read locally and are excluded from the deliverables. No private instruction content is reproduced or staged. Personal env files, application data, credential stores, full container environment dumps and the separate AI Security Platform repository were not read for this assessment.

## Existing automated evidence inspected

These are reviewed test definitions, not newly executed test results. Parameterized cases and historical counts are not a current test inventory count.

| Suite | Relevant existing cases |
| --- | --- |
| [API app](../../apps/api/test/app.test.ts), [metrics](../../apps/api/test/metrics.test.ts), config tests | Versioned schema/error envelope, private exception suppression, liveness/readiness separation, correlation IDs and absence of public metrics/queue routes |
| [Asset integration](../../apps/api/test/assets.integration.test.ts), [storage](../../apps/api/test/storage.test.ts) | Actual type versus filename/MIME, path rejection, duplicate content/index uniqueness, malformed/oversized files, inclusive limit, APNG/MPO, pixel cap, EXIF, upload backpressure/abort, failed publication, missing/incomplete bytes and lost insert acknowledgement |
| [Inspection integration](../../apps/api/test/inspections.integration.test.ts) | Eight concurrent duplicate submissions, semantic key conflicts, post-response dispatch, Redis startup/socket/command outages, invalid provider output/assets, timeouts, finite attempts, stale/duplicate execution, lease recovery, concurrent reconcilers and before/after commit interruption |
| [Review integration](../../apps/api/test/reviews.integration.test.ts) | Forged fields/invalid boxes/references, exactly 200 annotations, concurrent different/identical saves, no-op semantics, restart/reopen, post-commit acknowledgement loss, retained-operation conflict/supersession and eviction after 32 receipts |
| [History integration](../../apps/api/test/history.integration.test.ts), shared contract tests | Duplicate/unknown query fields, timestamp ties and page traversal, invalid cursor versions/dates/filter reuse, projected summaries, indexes and preserved retry lineage; schema and semantic geometry coverage |
| Backend [reconciliation](../../packages/backend/test/reconciliation.test.ts), [storage maintenance](../../packages/backend/test/storage-maintenance.test.ts), [metrics](../../packages/backend/test/metrics.test.ts), [provider](../../packages/backend/test/provider.test.ts); [worker health](../../apps/worker/test/health.test.ts) | Bounded/coalesced prompts, scan/shutdown races, conservative offline cleanup, symlink/junction/root/Windows alias checks, bounded operator listeners, deterministic inference/cancellation and heartbeat expiry |
| Web unit, [native E2E config](../../apps/web/playwright.config.ts), [review E2E](../../apps/web/e2e/reviews.spec.ts), [history E2E](../../apps/web/e2e/history.spec.ts), [container workflow](../../apps/web/container-test/workflow.spec.ts), [portfolio workflow](../../apps/web/container-test/portfolio.spec.ts) | Local draft isolation and geometry, actual canvas workflow, lost HTTP responses, two-tab conflicts, navigation warnings, deep links/history/pagination and saved prediction equality |
| [Disposable harness](../../infra/docker/disposable.mjs), [native wrapper](../../infra/docker/test-native.mjs), [reliability wrapper](../../infra/docker/test-reliability.mjs) | Generated ownership labels/project names, private DB/queues/volumes, guards before disruption/cleanup, real dependency recovery, worker interruption and persistence checks |

Read test setup and teardown before any later execution: unit storage tests remove their own temporary files; integration tests delete/drop their private database and queue; browser teardown deletes its run directory and records; the reliability wrapper deliberately stops services and removes owned disposable volumes. No such tests were run during SA-0.

## Executed validation

| Exact command or check | SA-0 outcome |
| --- | --- |
| `git rev-parse HEAD` | `ec1167e49783618bd049f3992fafb38f9cf475ed` |
| `git status --porcelain=v1` before documentation | Clean |
| `node --version`; `pnpm --version`; `& ./.tools/node.exe --version` | PATH Node `v24.22.1`, pnpm `10.34.7`; existing workspace-local Node `v24.22.0` matches the pin |
| `& ./.tools/pnpm.cmd lint` | Passed, exit 0; executes `eslint . --max-warnings 0` using the existing pnpm launcher; no fix flag |
| `docker compose --env-file .env.example -f compose.yaml config --quiet` | Passed, exit 0; configuration validation only |
| `docker compose --env-file .env.example -f compose.yaml -f compose.dev.yaml config --quiet` | Passed, exit 0; configuration validation only |
| `docker compose --env-file .env.example -f compose.yaml -f compose.ci.yaml config --quiet` | Passed, exit 0; configuration validation only |
| Inline documentation checker via `& ./.tools/node.exe --input-type=module -` | Passed, exit 0; all 106 relative file links resolve inside the repository; four new files have balanced code fences, final newlines and no trailing spaces. Mermaid rendering and external-link availability were not validated by this check |
| `git diff --check`; `git diff --exit-code`; `git diff --cached --exit-code` | Passed; existing tracked files and index unchanged |
| `git status --short --untracked-files=all` | Only the four new files under `docs/security/`; nothing staged |

Bounded `rg` searches inventoried routes/tests and looked for raw HTML/evaluation/command sinks, credential/CORS/security middleware references and network calls in source/configuration, excluding private instruction directories, env files, data, Git internals and generated tooling. Matches were interpreted manually; Mongoose `.exec()` is not a shell-execution sink. This was not comprehensive SAST or secret scanning. Public official tool documentation was consulted for the proposed methods linked in the [plan](sa-0-plan.md); no repository source was uploaded.

Typecheck, unit/integration/E2E/reliability suites and build were deliberately not executed: no behavior changed, and their root scripts generate build artifacts and/or mutate temporary data and services beyond this read-only pass. Dependencies were not installed or updated. Docker engine availability, runtime service state and hosted CI success were not established by Compose configuration validation. Historical passing results remain attributed to the existing QA documentation.

Package checks cover documentation and change scope, not application security.

## Open assumptions and required inspection

| ID | Unresolved item | How to resolve in a later authorized phase |
| --- | --- | --- |
| OA-01 | Actual deployment remains a trusted single-user loopback demo; no tunnel, remote binding or attached untrusted container | Owner confirms use; inspect selected listeners, Compose overrides, published ports and network membership without dumping env values |
| OA-02 | Image/data sensitivity and caching/retention expectations | Owner identifies synthetic versus sensitive images, shared-machine/browser-cache expectations, retention and deletion needs; reassess one-year public image caching accordingly |
| OA-03 | Browser access from unrelated origins, DNS/Host handling, local-network restrictions and framing | Two-origin browser tests on specified versions/topologies; report actual side effects and access conditions separately from preflight failures |
| OA-04 | Effective parser/proxy limits, timeout behavior, stream abort cleanup and aggregate resource bounds | Inspect pinned Fastify/multipart/nginx behavior, test bounded malformed/slow inputs on disposable targets, observe slots and disk/RSS without exhausting resources |
| OA-05 | Actual UID/GID/ACLs, worker mount mode, storage root integrity, capabilities and MongoDB/Redis effective users | Selected read-only runtime inspection on Linux containers and native Windows; no permission changes or writable-mount probes |
| OA-06 | Advisory applicability and whether runtime artifacts match lockfile/digest intent | Pinned SCA/image scans, advisory date and runtime reachability triage; inspect exact built artifacts; do not infer safety from version pins |
| OA-07 | Secrets in tracked files/history, PR checkout tokens, hosted Actions settings, branch protection or dependency/secret alerts | Local redacted scanning of an approved filtered snapshot/history; separate read-only hosted settings review if authorized; no credential validation against external services |
| OA-08 | Database roles/validators, write concern, restore process and backup coordination in the actual environment | Inspect only approved configuration; plan isolated restore testing separately. Existing tests do not establish power-loss durability or recovery from data corruption |
| OA-09 | Whether real provider integration or public/multi-user deployment is planned | Confirm intended deployment; revisit identity, object access, service roles, egress, model trust, audit attribution and lease/cancellation design only if scope changes |
| OA-10 | AI Security Platform can consume a filtered snapshot without executing code, leaking source or changing either repository | Verify its existing local ingestion, report schema, model egress, permissions/retention and prompt trust before separate pilot authorization; otherwise defer integration |

SA-0 is complete when the four-document package is internally consistent, its local source links resolve, and the final diff contains only those documents. SA-1 and all remediation remain unauthorized.
