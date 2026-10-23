# Portfolio-ready technical summary

## Project description

**Matroid Visual Inspection Platform — application security audit and targeted hardening.** Threat-modeled an existing Fastify/React/MongoDB/Redis-BullMQ application under an explicit trusted-local, synthetic-data deployment model. Combined source review, local scanner triage, real Chromium origin tests and deterministic backend reliability regressions. Separated observed browser write effects from CORS response confidentiality and avoided treating package matches or missing production features as confirmed exploits.

The assessment demonstrated a blind multipart upload from another loopback origin while JavaScript could not read the response. Owner-authorized SA-2 hardening added early Origin/Host admission, preserved nginx's external host port, denied framing, minimized normal access logs and image cache persistence, pinned existing Actions to verified commits, and removed unused runtime npm/npx. SA-3 froze and revalidated that candidate without further application remediation, and corrected audit-resource ownership for MongoDB configdb.

Final evidence includes **278 unit/component tests, 10 harness tests, 143 real MongoDB/Redis integration tests, 18 native and 2 nginx browser tests passed**, with one existing platform skip. Bounded outage/restart tests preserve durable admission, semantic idempotency, finite fenced attempts, immutable predictions, review conflicts and persisted images/reviews. Source scans used six versioned local rules and redacted secret/configuration reporting. Image findings were triaged with exact artifact/feed identities rather than advertised as application exploits.

The honest result is **no confirmed application vulnerability within the exercised scope, with partially blocked security assurance**. Native/bundled advisory applicability, retention growth, other-browser/public/DNS scenarios and operational metadata uncertainty remain visible. This is not an independent certification, public penetration test or production-security claim. Neither the application nor the separate AI Security Platform was deployed or published by this work.

## Résumé bullet candidates

Choose two or three that fit the role; retain the deployment/measurement qualifiers when discussing results:

- Threat-modeled and assessed a Fastify/React/MongoDB/BullMQ visual-inspection demo, maintaining an evidence-linked risk register that distinguishes verified controls, false positives, accepted limits and unresolved dependency candidates.
- Implemented and browser-validated local Origin/Host/framing admission, blocking a reproducible cross-loopback multipart side effect while preserving native API callers and same-origin upload, inspection and review workflows.
- Validated security changes with 143 real MongoDB/Redis integration tests and 20 native/container browser tests, preserving durable idempotency, worker fencing, immutable predictions and review optimistic concurrency.
- Strengthened audit isolation with exact per-service volume/permission guards and owned MongoDB configdb storage; verified safe cleanup after dependency outages and down/up persistence tests without using retained demo data.
- Triaged pinned offline image scans against exact runtime components, verified unused npm-tree removal with 13 fewer advisory matches per Node runtime, and documented unresolved native coverage rather than claiming all historical alerts fixed.

The 20 browser tests refer to the existing 18 native plus 2 container suites; custom observations are separate. Advisory matches are package/image appearances, not independent vulnerabilities. The project has no independently confirmed public-origin exploit count to advertise.

## Role relevance and interview evidence

| Objective | Evidence-backed work | Honest boundary |
| --- | --- | --- |
| 1Password Junior Security Engineer | Explicit trust model, browser admission reasoning, secret/log minimization, least-privilege observations, scanner false-positive triage, reproducible findings and residual-risk ownership | No enterprise identity/password-manager integration, certification or confidential-image guarantee |
| Brain Co AI Security Engineer | Unknown provider-output validation and immutable prediction/review separation; safe data-only scanner workflow and refusal to enable hosted AI/source transmission | Deterministic mock inference; no real ML accuracy, adversarial-model or prompt-injection evaluation; optional AI Security Platform pilot remained deferred |
| Prophet Security Backend New Graduate | MongoDB-first acceptance, semantic replay/conflict, fenced finite worker attempts, lost acknowledgements, revisioned review CAS and ordinary restart persistence | At-least-once execution, bounded review receipts/current snapshot, single-host durability assumptions |

Useful interview walkthroughs: [threat boundaries](threat-model.md), [browser before/after chain](browser-resources.md), [native advisory uncertainty](supply-chain.md), [full validation accounting](validation.md), and [safe cleanup/ownership](operations.md). Employer requirements were not independently reassessed; these are portfolio relevance mappings, not claims of employment qualification.

No staged changes, commits, pushes, live demo deployment, public portfolio publication or remote GitHub settings were made. The owner can review and separately authorize any publication or later remediation.
