# Matroid final security validation

**Authorized SA-3 validation and reporting are complete. Final security and dependency assurance remains PARTIALLY BLOCKED.** The exercised hardening/reliability checks pass; native/bundled advisory applicability and other named coverage gaps prevent a clean or fully passed security assessment. No application vulnerability was confirmed, and no independent security certification is claimed.

The supported deployment remains a **trusted, single-user, local demonstration using synthetic images**. This work does not qualify a public or multi-user service. Native callers intentionally have no authentication boundary; Origin/Host admission is browser defense in depth.

## Candidate and decisions

Accepted application baseline: **`b5de38321f2a12b5334b176576ffbcc5ff29eef2`**. The working tree was clean before SA-3. [Baseline evidence](evidence/baseline.json) freezes 283 tracked nonprivate files, package manifests, dependency/configuration hashes and prior security artifacts. Application source, dependencies, lockfile, schemas, runtime Docker/Compose/nginx configuration and CI workflow remain byte-identical to that baseline. Only the disposable audit harness, its regression tests, documentation and new assessment artifacts changed; [exact inventory](evidence/file-inventory.json).

| Checkpoint | Decision | Practical limit |
| --- | --- | --- |
| SA-3A reconciliation | **PARTIALLY BLOCKED** | All prior dispositions reviewed; precise runtime identities and bounded offline scans collected. Full MongoDB/Sharp/native component coverage, vendor discrepancies and reachability remain unresolved |
| SA-3B validation | **PARTIALLY BLOCKED for full operational preservation assurance; bounded regressions/owned cleanup PASS** | Executed application checks pass. A built-in Docker bridge ID changed without an explanation from the bounded event review; operational attribution remains open |
| SA-3C reporting | **PASS** | Threat model, final register, evidence, limitations, ownership, operations and portfolio package complete |

The [final findings register](findings.md) distinguishes verified hardening/existing controls, false positives, accepted limits, unresolved candidates and blocked assessments. It preserves every SA-1 ID and SA-2 disposition; no historical suspected finding is silently converted into a confirmed exploit.

## Final validation results

| Executed gate | Result |
| --- | --- |
| Lint, strict typecheck, build | Passed; initial unused import in an audit-only setup script corrected and failed lint evidence retained |
| Unit/component suites | **278 passed, 1 existing Windows/platform skip** |
| Node harness suite | **10 passed**, including two new mount-ownership regressions |
| Full real MongoDB/Redis integration | **143 passed; 0 failed, skipped or deselected** |
| Native Chromium suite | **18 passed** |
| nginx/container Chromium suite | **2 passed** |
| Existing outage/restart/storage/recreation wrapper | Passed; four owned named volumes, including configdb, cleaned |
| Custom final HTTP matrix | 13 recorded cases plus explicit cache/ETag/MIME/log/staging assertions passed |
| Custom Chromium origin/framing matrix | 11 observations; unrelated-loopback multipart caused **zero new assets**; framing refused; CORS response confidentiality retained |
| Captured legitimate browser workflow | Upload 201, JSON inspection 202, review PUT 200 and reload passed with matching Origin; original predictions unchanged |
| Offline source/secret/config scans | Six local Semgrep rules: zero matches/errors; Trivy: zero secret matches and one contextual health-check false positive |
| Offline image assessment | API 228, worker 228, web 134, Redis 264 historical package/advisory matches reproduced on the preserved feed; Mongo OS catalog 128 packages/39 matches. These are candidates, not application vulnerability counts |

[Commands and complete validation accounting](validation.md) separates observations, tests and scanner matches. [Browser/resource evidence](browser-resources.md) confirms SA-2 behavior. [Supply-chain assessment](supply-chain.md) explains exact tool/feed identities, installed components and blocked coverage. No fresh external registry audit, live external target, hosted AI or hosted CI execution was performed; historical pnpm audit responses remain historical for the unchanged graph.

## Preservation and residual risk

The harness now explicitly names/labels MongoDB's `/data/configdb`, verifies every service mount and permission, and rejects anonymous/foreign mounts before disruptive operations. Fresh testing used two generated projects with private databases, queues, images and four owned volumes each. Cleanup removed the new labeled resources and left **no new anonymous volume**. The pre-existing unowned volume and retained demo volume names remain unchanged; no retained data was mounted, queried, reset or removed. [Preservation evidence](evidence/preservation.json) deliberately does not claim a retained-data byte comparison or attribute the unexplained built-in bridge change.

Open risks include cumulative asset/orphan/inspection growth without an aggregate quota, incomplete native/embedded advisory coverage (including newly identified mongosh libmongocrypt), vendor-applicability discrepancies, historical caches/logs, other browsers/public-origin/DNS scenarios, full Git history and hosted settings. Synthetic local use, trusted operator access and the existing limited durability model remain requirements.

[Operations and residual-risk ownership](operations.md) gives safe startup/verification/rollback procedures and explicitly deferred decisions. [Portfolio summary and résumé candidates](portfolio.md) contain only measured, scoped accomplishments. No application remediation, dependency upgrade, authentication/tenancy/quota infrastructure, AI Security Platform modification, staging, commit, push, deployment or GitHub setting change occurred in SA-3. Work stops here.
