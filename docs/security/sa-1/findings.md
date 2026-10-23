# Matroid SA-1 findings register

There are **zero confirmed application vulnerabilities**. The register ranks review/remediation decisions by demonstrated relevance and uncertainty. Vendor CVSS/severity belongs to the dependency candidate, not automatically to the Matroid application. No application CVSS or CWE is assigned without a demonstrated boundary violation.

The [machine-readable register](findings.json) and [per-image advisory records](evidence/image-advisories.json) preserve status explicitly. A passing verification target means its particular checks passed, not that its entire component is secure.

## Risk order and SA-0 coverage

| ID | SA-0 target | Classification | Local-demo assessment | Hypothetical public deployment |
| --- | --- | --- | --- | --- |
| SA1-01 | RT-07/RT-08 | Suspected weakness requiring further evidence | Image-package advisory backlog; application exploitability unassigned; investigate first | Reassess request-facing libraries and service exposure before deployment |
| SA1-02 | RT-01 | Suspected weakness requiring further evidence | Verified blind asset creation from another loopback origin; low potential impact with a controlled local-origin prerequisite | Browser/version/permission-dependent; remote exploit not demonstrated |
| SA1-03 | RT-02 | Accepted local-demo limitation | Durable asset/inspection growth without an aggregate quota; per-request controls held | Admission/retention policy becomes necessary for untrusted callers |
| SA1-04 | RT-01 | Production-hardening opportunity | Arbitrary Host accepted and local-origin framing permitted; no DNS-rebinding/clickjacking chain demonstrated | Define Host/origin/framing policy with the deployment design |
| SA1-05 | RT-06 | Accepted local-demo limitation | Images have one-year public immutable caching; request URLs appear in local logs; no sensitive input supplied | Sensitive images/credentials in URLs require different privacy/logging decisions |
| SA1-06 | RT-07/RT-08 | Production-hardening opportunity | Version-tagged Actions/DB images, shared internal authority, mutable root filesystems and bundled npm; existing local access boundary retained | Least privilege and supply-chain pinning need explicit production design |
| SA1-07 | RT-03 | Verification target that passed | IDs, query/cursor bounds, schemas, public DTOs and forged fields passed sampled and existing tests | No authorization claim; there is intentionally no tenant boundary |
| SA1-08 | RT-04 | Verification target that passed | Canonicalization, paths, rejected/aborted staging cleanup, type/dimension limits passed | No protection against a privileged local storage writer is claimed |
| SA1-09 | RT-05 | Verification target that passed | Attempts, stale ownership, idempotency, immutable results, review CAS/receipts and lost acknowledgements held | No exactly-once/provider-sandbox/immutable-audit-history claim |
| SA1-10 | RT-06/RT-08 | Verification target that passed | Safe projections/errors/metrics, private operators, non-root application processes and read-only worker image mount observed | Actual public routing and service identities must be redesigned/tested |
| SA1-11 | RT-07 | False positive | Trivy DS-0026 overlooks Compose-defined health checks; no missing health check in this deployment | Standalone image use would require separate health configuration |
| SA1-12 | RT-06/RT-08 | False positive | HTTP 200 for `/metrics` and `/queue` is SPA HTML, not exposed operator data | Keep operator access separate during any routing changes |
| SA1-13 | RT-07 | False positive | CVE-2023-45853 against Debian `zlib1g` concerns unbuilt MiniZip code; three image appearances closed | Does not suppress distinct MiniZip packages or other zlib advisories |
| SA1-14 | RT-07/RT-08 | Blocked or untested case | MongoDB advisory coverage, full history/secrets/settings, other browsers and full external-origin exploit chains remain gaps | No production security conclusion supported |

## SA1-01 image advisory candidates

**Boundary:** executable runtime artifacts should have understood dependency risk. **Source:** [Dockerfile lines 2, 42 and 63](../../../infra/docker/Dockerfile), [Compose lines 78 and 90](../../../compose.yaml); exact image IDs, installed versions, candidate paths and vendor URLs are in [image evidence](evidence/image-advisories.json).

**Expected/observed:** immutable version/digest pins make an artifact reproducible, not current. Offline Trivy returned 241 matches each for API/worker, 134 for web and 264 for Redis. The workspace pnpm audit returned no matches because base OS packages and npm's bundled dependency tree are outside that graph. There are 218 distinct advisory IDs across the scanned images; each record is explicitly triaged as suspected, an opportunity, or a vendor-supported false positive. This is not 880 confirmed vulnerabilities.

**Prerequisites/impact:** depend on the particular vulnerable feature and attacker access. Privileged mount/ACL operations require local capabilities or authorized paths absent from the reviewed application flow. Request-facing library issues require evidence that this configuration reaches the affected function. The three remaining scanner-critical appearances are Perl candidates in Redis's OS package inventory; no Matroid flow invoking Perl or archive extraction was found. No memory-corruption exploit was attempted. [Debian's Perl advisory descriptions](https://security-tracker.debian.org/tracker/CVE-2026-8376), [archive handling](https://security-tracker.debian.org/tracker/CVE-2026-42496), and [regex behavior](https://security-tracker.debian.org/tracker/CVE-2026-13221) explain prerequisites that vendor severity alone cannot establish here.

**Proposal:** prioritize component-specific review and an authorized compatible image refresh or removal of unnecessary runtime tooling. Preserve candidate visibility, test actual images and keep MongoDB volume compatibility separate. No update/removal was performed. Remaining candidates are not accepted as safe.

## SA1-02 cross-origin loopback writes

**Boundary:** an unrelated browser document is untrusted input even while the intended user operates a local demo. **Source:** [asset route lines 93–167](../../../apps/api/src/assets.ts), [app setup lines 25–31](../../../apps/api/src/app.ts), and [nginx lines 2–25](../../../infra/docker/nginx.conf).

**Prerequisite:** the attacker controls content served from another loopback origin reachable in the same browser. **Reproduction:** [browser.mjs](repro/browser.mjs) opens a controlled origin, constructs a Blob from a synthetic PNG, and sends a multipart POST to the audit web origin. No credentials, user filesystem reads, disabled browser protections or permission grants are involved. Asset count changed **7 → 8** in the final run; JavaScript received `TypeError` because response reading was blocked by CORS. [Browser evidence](evidence/browser-origin.json) records origins, default Chromium 156.0.8078.4 behavior and console diagnostics.

**Limit:** a synthetic public HTTPS origin created no asset and was denied loopback access. JSON/custom-header and review PUT preflights failed; [server observations](evidence/http-followup.json) show OPTIONS 404. An actual public-network attacker origin, different browser behavior or permission-granted scenario was not established. A local-origin server also requires local control, which overlaps the documented trusted-host model. Consequently this is a verified property and a suspected weakness needing a policy/reachability decision, not a confirmed public CSRF or data-integrity exploit.

**Potential impact/proposal:** blind insertion of unwanted small assets and consumed resources within the demonstrated path. No image read, inspection creation, review edit or exhaustion was demonstrated. Decide whether to reject unrelated Origin values while preserving supported same-origin browser uploads, native API clients and health probes. Keep CORS response confidentiality distinct from write admission.

## SA1-03 through SA1-06 local assumptions and opportunities

**SA1-03:** [upload slot guard line 100](../../../apps/api/src/assets.ts), [image bounds lines 77–97](../../../apps/api/src/images.ts), [queue policy](../../../packages/backend/src/queue.ts) and [history query](../../../packages/backend/src/history.ts) bound individual work. Three valid uploads added three images/567 canonical bytes and six distinct keys added six inspections. Five readiness probes left no retained growth. These are expected local-demo persistence effects, not an exhaustion result. Aggregate retention/admission controls need explicit owner requirements before any implementation.

**SA1-04:** the direct synthetic Host test returned health 200; a different loopback origin framed the SPA but could not read its document. `server_name _` and SPA responses do not define an allowlist or framing restriction. This proves prerequisites only. DNS control, resolver behavior, browser policies and an effective sensitive action are untested; do not label this DNS rebinding or clickjacking. A later approved local-origin/Host/framing policy can address defense in depth without adding user accounts.

**SA1-05:** [asset response line 185](../../../apps/api/src/assets.ts) intentionally permits public immutable caching. Fastify's normal request logging recorded a dummy query canary; the synthetic metadata marker did not appear in the inspected log window. Cache and URL logging can expose sensitive material if operators introduce it; no real secret or customer image was used. Current local demo use has no stated confidential-image/credential-in-URL requirement. Proposed changes require that requirement to be defined, plus tests for caching and log redaction.

**SA1-06:** [workflow lines 7 and 28–34](../../../.github/workflows/ci.yml) restrict token permission and use frozen dependencies, but Actions use version tags. Base images retain npm and its private transitive dependencies; a runtime check distinguished Node's embedded Undici 7.29.1 from npm's bundled 6.28.0. [Runtime evidence](evidence/runtime.json) shows shared bridge access and no per-service database credential, no whole-process resource limits or read-only root filesystem. Local loopback publication and trusted operator assumptions are unchanged. Public TLS, authentication, tenancy and new infrastructure remain outside this remediation proposal.

## Verification targets and false positives

SA1-07 through SA1-10 are supported by [HTTP/resource evidence](evidence/http-resources.json), [139 integration results](evidence/integration-tests.json), [18 browser workflows](evidence/browser-workflow.json), [runtime checks](evidence/runtime.json), and existing source controls. In particular, [worker claim/owned commit lines 98–179](../../../packages/backend/src/execution.ts), [review CAS lines 54–65](../../../packages/backend/src/reviews.ts), and [storage key/open checks lines 15–81](../../../packages/backend/src/storage.ts) retain their assertions. Invalid persisted configuration/output/checksum cases and uncertain acknowledgements were included in the selected integration tests.

DS-0026 (SA1-11) is closed for this Compose deployment: all five actual containers had health checks and were healthy during inspection. SA1-12 resolves two initial HTTP-test expectation failures with direct API 404 and nginx HTML checks; original failed expectations remain in the evidence. [Debian's zlib notes](https://security-tracker.debian.org/tracker/CVE-2023-45853) state that the relevant MiniZip code is not built into these bookworm binary packages, supporting SA1-13. No global suppression or fix was added.

## Blocked and untested work

SA1-14 includes full MongoDB image scanning above the 1 GiB per-image input budget; its small catalog fallback reported OS `none` and no package inventory and is explicitly **blocked**, despite tool exit 0. Full Git-history secret scanning requires an approved path-filtered history export that excludes private instructions. Hosted Actions settings/alerts and branch protection were not accessed. Other browsers, a real public-origin/DNS-rebinding chain, peak memory for a valid near-cap image, arbitrary disk/host failure and restoration were not tested. The optional separate security-platform pilot is deferred. These gaps remain visible through SA-2 selection and any later SA-3 report.
