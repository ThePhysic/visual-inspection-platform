# Operations, preservation and residual-risk ownership

## Verified runtime and CI boundaries

[Runtime evidence](evidence/runtime.json) records actual service PID 1 UIDs: API/worker **1000**, nginx **101**, MongoDB/Redis **999**, all observed with zero effective capabilities and no privileged container flag. MongoDB/Redis Docker configuration leaves User blank, but their entrypoints drop the service process to UID 999; a root `docker exec` default is not evidence of a root-running database service. The image directory remains UID/GID 1000:1000, mode 0700; the worker mount is read-only.

Ordinary application Compose still publishes only loopback web. Disposable tests deliberately add private loopback MongoDB/Redis ports. Networks are project-scoped bridges with no claim of `internal: true` or general egress isolation. Operator ports remain process/container loopback, unpublished and absent from nginx proxy routes: internal operator reads return 200, public API operator paths return 404, and nginx `/metrics`/`/queue` are SPA HTML. All five configured health checks were healthy during observation.

Current workflow references match preserved upstream-verified SA-2 commits: checkout `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node `949feb2413d6458794dcd2491c4babbbce0c15c1`, pnpm/action-setup `ea17c68df8912ef543352723c149a84f56e3d413`. All three checkout steps disable credential persistence; `contents: read`, frozen installs, existing events/matrix/timeouts and test guards remain. SA-3 made no remote tag/settings/API request and ran no hosted workflow; local source/provenance consistency is the claim. Runtime npm/npx remain absent, while builds and actual worker startup/queue processing succeed.

Source secret scanning found no matches in the filtered current snapshot. It excluded private instructions/env files, Git history, generated dependencies, data/backups and traces. `.env.example` and secret-handling configuration were reviewed as frozen source. No credentials were validated, rotated, disclosed or sent externally. This does not establish that ignored files, history or hosted settings are clean.

## Harness correction and cleanup

`infra/docker/disposable.mjs` now defines an ownership-labeled `mongodb-config-data` volume, explicitly mounts it at `/data/configdb`, and checks every service's exact data mount/name/type/RW mode before disruption/cleanup. It rejects missing, anonymous, foreign, bind-substituted, extra or wrongly writable mounts. Resource names and owner/project labels must match. `infra/benchmark/core.test.mjs` adds two meaningful negative/positive ownership cases; the Node suite now has 10 passing tests.

The main stack's containers were created and inspected before service tests. Both new projects used **four** named test data volumes. The reliability wrapper's ordinary down/up reattached the stable configdb name; final verified cleanup removed it with the other three volumes. No fresh anonymous volume remains. The prior unowned volume was not directly inspected, mounted, queried or removed in SA-3. Retained demo volumes were never used by tests or cleanup.

[Preservation evidence](evidence/preservation.json) confirms existing container/states and all volume names match the pre-run inventory, and all networks except built-in `bridge` retain their IDs. The built-in bridge's before/after ID differs. A bounded read-only event query returned no explanation; no network restore/reconfiguration was attempted, and attribution remains unknown. It is a failed strict network-equality observation, not an application exploit or a clean host-state proof. No further dynamic tests followed it.

Application/configuration/dependency hashes remain frozen; original SA-0/SA-1/SA-2 assessment packages are preserved. The root security index and reliability explanation are intentionally updated. The index/staging state is unchanged. Private raw reports, filtered source copies, uniquely tagged build images/cache remain local; temporary image archives and generated main Compose override were removed. No prune, unrelated service stop/reset, AI Security Platform change, commit/push/deployment or remote setting change occurred. Volume byte equality and other actors' writes were deliberately not assessed.

## Safe startup, verification and rollback

These are **owner-run future procedures**, not commands executed against retained demo data by SA-3:

1. Review the final source/inventory and retain the trusted local/synthetic-data model. Keep loopback publication, private operators and the worker read-only image mount. Configure exact allowed hostnames without wildcards; browser mutations use the same frontend origin/port, with relative `/api` proxying. Native callers without Origin remain intentional.
2. For ordinary retained-demo use, keep the original project name and named volumes. The documented startup is `docker compose -p vip-demo up -d --build --wait --wait-timeout 120`; inspect configuration first and never add `--volumes` to shutdown or run prune/reset as a recovery shortcut. SA-3 did not execute this startup/deployment.
3. In a newly authorized disposable run, use the corrected generated harness, verify four test volumes including configdb before probes, then perform synthetic health/upload/inspection/review/history checks. Existing accepted data and canonical images should survive ordinary restarts; do not infer backup/host-loss recovery.
4. If resource accounting, ownership or mounts are uncertain, stop probes/disruption and inspect the generated override/labels. Leave unknown resources untouched. The prior `.tools/sa3/current.json` identifies a **removed** stack; do not substitute a personal project name into its cleanup commands.
5. SA-3 rollback affects only the two reviewed harness files and documentation. No application/database migration exists. Reverting the harness correction would reintroduce the configdb cleanup limitation, so keep it for future audit runs. If rolling back SA-2 behavior under separate authorization, revert matching API/nginx admission changes together and test separately; do not broadly reset/clean the checkout or delete assessment history.

## Deferred decisions

| Owner | Open requirement | Required future evidence/authorization |
| --- | --- | --- |
| Repository owner | Native/bundled advisory applicability, mongosh libmongocrypt and vendor discrepancy | Exact build/SBOM/vendor ranges and reachable supported features; compatible image changes require isolated persistence/rollback evidence before approval |
| Repository owner/operator | Aggregate retention and capacity | Separately reviewed durable conservative reservation ledger, existing-data adoption, crash/uncertain-ack tests; no unsafe count-only quota or automatic orphan deletion |
| Host operator | Old unowned anonymous volume and built-in bridge metadata drift | Separate ownership/engine-event evidence and authorization; no speculative deletion or network restoration |
| Repository owner | Confidential/multi-user/public deployment | Explicit identity, authorization, exposure, privacy and operations design; not inferred from this demo audit |
| Repository owner | Other browsers, real authorized public/DNS scenario, history/hosted settings | Explicit bounded targets/data access and reporting scope; no unsupported general security claim |

SA-3 work stops after this report. No further implementation, enterprise integration, hosted model call or remote deployment is initiated.
