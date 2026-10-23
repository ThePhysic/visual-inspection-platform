# Matroid SA-2 targeted hardening

**SA-2 passes for the authorized implementation and regression scope. SA-2A remains partially blocked; this is not a clean supply-chain assessment.** SA-2B and SA-2C pass for their documented bounds. No application vulnerability has been confirmed or retroactively added to SA-1. SA-3 has not begun.

The supported model remains a trusted, single-user local demonstration with synthetic images. Origin/Host admission is browser defense in depth, not authentication against a native caller. No accounts, tenancy, TLS service, cloud infrastructure, schema migration, database/Redis version change, or hosted scanner integration was introduced.

## Baseline and checkpoints

Source commit: `03566fa1d64b457dbc78c7cf37436b2296e73302`. Tracked application files were clean when SA-2 began. The existing 50 untracked SA-1 files were hashed before edits and preserved. [Baseline evidence](evidence/baseline.json) records source hashes and the index hash; [preservation evidence](evidence/preservation.json) records the final comparison. This candidate consists of that commit plus the explicit [file inventory](evidence/file-inventory.json), not a new commit.

| Checkpoint | Status | Evidence and limits |
| --- | --- | --- |
| SA-2A supply chain | **BLOCKED in part** | MongoDB OS catalog coverage recovered: 128 packages, 39 advisory matches, 136,987 exported bytes. Removed unused runtime npm, verified 13 fewer matches per Node image. Full embedded/native component coverage and remaining applicability/reachability remain unresolved; [dispositions](supply-chain.md) |
| SA-2B browser/local access | **PASS** | Early API Origin/Host gate, nginx Host forwarding/filter, framing restrictions. Direct HTTP and default Chromium before/after evidence; [policy and results](browser-boundary.md) |
| SA-2C resources/operations | **PASS within selected scope** | Existing byte/pixel/two-slot bounds retained; configurable reduction to one slot tested. Safer cache/log defaults and verified Action commits. Aggregate retention quota explicitly deferred with a concrete design; [decisions](resources-operations.md) |

## Changes and regression results

Unexpected Origins now receive 403 on methods other than GET/HEAD before body parsing or business/storage side effects. Native clients without Origin remain supported. Unexpected API Hosts receive 421. nginx preserves the external Host port; loopback aliases, internal service callers, Vite proxying, health checks, and same-origin browser uploads/inspection/review saves remain functional. API/SPA framing is denied. Image content uses `private, no-store` while retaining checksum ETags, MIME and rendering.

Normal API access logs use route templates, method, status, duration and request correlation instead of raw URLs. nginx access logs omit query strings and retain upstream request IDs. The three existing Action versions are pinned to verified commits, with checkout credential persistence disabled. API/worker final filesystems omit unused npm/npx; Node, nginx, MongoDB, Redis, application dependencies and lockfile versions are unchanged.

| Check executed | Result |
| --- | --- |
| `pnpm lint` | Passed, including new assessment scripts |
| `pnpm typecheck` | Passed after correcting a test-only exact-optional-property error; initial failed result retained |
| `pnpm test` | **278 Vitest passed, 1 existing platform-specific skip; 8 Node harness tests passed** |
| `pnpm build` and disposable Docker builds | Passed |
| Full real MongoDB/Redis integration suite | **143 passed**, no failures/skips/deselections; includes both previously deselected eight-submission cases and two new ingestion regressions |
| Native browser suite | **18 passed** |
| nginx/container browser suite | **2 passed** |
| Existing container reliability wrapper | Passed all exercised phases and ownership-verified cleanup |
| Focused admission/config/logging suite | **53 passed** after correcting initial logging configuration |
| Custom direct HTTP matrix | 13 recorded cases before and after, plus cache/ETag/MIME/log/storage assertions; all matched phase expectations |
| Custom Chromium origin matrix | 11 observations per phase; demonstrated unrelated-loopback upload **0 → 1 before**, **13 → 13 after**; framing refused after |
| Explicit same-origin Chromium workflow | Upload 201, JSON inspection 202, review 200, reload successful; captured matching Origin on all three mutations and unchanged original result |
| Dependency metadata audits | All/prod both exit 0, zero reported advisories; image/native coverage is separate |

[Regression evidence and commands](validation.md) distinguishes observations from test counts, earlier failed checks from corrected outcomes, and local execution from unexecuted hosted CI. No disabled browser protections, malicious archives, memory-corruption payloads, unbounded load or retained-data probes were used.

## Residual risks and next authorization

Aggregate durable assets, orphan files and distinct inspection requests can still grow. The new upload setting limits concurrent work, not cumulative retention. Other open areas include remaining image advisories, bundled mongosh/Sharp native-library coverage, other browser engines, full DNS-rebinding/public-origin scenarios, filtered Git history and hosted security settings. Existing cached copies and historical logs are not purged. There is no confidential-image or public-deployment guarantee.

The retained demo volumes were never mounted, queried, reset or removed. Only generated disposable resources were disrupted/cleaned. Dependencies, schemas, prediction/review/worker algorithms and retained data remain unchanged; authorized API/configuration/privacy/packaging behavior changes are explicitly listed. Private instructions and the separate AI Security Platform were excluded. No staging, commit, push, deployment or remote settings change occurred.

See [restart/rollback and proposed SA-3 plan](operations-next.md). SA-3 requires separate authorization; no final certification, portfolio publication or deployment was performed.
