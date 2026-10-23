# SA-2A advisory dispositions

**Partially blocked.** This increment resolves MongoDB **OS catalog detection**, removes one unnecessary runtime tooling tree, and narrows important candidate prerequisites. It does not establish complete native/bundled-component advisory coverage or request-level exploitability for every remaining image match. SA-1 evidence/dispositions are retained verbatim; the following records are additive.

## Exact tools and provenance

Trivy **0.76.1**, image ID `sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c`, used the preserved schema-v2 advisory DB with SHA-256 `a3e2a693b5f130132acc609d723f60fb546a85b3b35179d63063afa6f355d0d2`. It was updated **2026-10-23T13:13:41.529244645Z**, downloaded **19:48:38.720452344Z** from the separately provisioned public registry during SA-1. No feed refresh obscures the before/after comparison. [Original provenance](../sa-1/evidence/advisory-database.json), [new image results](evidence/image-scans.json), [Mongo catalog](evidence/mongo-catalog.json).

Actual scans had network disabled, read-only source artifacts/database/root filesystem, dropped capabilities, `no-new-privileges`, memory 2 GiB, no Docker socket or service-data mounts, explicit vulnerability scanner, offline mode and DB/Java/check updates disabled. API/worker image inputs retained the original **<1 GiB image**, **<1100 MiB archive**, **>4 GiB free disk** bounds and two-minute scanner deadline. Each exact owned archive was removed afterward. MongoDB was not exported as an image. Scanners did not execute repository scripts, use automatic fixes, transmit source or invoke hosted AI. A diagnostic version-check attempt was blocked by `--network none`; final runs additionally requested telemetry disabling.

All/prod `pnpm 10.34.7 audit --json` returned zero advisories again; captured registry responses have no immutable upstream DB version. Only package metadata lookup was transmitted. This covers the workspace graph, not base OS packages, npm's former private tree or every compiled native library. No new final SAST/security-certification pass was substituted for SA-3.

## Artifact comparison

| Artifact | Before | After / disposition |
| --- | --- | --- |
| API Debian 12.15 runtime | 241 package/advisory matches | **228**, exactly 13 npm-tree matches removed, zero added matches on the same DB |
| Worker Debian 12.15 runtime | 241 | **228**, same removal/zero added matches |
| nginx Alpine 3.23.4 | 134 in SA-1 | Base digest/dependencies unchanged; configuration rebuilt; prior advisory inventory retained, not rescanned here |
| Redis Debian 12.15 | 264 in SA-1 | Exact image unchanged; three critical-labelled Perl candidates receive additional prerequisite review below |
| MongoDB Ubuntu 24.04 | Catalog reported OS `none`; coverage blocked | OS catalog recognizes **128 packages / 39 matches**, no critical/high in this catalog result; full image/bundled-tool coverage still incomplete |

[Image identities](evidence/image-identities.json) identify actual before/after built artifacts. MongoDB stays `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`; Redis stays `sha256:2f7462b9e93e0a7ae2edf3a0a0babc8a4d29f8bfc50849b906b7caaef925edc1`. No MongoDB/Redis data-format change or downgrade was attempted. Vendor severities are package labels, not application severities or confirmed vulnerability counts.

The removed matches are precisely the prior packages below, in `/usr/local/lib/node_modules/npm/node_modules/...`; [per-image differences](evidence/image-scans.json) preserve IDs, installed/fixed versions and paths. The application invokes Node directly and resolves its dependencies through pnpm's production closure; it does not invoke/import this private npm tree. Runtime filesystem checks confirm npm, npx and that tree are absent, while builds, health, native Sharp and actual queue execution pass. This is reduced unused tooling, not a workspace dependency upgrade or proof of an exploit fixed.

| Former npm package | Installed | Prior candidate IDs / scanner-proposed fixes |
| --- | --- | --- |
| brace-expansion | 5.0.9 | CVE-2026-102276/102277/102278; 5.0.10/11/12 fixes reported per advisory |
| http-cache-semantics | 4.2.0 | CVE-2026-93748; no fixed version returned |
| ip-address | 10.5.0 | CVE-2026-101910/101911/101912/101913/111997 |
| postcss-selector-parser | 7.1.4 | CVE-2026-104844 |
| undici | 6.28.0 | CVE-2026-19534/85024/18540; per-advisory fixed versions retained in evidence |

Node's embedded Undici is **7.29.1**, a different artifact. Removing npm does not change Node's built-in fetch implementation or remove historical/base layers. All remaining API/worker advisory records stay visible; the prior Debian `zlib1g` MiniZip false-positive disposition (SA1-13) remains package/CVE-specific.

## MongoDB coverage recovery

The [pinned Ubuntu analyzer](https://github.com/aquasecurity/trivy/blob/v0.76.1/pkg/fanal/analyzer/os/ubuntu/ubuntu.go) requires `etc/lsb-release`; this version's generic os-release analyzer does not identify Ubuntu. SA-1 supplied only os-release/dpkg status. SA-2 copies **four known package metadata files**, including lsb-release and debian_version, from the ownership-verified disposable MongoDB container. Total export: **136,987 bytes**. No database directory, image layer, user collection or retained volume is read.

The [catalog reproduction](repro/mongo-catalog.mjs) asserts actual Ubuntu 24.04 detection and >100 packages, rather than accepting exit zero as coverage. Evidence includes all installed catalog names/versions, artifact hashes, scanner DB hash, exact `mongod`/`mongosh` binary hashes and all 39 candidates. This closes the specific OS-detection gap while preserving the failed SA-1 result. Third-party MongoDB packages and embedded mongosh components are not comprehensively covered by OS advisory matching.

The [MongoDB vendor alert page](https://www.mongodb.com/resources/products/alerts) was sampled against installed **8.0.34**: CVE-2026-104004 and CVE-2026-103965 list 8.0 versions **before 8.0.34**; this artifact is outside those ranges. The application accepts explicit ID/filter fields, not arbitrary MongoDB aggregation pipelines; it does not configure sharding, client-side encryption or public wire access. That sample is not an exhaustive vendor bulletin reconciliation. Installed mongosh is **2.13.0**; its complete bundled Node/library inventory remains a gap.

An actionable OS maintenance candidate is Ubuntu `zlib1g` **1:1.3.dfsg-3.1ubuntu2.2**, with vendor fix **1:1.3.dfsg-3.1ubuntu2.3** for CVE-2026-85091. The [Ubuntu advisory](https://ubuntu.com/security/CVE-2026-85091) concerns a particular nonblocking gzwrite/gzprintf sequence. `mongod` links libz, but that sequence has not been established from Matroid's normal request/driver path. Keep the candidate open; do not claim linkage alone proves exploitable HTTP input or that the distinct SA1 MiniZip false positive applies. Mongo image/package refresh requires an isolated compatibility proposal, not an in-place edit of retained data.

## Prior critical-labelled Redis candidates

[Additional triage](evidence/advisory-triage.json) records exact Redis artifact/build observations; [runtime evidence](evidence/runtime.json) records `x86_64`, 8-byte Perl integer/pointer sizes and native linkage.

| Candidate | Installed / vendor fix | Narrowed disposition |
| --- | --- | --- |
| CVE-2026-42496 | perl-base 5.36.0-7+deb12u3 / deb12u4 | Required Archive::Tar module cannot load and is absent from perl-base's file list. No Matroid Perl/archive extraction path. Not reachable in this examined artifact; retain source-package match/history without global suppression. [Vendor](https://security-tracker.debian.org/tracker/CVE-2026-42496) |
| CVE-2026-8376 | Same | Vendor requires a 32-bit Perl build and attacker regex compilation; actual build is 64-bit, with no application Perl regex invocation. Required build prerequisite absent here; package match remains visible. [Vendor](https://security-tracker.debian.org/tracker/CVE-2026-8376) |
| CVE-2026-13221 | Same | Vendor package table marks 5.36 affected, while notes say introduced in 5.37.10. Applicability discrepancy remains unresolved; no application Perl regex path. Do not silently mark false positive. [Vendor](https://security-tracker.debian.org/tracker/CVE-2026-13221) |

No crafted regex or archive was executed. These decisions do not establish that the rest of Redis's OS inventory is safe. A future vendor-compatible OS refresh could address maintenance risk, but changing Redis solely to eliminate these labels is not justified by the current application evidence.

## Request-facing boundaries and minimal follow-up list

Fastify/Node HTTP parsing, nginx HTTP static/proxy routes, Sharp JPEG/PNG decoding, and MongoDB/Redis internal protocols are request-facing in different trust zones. [Exact runtime maps](evidence/runtime.json) include Sharp 0.35.5, libvips 8.18.7, libpng 1.6.58, mozjpeg build `0826579`, zlib-ng 2.3.3 and all other reported native versions. These are not interchangeable with OS TIFF/XML/OpenSSL package versions. nginx links PCRE2/OpenSSL/zlib but has no TLS/QUIC/image-filter directives. Input type/container checks gate non-JPEG/PNG parsers. Node does not dynamically link OS libssl in the inspected binary; embedded OpenSSL is recorded separately. No native-symbol proof or exhaustive embedded SBOM matching was completed.

1. **Implemented:** remove unused npm/npx from Node final runtime filesystems, keeping the same base/runtime versions; all focused and full integration/browser/packaging regressions pass.
2. **Implemented independently:** pin current Action commits and disable checkout credential persistence; no runtime version change.
3. **Proposed, deferred:** reconcile the remaining request-facing native and Mongo bundled components with exact vendor ranges/features first. Produce an artifact-specific fix list; current data does not justify replacing several images or upgrading Sharp/Node arbitrarily.
4. **Proposed, deferred:** assess a compatible Mongo image rebuild containing Ubuntu's zlib fix and a compatible Redis OS refresh containing perl deb12u4, if available from the selected vendor line. Record digests/OS catalogs, repeat allocator/persistence/restart tests on fresh volumes, and assess supported data-format/rollback paths before approval. No unverified replacement tag or data-compatibility claim is supplied here.

Remaining matches are suspected/untested maintenance risk, with unassigned local application severity. Potential public deployment severity requires a different exposure/authentication design and feature-specific analysis. Complete image reachability, bundled-library coverage, full filtered-history secret review, hosted settings and other browser/DNS cases remain explicitly open under SA1-14. The separate AI Security Platform remains untouched and deferred.
