# SA-2 commands, regression evidence and limits

Commands ran from the repository root using local **Node 24.22.0**, **pnpm 10.34.7**, existing installed dependencies and **Chromium 156.0.8078.4**. Prepending `.tools` to PATH selects the pinned runtime for child processes. No automatic fix, dependency install/update, staging or publication command ran. Scanning is report-only and offline except public package/advisory-reference/Action-tag metadata lookups.

## Reproduction sequence

The scripts record private working paths in Git-ignored `.tools/sa2/current.json` and shared sanitized JSON under `evidence/`. Setup generates a fresh ownership-labeled project; no project name/data URL is accepted from the user. The actual original baseline and hardened candidate identities are in [baseline](evidence/baseline.json) and [image comparison](evidence/image-identities.json). A future **before** run requires that original application/configuration snapshot, not the current hardened code. Do not blindly replay before-mode assertions against the final candidate.

```powershell
# Historical SA-2 run sequence; a new service run requires an authorized context.
.\.tools\node.exe docs/security/sa-2/repro/prepare.mjs
.\.tools\node.exe docs/security/sa-2/repro/setup.mjs
.\.tools\node.exe docs/security/sa-2/repro/browser.mjs before
.\.tools\node.exe docs/security/sa-2/repro/http.mjs before
.\.tools\node.exe docs/security/sa-2/repro/mongo-catalog.mjs
# Authorized implementation edits occurred, then:
.\.tools\node.exe docs/security/sa-2/repro/validation.mjs
.\.tools\node.exe docs/security/sa-2/repro/rebuild.mjs
.\.tools\node.exe docs/security/sa-2/repro/http.mjs after
.\.tools\node.exe docs/security/sa-2/repro/browser.mjs after
.\.tools\node.exe docs/security/sa-2/repro/image-scans.mjs
.\.tools\node.exe docs/security/sa-2/repro/runtime.mjs
.\.tools\node.exe docs/security/sa-2/repro/advisory-triage.mjs
.\.tools\node.exe docs/security/sa-2/repro/workflow.mjs
```

Exact scanner flags, mounts, budgets, fixture construction and HTTP assertions are in the corresponding scripts. They reject missing/mismatched resources. Do not manually substitute retained demo URIs or mounts. Source/secret transmission and the AI Security Platform are excluded.

The required broader regression command was:

```powershell
$env:PATH = "$PWD\.tools;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.tools\playwright-browsers"
.\.tools\pnpm.cmd test:reliability --native --browser --ci-mongodb
```

This existing wrapper creates its **own second project**, verifies ownership before disruption, runs `pnpm test:integration` and `pnpm test:e2e` against dedicated server ports, runs nginx/container browser checks, then executes controlled outages/restarts/maintenance/recreation and guarded cleanup. `test:e2e` includes a build. Full integration has no name filter or deselection. The two existing eight-submission injection tests were explicitly allowed as small deterministic DB/idempotency races, not a new eight-stream upload load test.

After the initial test-only type correction, `pnpm typecheck` passed independently. Final workspace lint/typecheck/unit/build were rerun through `validation.mjs final`; no services or new feed queries are needed for that pass. The first validation report remains intact. Results are in [initial workspace execution](evidence/workspace-validation.json), [final workspace execution](evidence/workspace-validation-final.json), and [regression summary](evidence/regressions.json).

## Isolation and budgets actually used

Main before/after project: `vip-reliability-a8416c15a67b4e17916ee7396ec237bb`; web **127.0.0.1:59750**, with separate assigned MongoDB/Redis ports and unique `vip_reliability_<owner>` DB. The [isolation record](evidence/isolation.json) contains exact resources, ports and owner labels. Its three named data volumes were not retained demo volumes. MongoDB version **8.0.34** and non-per-CPU allocator mode were asserted. The reliability wrapper used `vip-reliability-1660afa220e0463c9afec3da337bee7e`, with independent generated dependency ports, named volumes and DB. Native E2E additionally used unique test DB/storage/queue identities and refused already-running web/API servers.

Custom HTTP requests were spaced 550 ms, at most 50 per case, with ten multipart matrix requests per phase using the existing tiny PNG. There was no exhaustion/fuzz/real-secret input. Existing integration's over-limit/inclusive file and pixel cases and real interrupted upload tests stayed bounded. Custom origin tests used one controlled ephemeral loopback server plus a locally fulfilled synthetic HTTPS document; no actual external attack destination, callback, DNS change or browser permission override was used.

## Results and preserved guarantees

| Boundary | Executed evidence | Outcome |
| --- | --- | --- |
| Origin/Host/config | 53 focused unit cases; real HTTP before/after; direct API requests; captured same-origin browser headers | Passed; unexpected mutations rejected before parsing/staging/insert; no new CORS disclosure |
| Canonical uploads/storage | Full assets integration + storage/unit tests and browser rendering | Inclusive limits, genuine decode/container validation, orientation/mirrors, metadata stripping, publication, ETag/MIME/bytes and failure cleanup preserved |
| Slot admission | Existing two-held-request/third-503 integration; new one-slot interrupted-write test; existing actual socket-abort case | Passed, including subsequent admission and staging cleanup |
| Inspection durability/idempotency | Full integration, including both eight-submission cases; Redis-down container phase | MongoDB precedes 202; Redis-independent admission, semantic replay/conflict and retry lineage preserved |
| Worker execution | Full integration and interruption/recovery wrapper | Generation/token/lease ownership, stale attempts, finite three-attempt budget, immutable results and lost acknowledgements preserved |
| Review | Full review integration, native two-tab/ambiguous-save browser cases, nginx workflow | Optimistic tokens, receipts/no-op behavior, original predictions, reopen/refresh and conflicts preserved; no new immutable review-history claim |
| Frontend/history | 134 component cases, native 18, container 2 | History/canvas/navigation, paging/deep links and unsaved changes behavior preserved |
| Packaging/operators | Runtime checks and container smoke/worker check | UID 1000 API/worker, no npm/npx runtime, worker image mount read-only, private operator routing and health/queue functionality preserved |
| Dependency outages/restarts | All existing wrapper phases | Redis outage/API restart acceptance; MongoDB rejection and controlled completion-write recovery; API/worker restarts; storage report/offline staging boundary; down/up persistence/Redis marker passed |

Counts: **278 Vitest passed, 1 existing platform-specific skip; 8 Node harness passed; 143 integration passed; 18 native browser passed; 2 container browser passed**. The custom workflow and browser-origin observations are reported separately, not added to a vulnerability score or called hundreds of independent security tests. No remote Linux/Windows GitHub Actions run, alternate browser/architecture, power-loss/restore, valid near-cap peak-memory measurement, or public penetration test was executed.

## Failed checks, corrections and cleanup limitation

| Observation | Resolution / retained evidence |
| --- | --- |
| First focused run: 52 passed, 1 logging test failed | Fastify's supplied LogController overrides the deprecated top-level disableRequestLogging option. Set the option on the controller; rerun **53 passed**. Initial failed assertion exposed raw URL retention during development; final canary tests pass |
| First workspace typecheck failed | New test fixture passed an explicitly undefined optional field, violating strict exactOptionalPropertyTypes. Omit the field when absent. Corrected typecheck passed; initial exit 2 remains in workspace-validation.json |
| Immutable Action verification rejected an annotated tag assumption | pnpm/action-setup tag object was peeled to its actual commit; final workflow and recorded provenance use the commit. No remote workflow ran with the intermediate edit |
| MongoDB SA-1 catalog OS `none` | Added required Ubuntu lsb-release metadata in a new catalog; assert OS/package coverage. SA-1 failed coverage evidence untouched |
| Post-cleanup full volume inventory assertion failed | All pre-existing volumes remain, but **one additional unmounted anonymous volume** exists. Mongo image declares `/data/configdb`, and creation coincides with wrapper startup; it has no audit ownership label. Leave it untouched; do not treat inferred ownership as permission to delete |

The named/labeled main and reliability stacks were removed. `cleanup.mjs --verify-after-cleanup` performs only post-cleanup inspection and records the anonymous resource limitation. [Preservation evidence](evidence/preservation.json) identifies it and the retained demo inventory. No further dynamic tests ran after this uncertainty surfaced. This is a cleanup coverage limitation; the tested authoritative DB/image/queue volumes were separately named and verified. A future harness improvement should explicitly own `/data/configdb` across down/up cycles before another reliability run. No prune, unrelated service change or attempt to mount/remove that volume was made.

Raw execution/build/scanner/browser logs remain private under `.tools/sa2/<token>` or existing ignored test-report directories. Shared JSON contains synthetic IDs/origins, safe headers, hashes, counts and selected metadata only. Private instructions, credentials, real images and source uploads are excluded.
