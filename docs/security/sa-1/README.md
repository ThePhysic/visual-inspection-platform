# Matroid SA-1 security assessment

SA-1 assessed the trusted, single-user local demonstration on **2026-10-23**. **No application vulnerability was confirmed by a reproducible violation of an intended security boundary.** This is a bounded assessment, not a declaration that the application or its dependencies are vulnerability-free.

The exact baseline is clean commit `03566fa1d64b457dbc78c7cf37436b2296e73302`. Application/configuration files have no changes from the SA-0 application baseline. A filtered 143-file source snapshot has manifest SHA-256 `9c5fc7b42ba03b58111508e2e596779ac41d666f1bb3df183afa77caab9d4820`; its [manifest](evidence/source-baseline.json) records individual hashes and exclusions.

| Checkpoint | Status | Meaning |
| --- | --- | --- |
| SA-1A static assessment | **BLOCKED in part** | RT-01 through RT-08 received source review, source scans and workspace audits completed, and four runtime images were scanned. Full MongoDB image advisory coverage remains blocked by the export budget and an unsuccessful catalog fallback. Numerous OS advisory candidates still require component-specific reachability verification |
| SA-1B controlled dynamic assessment | **PASS for the exercised bounds** | Owned environment/isolation checks, browser-origin observations, bounded HTTP/resource probes, 139 selected integration cases, and 18 existing browser workflows completed. Initial audit-harness expectation errors are disclosed and resolved below. Unexercised cases remain gaps, not passes |

## Findings that matter

- A different **loopback** browser origin created one canonical asset even though CORS prevented reading the response. JSON/PUT preflights were rejected. The synthetic public HTTPS origin was denied loopback access by Chromium and created no asset. This establishes a narrow cross-origin write property; it does not establish a public-site CSRF, DNS-rebinding, sensitive-data read, or review-modification exploit.
- Existing upload, schema, storage, worker ownership, review concurrency and retry protections held in the exercised cases. Small repeated valid submissions retained records/images as designed; no total storage/admission quota exists. No exhaustion test was performed.
- pnpm reported **zero advisories** for its all-dependency and production graphs. Image scans nevertheless returned **880 package/advisory matches across four images, representing 218 distinct advisory IDs**. These counts include shared packages and repeated images, and are not application vulnerability counts. Vendor severities, candidate dispositions and gaps are preserved.
- The critical zlib/MiniZip match was closed as a false positive for the Debian binary package. Several JavaScript matches reside in unused npm tooling bundled in the Node image, outside the workspace graph. Other image candidates remain unresolved rather than being dismissed because deployment is local.
- Runtime checks confirmed non-root application processes, a read-only worker image mount, mode-0700 image storage, private operator listeners and loopback publication. Shared service-network/database authority and public image caching remain explicit local-demo assumptions.

## Assessment package

| Document | Purpose |
| --- | --- |
| [Findings register](findings.md) | Risk-ranked dispositions, source locations, prerequisites, evidence and impact; includes every SA-0 target |
| [Static scanners and supply chain](static-assessment.md) | Versions, rules, exclusions, database identity, image/advisory triage, CI and secret handling |
| [Browser and runtime assessment](dynamic-assessment.md) | Isolation, browser-origin behavior, upload/resource/API/storage/queue/review results and runtime privileges |
| [Commands and evidence](reproduction.md) | Exact entry points, counts, failures, skips, blocked work and evidence interpretation |
| [Proposed SA-2 work](sa-2-proposal.md) | Ordered candidate changes, focused tests and rollback safeguards; no implementation authorized |

Machine-readable [findings](findings.json), [individual image candidates](evidence/image-advisories.json), [image summary](evidence/image-scan-summary.json), sanitized [evidence](evidence/), and synthetic [reproduction scripts](repro/) accompany the report. Reports and source were not uploaded to hosted scanners or models. The optional AI Security Platform pilot is deferred because its safe ingestion/execution/egress properties were not established; its repository and services were not modified.

## Preservation and remaining limits

Only assessment documents, evidence and synthetic reproductions were added under `docs/security/sa-1/`; private artifacts are under Git-ignored `.tools/sa1/`. No application code, dependencies, schemas, existing Docker/CI configuration, credentials or private instructions were changed or staged. Build outputs were regenerated using existing pinned dependencies.

The audit stack's containers, volumes and network were removed after ownership verification. All 143 baseline source hashes, the scanner snapshot, the existing tracked-file diff and index remained unchanged. Unrelated container identities/states and volume inventory matched the pre-assessment inventory. The three retained `vip-demo` volumes were never mounted or queried; their byte contents were deliberately not hashed. [Preservation evidence](evidence/preservation.json) states this verification boundary. Audit build-image tags, scanner caches and private logs remain locally; no prune was performed.

Other browsers, a real public network origin, an actual DNS-rebinding chain, full Git-history secret scanning, hosted repository settings, worst-case legitimate image memory, MongoDB bundled libraries, arbitrary power loss, and backup restoration remain untested. SA-2 remediation and SA-3 final validation have not begun. This report is local assessment material, not a published portfolio claim.
