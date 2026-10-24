# Application Security Audit & Hardening

An evidence-based application security assessment and hardening project conducted on the completed **Visual Inspection Platform**, a full-stack image inspection and annotation system built with React, Fastify, MongoDB, Redis/BullMQ, and Docker.

The project evaluates application trust boundaries, identifies potential security weaknesses, implements targeted defensive improvements, and validates those changes against the platform's existing reliability guarantees.

**Status:** SA-0 through SA-3 completed (October 2026). Final assurance remains partially blocked by documented supply-chain and operational verification gaps.

## Security Assessment & Hardening Results

### Application security

- Threat-modeled API access, browser origins, image uploads, storage, asynchronous workers, dependencies, and container boundaries.
- Demonstrated that an unrelated loopback browser origin could trigger a multipart asset upload before hardening.
- Implemented Origin/Host admission checks and framing restrictions; verified that the previously observed cross-origin upload side effect was blocked.
- Preserved legitimate same-origin uploads, inspection requests, review operations, and native API-client behavior.

### Infrastructure and secure development

- Hardened image caching and routine request logging to reduce unnecessary exposure.
- Pinned GitHub Actions to verified commits and disabled unnecessary credential persistence.
- Removed unused npm tooling from runtime containers.
- Strengthened disposable Docker test-resource ownership checks and cleanup procedures.
- Reviewed dependency and container-image advisories, distinguishing package matches from confirmed application vulnerabilities.

### Regression validation

Final bounded validation passed:

| Test category | Passed |
|---|---:|
| Unit/component tests | 278 |
| Security/audit harness tests | 10 |
| Integration tests | 143 |
| Browser tests | 20 |

Lint, typecheck, and application build also passed. One existing platform-specific test was skipped.

The tests cover implemented security boundaries and existing application behavior, including image validation, durable inspection processing, worker recovery, idempotency, and revision-checked reviews.

## Project Milestones

| Phase | Scope | Documentation |
|---|---|---|
| **SA-0** | Architecture reconnaissance, threat modeling, and audit planning | [Threat Model](sa-0-threat-model.md) · [Plan](sa-0-plan.md) |
| **SA-1** | Static and dynamic security assessment, browser-origin testing, dependency analysis | [Assessment Results](sa-1/README.md) |
| **SA-2** | Targeted application, infrastructure, and CI security hardening | [Hardening Results](sa-2/README.md) |
| **SA-3** | Final security validation, risk reconciliation, and portfolio documentation | [Final Report](sa-3/README.md) |

For a consolidated explanation of the engineering work and supporting evidence, see the [Security Portfolio Summary](sa-3/portfolio.md).

## Threat Model and Scope

The assessed deployment is a **trusted, single-user local demonstration** using synthetic image data.

The assessment focuses on the security boundaries relevant to that environment. It does not assume that a local demonstration requires the same authentication, multi-tenancy, network exposure, or infrastructure protections as a publicly deployed production service.

No application vulnerability was confirmed within the exercised assessment scope. The browser-origin behavior motivated a verified defense-in-depth improvement, not a claim of demonstrated remote exploitation.

## Residual Risks and Limitations

The final assessment retains several explicitly documented limitations:

- **Supply-chain assurance:** Some MongoDB native/bundled component advisory applicability and reachability questions remain unresolved.
- **Aggregate resource controls:** Cumulative asset/storage quotas are deferred; individual upload and concurrency safeguards remain in place.
- **Operational preservation:** An unexplained change to Docker's built-in bridge network ID prevented complete host-state preservation assurance.
- **Environment coverage:** Tests and security conclusions apply to the documented local configuration and tested browser/runtime environments.

The assessment does not claim complete vulnerability coverage, production security certification, or resolution of all dependency advisories.

See the [Final SA-3 Report](sa-3/README.md) for detailed findings, evidence, unresolved questions, and recommended follow-up work.

## Historical Planning Record

The original SA-0 reconnaissance was performed on **October 23, 2026**, against source commit `ec1167e49783618bd049f3992fafb38f9cf475ed`.

At that stage, only read-only inspection and planning were authorized. No application vulnerabilities were confirmed, and no application code or runtime configuration was changed.

The original planning documents are retained for traceability:

- [Security Architecture & Threat Model](sa-0-threat-model.md)
- [Assessment and Remediation Plan](sa-0-plan.md)
- [Initial Evidence and Assumptions](sa-0-evidence.md)

These documents represent the initial security baseline and proposed work, not the final implementation status. Subsequent assessment, hardening, and validation are documented separately under SA-1, SA-2, and SA-3.
