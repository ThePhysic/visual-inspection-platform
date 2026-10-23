# Final risk and disposition register

**Zero confirmed application vulnerabilities.** This is a scoped result with substantial named assurance gaps, not proof of absence. The [machine-readable register](findings.json) preserves every original classification and SA-2 disposition, with final evidence and an owner. Vendor CVSS is never transferred directly to the application. Priority below ranks remaining review effort, not confirmed exploit severity.

| Priority / ID | Original → final disposition | Evidence / residual decision |
| --- | --- | --- |
| 1 / SA1-01 | Suspected image candidates → **unresolved candidates** | Four exact image inventories stable on preserved feed; no complete native/bundled applicability proof. [Supply chain](supply-chain.md) |
| 1 / SA3-S01 | Newly identified installed mongosh component → **unresolved candidate** | libmongocrypt 1.20.0 / CVE-2026-114655 review target; exact bundle/Node/driver identity now known, vendor range/build/feature reconciliation still required. No HTTP KMS/encryption API or installed API encryption module. [Components](evidence/components.json), [candidate selection](evidence/native-advisories.json) |
| 2 / SA1-02 | Suspected local browser write property → **verified hardening** | Historical loopback blind upload is blocked on final candidate with zero new assets; same-origin/native use passes. No reclassification as a proven public exploit. [Browser chain](browser-resources.md) |
| 2 / SA1-04 | Host/framing opportunity → **verified hardening** | Unexpected Host rejected, external port preserved, framing denied. Complete DNS rebinding/other-browser assurance is not supplied |
| 2 / SA1-03 | Accepted retention limitation → **accepted limitation** | Inclusive input limits and 1/2-slot controls pass; cumulative assets/orphans/inspection growth remains. Deferred safe ledger design requires separate authorization |
| 3 / SA1-05 | Accepted cache/log assumption → **verified hardening with limits** | No-store images and query-free normal logs pass, including ETag/MIME/rendering/correlation. No authentication, historical purge or confidential-image guarantee |
| 3 / SA1-06 | Supply-chain/runtime opportunity → **verified selected hardening** | Action commits/checkout handling, unused runtime npm removal and existing non-root/private-operator boundaries verified. Broader public/service-identity controls deferred |
| 3 / SA3-H01 | Audit cleanup defect → **verified harness correction** | Explicit owned configdb, exact service mounts/permissions and unknown-mount refusal; real down/up/final four-volume cleanup passes. No application remediation claim |
| 3 / SA3-O01 | New metadata observation → **unresolved operational observation** | Built-in Docker bridge ID changed; other networks, existing containers and volume names match. Read-only event window did not explain it. Causality/data impact unassigned; no speculative restore |
| 4 / SA1-07 | API validation/query target → **verified existing control** | Full integration/unit checks preserve rejected operator/extra fields, bounded history and safe projections |
| 4 / SA1-08 | Upload/storage target → **verified existing control** | Canonicalization, paths, interruption/failure cleanup and uncertain-insert retention remain |
| 4 / SA1-09 | Async/review target → **verified existing control** | Durable idempotency, fenced finite attempts, immutable results, review CAS/receipts and recovery remain |
| 4 / SA1-10 | Runtime/operator target → **verified existing control** | Service UIDs/capabilities, worker read-only mount, storage mode 0700 and public operator rejection observed |
| 4 / SA1-11 | Dockerfile health warning → **false positive in Compose context** | Five configured health checks observed healthy; standalone image use would need its own decision |
| 4 / SA1-12 | Operator-looking HTTP 200 → **false positive** | nginx serves SPA HTML; real public API paths 404, private listeners remain separate |
| 4 / SA1-13 | Debian zlib1g MiniZip → **package/CVE-specific false positive** | Prior vendor-supported disposition retained; no suppression of other zlib/native findings |
| Open / SA1-14 | Blocked/untested coverage → **partially blocked assessment** | Mongo OS detection and exact embedded identities improved; full native inventories, applicability, full history/hosted settings, other browsers and external/DNS attack chains remain incomplete |
| Open / SA3-L01 | Prior unowned volume → **accepted operational exclusion** | Still present and untouched. No inference of ownership authorizes mount/deletion |

## Risk ownership and prerequisites

The repository owner owns candidate/vendor reconciliation, retention requirements and decisions about supporting anything beyond local synthetic data. The host operator owns the unowned-volume decision and any separate Docker Desktop event investigation. No formal business risk acceptance is invented on their behalf; “accepted limitation” describes the approved demo model and explicitly deferred requirement.

Remaining advisory candidates require a vulnerable feature/build plus a reachable attacker input or privilege condition. The most relevant next evidence is an embedded/native SBOM, exact vendor affected-range/patch reconciliation and actual supported feature paths. `mongod`/nginx library linkage, optional lockfile peers and generic package counts are insufficient. Native library absence/build prerequisites narrow particular cases without certifying the rest of an image.

The implemented browser boundary rejects unexpected Origin values before parsing or storage effects, but trusts a native no-Origin client and does not create user identity. Cumulative storage remains unbounded, and uncertain publication cannot be “fixed” by deleting potentially referenced bytes. The original durability model assumes acknowledged MongoDB/disk persistence and eventual dependencies; inference may repeat, and review receipts/history are bounded.

No confirmed security-relevant application defect requiring further remediation was found in the exercised cases. SA-3 therefore introduced no product fix, upgrade or broader feature. Unresolved supply-chain and operational assurance is explicitly **not** a fully passed/clean security assessment. Any future remediation or deployment requires separate authorization.
