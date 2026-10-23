# Matroid security audit

## Current increment

The separately authorized [SA-1 assessment](sa-1/README.md), [SA-2 targeted
hardening](sa-2/README.md) and [SA-3 final validation](sa-3/README.md) retain the
local single-user model. SA-2's browser/Host/framing, cache/log, Action and runtime
tooling changes passed bounded final regressions. SA-3 corrected disposable
configdb ownership and completed its report/portfolio package. Final assurance
remains partially blocked by native/supply-chain coverage and unexplained
built-in Docker bridge metadata drift; aggregate quotas remain deferred. The
SA-0 material below is the original planning record, not a statement of the
later increments' authorization or results.

SA-0 establishes the security baseline for the completed Visual Inspection Platform and plans a separate assessment and hardening project. The supported deployment is a trusted, single-user local demo. Source review identified existing input, storage, concurrency, and recovery controls; **no security vulnerability is confirmed by this planning pass**.

Reviewed on **2026-10-23** against commit `ec1167e49783618bd049f3992fafb38f9cf475ed`, with a clean working tree before this package was added. Findings apply to the inspected source and configuration, rather than an observed running deployment.

## Planning package

| Document | Contents |
| --- | --- |
| [Security architecture and threat model](sa-0-threat-model.md) | Protected assets, principals, inputs, component boundaries, diagram, attack surface, existing controls, and prioritized review targets |
| [Assessment and remediation plan](sa-0-plan.md) | SA-1/SA-2/SA-3 scope, methods, tools, acceptance criteria, regression gates, rollback safeguards, and proposed AI Security Platform use |
| [Evidence and open assumptions](sa-0-evidence.md) | Source and test references, executed checks, limitations, and items requiring manual inspection |

## Authorization and status

Only SA-0 planning and read-only reconnaissance were authorized. The changes are limited to these four documentation files. No application code, dependencies, container configuration, schemas, credentials, or private instructions were changed. No services were started, stopped, reset, or probed; no scanner was enabled; no commit, push, or deployment was performed.

The remaining milestones are proposals. SA-1 requires assessment authorization, including its target and test bounds. SA-2 requires separate remediation authorization. SA-3 requires authorization for final validation and any portfolio publication. Completion of SA-0 grants none of these permissions.

## Initial priorities

1. Verify whether an unrelated browser origin can cause unwanted requests to the loopback application, considering multipart uploads, host handling, browser restrictions, and framing.
2. Assess resource bounds across nginx, Fastify, Sharp, storage, history reads, and durable queue admission using bounded tests in an isolated environment.
3. Challenge schema, storage, job, and review boundaries while preserving existing idempotency, immutable predictions, and recovery behavior.
4. Review dependencies, runtime packaging, CI trust, and secret handling with reproducible tools and manual triage.

These priorities rank assessment effort, not established vulnerability severity. Authentication, TLS, multi-user ownership, database credentials, immutable audit history, and additional container restrictions are deployment-dependent decisions. Their absence alone is not a finding against the documented local demo.

The project emphasizes evidence-based application security, secret handling, least privilege, and focused regression tests for the primary 1Password Junior Security Engineer portfolio objective. Provider-output validation and safe scanner integration support the secondary AI security objective; queue and persistence integrity support the backend objective. Employer requirements and scanner capabilities have not been independently assessed here.
