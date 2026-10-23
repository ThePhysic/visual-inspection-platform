# Matroid security assessment and remediation plan

SA-1 assesses the [source baseline and review targets](sa-0-threat-model.md); SA-2 implements only separately authorized changes; SA-3 validates the final candidate and prepares an evidence-based report. Existing functionality and reliability guarantees are acceptance requirements throughout.

## Assessment rules and evidence

Before SA-1, record the authorized commit/snapshot hash, target services and ports, isolated data directories/volumes/database/queue identities, tool versions, test budget, and permitted network destinations. Use synthetic images and dummy canaries. Existing demo/native data and the separate security-platform repository are excluded. Source snapshots and reports must exclude private instructions and secrets.

Static analysis starts with a filtered source snapshot, mounted read-only, with output in a separate private directory. Run scanners without remediation flags or executable repository hooks. Review tool configurations before use. Dependency advisory lookup may send package names/versions to a registry; approve that egress explicitly or use locally provisioned advisory data. Do not enable cloud source uploads or authenticate a scanner by default.

Dynamic assessment requires a newly authorized disposable stack. Begin with one request at a time; proposed maximum is three simultaneous upload requests only for the existing two-slot backpressure check, otherwise at most two requests per second and 50 requests per case. Use existing small fixtures and a single bounded over-limit input where needed. Set per-case deadlines, cap generated files/report sizes, observe resource use, and stop on unexpected growth, unresponsive dependencies, or a target/ownership mismatch. Do not attempt disk filling, OOM, unbounded fuzzing, brute force, arbitrary command execution, destructive payloads, or external callbacks.

`GET /ready` performs a storage write/link probe. Browser flows create records, and ZAP crawling issues requests even when scan rules are passive. None should be pointed at an existing personal stack as if they were observation-only operations. Existing reliability wrappers deliberately stop/restart dependencies and delete their own disposable volumes; these are future regression methods requiring authorization for that isolated scope, never SA-0 commands.

For each candidate finding, retain a redacted record containing:

- ID, source commit and file/symbol, affected entry point and intended boundary.
- Status, prerequisites, exact synthetic request/fixture or minimal source reproducer, expected/observed behavior, and before/after state.
- Reproduction command, tool/rule/database version and date, output/exit status, and evidence artifact checksum.
- Local-demo impact and likelihood separately from hypothetical public-deployment impact; severity rationale and CWE only when applicable.
- Disposition: confirmed, suspected, false positive, accepted design limit, production opportunity, or blocked; proposed fix, regression case, residual risk and decision owner.

Scanner alerts remain candidates until manually traced. A dependency advisory match must identify the exact installed package/image, affected version range, runtime versus development placement, vulnerable feature and reachability. An unreachable affected dependency can still require maintenance, but it is not evidence of an exploitable application path. An unavailable scanner/feed or skipped test is a coverage gap, never a passing result.

## SA-1 manual and automated assessment

**Scope:** RT-01 through RT-07 first, with RT-08 limited to topology verification and deployment decisions. No remediations, dependency updates, schema changes or CI changes. Proposed assessment fixtures/scripts belong in an isolated audit workspace unless separately authorized for the Matroid repository.

| Order / target | Files and components | Validation method | Acceptance evidence |
| --- | --- | --- | --- |
| 1 / browser and local access | `apps/api/src/app.ts`, `assets.ts`, `inspections.ts`; `infra/docker/nginx.conf`; `apps/web/vite.config.ts`; browser client | Manual origin/Host/data-flow review; isolated two-origin Playwright requests and framing with browser version recorded; inspect browser local-network restrictions | Actual reachability, read versus mutation effects, preflight outcomes and framing behavior recorded per tested browser; RT-01 confirmed or narrowed with prerequisites |
| 2 / resource and file boundary | API ingestion/images, backend storage/history/operations, nginx, Redis policy | Compare proxy/direct API limits; bounded malformed multipart/container fixtures, disconnect/cleanup checks, slot gates and small repeated submissions; observe RSS/disk/jobs rather than fill them | Limit inclusivity, rejected-request side effects, resource release and error behavior recorded; timeout and aggregate quota assumptions explicit |
| 3 / contract and query integrity | Shared schemas; API routes; backend models, acceptance, history and reviews | TypeBox semantic tests, Fastify injection, genuine isolated MongoDB tests; malformed IDs/cursors, duplicate query fields, operator-shaped inputs, extra nested fields and forged confidence/result fields | Invalid inputs cannot change unrelated fields or original predictions; response projections omit internals; data snapshots and deterministic reproductions retained |
| 4 / asynchronous integrity | Backend execution/reconciliation/queue; worker; review persistence | Existing controlled-provider barriers and CAS/idempotency cases, invalid version/generation payloads, stale attempts, replay after receipt eviction, lost acknowledgements | One winning result, finite persistent attempts, durable acceptance independent of Redis, explicit review conflicts, and preserved retry predecessor |
| 5 / information exposure | Fastify errors/logs, nginx, frontend rendering/URLs, metrics, image cache | Synthetic canaries in invalid fields and controlled exceptions; inspect public errors, logs and private traces; assess headers and paths with passive tooling | No sensitive marker leakage in intended public responses/metrics; parser/proxy/stream exceptions documented; caching disposition tied to data sensitivity |
| 6 / dependencies and CI | Workspace manifests/lockfile, build allowlist, Dockerfile/context, workflow | Local SAST, redacted secrets scan on filtered files, advisory lookup, container/config scan, manual action/PR/cache review; inspect built artifacts only when authorized | Every relevant alert triaged; runtime/dev/image distinctions documented; no automatic fixes; hosted settings and history gaps explicitly recorded |
| 7 / runtime verification | Compose files, actual container user/mount/network/ports and operator binds | Selected read-only Docker inspection fields, not full environment dumps; listener/UID/mount inspection without write probes | Compare observed state with source; identify overrides/tunnels and unsupported exposure; do not infer MongoDB/Redis effective UID from application Dockerfile |

**Milestone acceptance:** the attack-surface inventory has a disposition for every entry; each review target has reproducible evidence or a named inspection gap; alerts have been triaged; the local deployment assumptions have been checked or left explicitly unresolved. Produce a risk-ranked findings register and a concrete proposed SA-2 change list. Zero confirmed findings is an acceptable outcome when supported by coverage.

**Safeguards and rollback:** assessment does not alter the source baseline. Record and hash inputs before scanning. Keep scanner outputs separate and private. Prove ownership before cleaning only audit-owned resources; never prune, flush shared Redis, drop a non-audit database, remove demo volumes, or use a shared production queue. If isolation is uncertain, stop dynamic work and continue static review. Preserve evidence before discarding the disposable assessment environment.

## Proposed tools and safe methods

These are options for SA-1, not tools installed or scans executed in SA-0. Pin versions and verify supported flags in that version before execution. Use the smallest useful set; overlapping scanner counts are not independent confirmation.

| Tool | Proposed use and safety limits |
| --- | --- |
| Existing Vitest, TypeBox, Fastify injection and Playwright | Primary targeted evidence using the repository's fixtures and deterministic barriers. Injection bypasses nginx/TCP/browser policies, so pair it with actual proxy/browser checks where those boundaries matter |
| pnpm audit | Report only: `pnpm audit --json`, then `pnpm audit --prod --json` on the authorized snapshot. No `--fix`, updates, new overrides or ignored-registry-error success. Review advisory egress and installed graph first; [pnpm 10 audit documentation](https://pnpm.io/10.x/cli/audit) describes JSON/production modes and the mutating fix option |
| Semgrep Community Edition | Locally reviewed, pinned TypeScript/JavaScript rules for input-to-query/path/rendering flows, command sinks and unsafe configuration. Use local rules with `--metrics off`, no login/remote CI upload and no autofix. Confirm remaining network behavior separately; [Semgrep metrics documentation](https://github.com/semgrep/semgrep/blob/develop/metrics.md) explains metrics behavior |
| Gitleaks | Local directory scan of the filtered snapshot with full redaction, bounded timeout and private report. Manually inspect reports for residual secret fields before sharing. History review is a separate local, path-filtered activity that must also exclude private instructions; never send raw `.git` to a scanner. The [official commands and redaction documentation](https://github.com/gitleaks/gitleaks#usage) describe directory/history modes |
| Trivy | Explicit filesystem/config scanners on the filtered snapshot; optional vulnerability/SBOM scan of authorized exact image artifacts later. Provision rules/advisory databases deliberately; verify pnpm and image coverage for the chosen version. Never mount the Docker socket merely to scan source. The [filesystem documentation](https://trivy.dev/docs/latest/target/filesystem/) distinguishes default scanners from explicitly enabled configuration scanning |
| OWASP ZAP | Prefer passive review of controlled browser traffic with exact target scope and active scanning disabled. Optional bounded baseline crawl only on a disposable stack with form submission/Ajax actions reviewed. Baseline includes a spider, not a zero-request operation; see [baseline behavior](https://www.zaproxy.org/docs/docker/baseline-scan/) and [passive scanning](https://www.zaproxy.org/docs/api/#using-passive-scan). Do not substitute full/API active scans |
| Git, file hashes and selected Docker inspection | Establish source/artifact identity and compare expected runtime permissions/ports. Print selected fields, avoid raw env/log dumps, and do not inspect personal data records. Hosted CI/security settings require a separate authorized account review |

None of these tools alone establishes secure deployment, absence of secrets, or reliable recovery. No new scanning CI job, plugin connection, paid service, account token, or package installation is authorized by this plan.

## Proposed AI Security Platform integration

The separate completed AI Security Platform could provide a comparison source scanner and findings triage workflow. Its supported ingestion format, scanner engines, network behavior, model/provider egress, report access controls, retention, and execution behavior remain unverified. It was not accessed during SA-0. A safe later pilot depends on confirming those properties without modifying that repository.

1. Obtain authorization for one specified Matroid source snapshot and the receiving scanner instance. Record commit, dirty-tree state if applicable, and an explicit file manifest with SHA-256 hashes. A source hash supplements commit identity when working-tree changes exist.
2. Export only selected tracked code/contracts, manifests/lockfile, workflow and container configuration needed for the chosen rules. Use an allowlist rather than archiving the checkout. Exclude all private instruction files, `.git`, local env/configuration credentials, hidden personal tooling, node_modules, build/data/volume directories, logs, traces, screenshots and uploaded images. Admit any documentation or synthetic fixture individually. Reject symlinks or entries resolving outside the export root and review the resulting contents locally.
3. Run local secret detection before transfer. If sensitive content is found, stop transfer and obtain an approved sanitized input; record excluded files and coverage loss. Keep manifest paths relative and avoid personal absolute paths in shared reports.
4. Use a local/offline scanner mode only if verified. Mount the snapshot read-only; provide only a separate report directory for writes. Grant no live API/DB/Redis credentials, Matroid service network, Docker socket, host root mount, shell execution of repository scripts, or git write token. Do not install snapshot dependencies or execute builds as part of source ingestion.
5. Treat source comments and scanner/model output as untrusted data. Source instructions must not grant tools, change scope, request secrets or trigger remediation. If AI assistance is used, verify prompt-injection handling and provider egress using synthetic canaries and no real secrets; do not assume an in-process model interface provides isolation.
6. Compare candidate findings with independent manual traces and conventional tools for RT-03, RT-04, RT-06 and RT-07. Record useful matches, false positives, missed coverage, reproducible evidence and triage decisions. Confirm report visibility, retention and deletion arrangements before any upload. If safe read-only ingestion is unavailable, keep the integration deferred and use standalone local tools.

This pilot would evaluate scanner usefulness on an authorized application, without supplying live services or permission to repair either repository. It does not authorize access now or imply that the AI Security Platform has the listed capabilities.

## SA-2 authorized remediation and regression tests

**Entry gate:** owner authorizes a concrete SA-1 finding/change list, affected components, desired behavior and deployment assumptions. Prioritize confirmed violations of local boundaries and reproducible data-integrity/resource defects. Treat deployment-dependent enhancements separately. Do not add authentication, schemas, services, infrastructure or unrelated refactors merely to satisfy generic scanner rules.

| Proposed change class, only if justified | Components likely affected | Focused validation and acceptance | Rollback safeguard |
| --- | --- | --- | --- |
| Browser/HTTP boundary | API hooks/routes, nginx/Vite only as approved, client request handling if needed | Reproducer fails safely after change; intended browser, native API clients, health probes, multipart and same-origin workflow still work | Small isolated patch; test request compatibility before rollout; revert only that patch without touching stored data |
| Input/file/resource defect | Contracts, API ingestion/images/errors, shared storage/history/operations | Small deterministic reproducer fails on baseline and passes after fix; inclusive limits, auto-orientation, metadata stripping and cleanup still hold | Keep canonical format/keys and publication order compatible; no destructive orphan cleanup or schema migration |
| Review/job integrity defect | Backend acceptance/reviews/execution/reconciliation and relevant contracts | CAS, duplicate/stale delivery, receipt eviction, attempts and uncertain acknowledgements pass; original predictions unchanged | Preserve old records and review token semantics; revert patch in isolated validation; explain any incompatible contract before approval |
| Confirmed advisory or CI/container weakness | Exact dependency closure/lockfile, workflow or Docker configuration only with specific authorization | Demonstrate affected path or maintenance rationale; focused regression plus runtime packaging/integration checks; no silent scan suppression | Preserve prior manifest/lockfile/image identity; assess MongoDB/Redis volume compatibility before any image change; never downgrade data in place |

**Milestone acceptance:** every authorized fix has a before/after reproducer, focused regression test, reviewed diff, updated relevant documentation and residual-risk disposition. Required workspace checks pass or blockers are reported. No alteration of acceptance durability, result immutability, review concurrency, retry identity or storage safety is accepted without explicit architectural agreement.

**Safeguards:** use individually reviewable changes and isolated test data. Do not stage or edit private instructions. Preserve unrelated working-tree changes; rollback means reverting the specific authorized patch, never a broad reset. Avoid migrations in this project unless separately approved with a backup/restore plan. No commit/push/deploy or credential change is implied by remediation authorization.

## SA-3 final validation and portfolio report

**Scope/components:** final diff, changed boundaries and all affected runtime paths; security findings register; existing test suites and CI configuration; `docs/security/` report, residual risks and portfolio narrative. The separate scanner repository remains outside remediation scope.

**Validation:** rerun the exact reproducers and relevant scanners with recorded versions/rules/feed dates, compare dispositions, execute the regression matrix below in authorized isolation, and inspect the final change manifest and reports for secrets. Run any dependency-interruption checks only with authorization for the wrapper's owned disposable resources. Record skipped/failed/unavailable checks, platform limits and remote CI separately.

**Acceptance:** no unresolved confirmed critical/high issue within the agreed local threat model unless explicitly accepted by the owner with rationale and follow-up. Every other finding is fixed, accepted, deferred to a production decision, or closed with evidence. All required functional gates pass or the candidate remains explicitly unvalidated. No broad claim such as penetration-tested, production-secure, no vulnerabilities, exactly-once execution or zero data loss is justified by these checks.

**Safeguards and rollback:** retain baseline/final source IDs, sanitized evidence hashes, exact commands and previous known compatible artifacts. Revert failed changes selectively and retest; preserve images and database records. Reports and screenshots contain only synthetic data and redacted outputs. Preparing a portfolio report does not authorize publication, commits, releases or deployments.

The portfolio narrative should show threat modeling, manual validation, scanner triage, secret protection, least privilege and regression work for the primary security role. Explain provider-output/prompt trust boundaries and the scanner pilot only if actually tested. Describe backend concurrency and recovery evidence precisely; report measured outcomes without inventing vulnerability counts or employer-specific qualifications.

## Acceptance and regression matrix

| Invariant | Existing evidence to retain and extend | Required outcome |
| --- | --- | --- |
| Canonical image ingestion | `apps/api/test/assets.integration.test.ts`, `storage.test.ts`; backend storage maintenance tests | Actual JPEG/PNG checks, inclusive 10 MiB, 20 MP rejection, APNG/MPO rejection, EXIF rotation/mirrors, no client paths, failure cleanup and retained bytes after uncertain insert |
| Durable acceptance and identity | Inspection integration tests; acceptance and unique-index behavior | Persist before 202; Redis outage does not invalidate intent; concurrent duplicates identify one inspection; semantic conflicts return 409; manual retry preserves failed predecessor |
| Worker ownership and recovery | Inspection integration, reconciliation tests, authorized disposable reliability harness | One authoritative result; invalid/stale deliveries do not win; three-attempt budget, lease repair and post-commit acknowledgement recovery preserved; no exactly-once claim |
| Review integrity | Contract/review integration, frontend persistence tests and two-tab browser cases | Predictions unchanged; full coverage/finite normalized boxes; expected revision plus sequence enforced; no-op, concurrent duplicate, replay/superseded and receipt-eviction behavior preserved |
| History and navigation | History integration/component/browser and portfolio cases | Bounded projected pages, stable keyset traversal for stable data, safe cursor/filter errors, retry lineage, saved-review reopen and dirty-draft protection |
| Public data and operations | App/error/metrics tests, worker health and runtime smoke | No internal paths/keys/tokens in public DTOs, safe failures, operator ports remain private, bounded metric labels, worker read-only image mount and non-root application execution |
| User workflow | Real API/worker/browser tests through native proxy and production nginx | Upload, simulated results including zero detections, edit/move/draw/reject/save, conflict recovery, refresh/deep link and history retain behavior |
| Build and portability | Workspace validation; Windows/Linux matrix; CI MongoDB compatibility assertion | Pinned runtime/tooling, strict typing, frozen dependencies and production runtime closures; no skipped database/browser tests disguised as passes |

Future authorized validation commands, from the repository root:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:ci:integration
pnpm test:reliability --browser --ci-mongodb
```

The integration wrapper runs real integration plus native browser tests against owned dependencies; the reliability wrapper adds full-container browser/recovery checks. Provision the required pinned runtime, dependencies and Chromium separately before execution. Preserve the MongoDB 8.0.34 allocator assertions described in [CI compatibility](../ci-mongodb-compatibility.md); do not change versions or suppress tests to work around the host kernel. Historical counts in [release QA](../release-readiness.md) are context, not new SA-0/SA-3 results.
