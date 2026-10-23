# Final supply-chain assessment: partially blocked

The final source keeps the accepted dependency/runtime versions. No database image, Node/Sharp/native library, lockfile or Action was upgraded in SA-3. Advisory matches remain candidates unless affected feature, build and intended input boundary are established. Vendor severity is not Matroid application severity.

## Offline provenance and coverage

| Input/tool | Identity / result | Coverage limit |
| --- | --- | --- |
| Semgrep CE 1.179.0 | Image `sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b`; six preserved local rules; zero matches/errors | 145-file filtered snapshot; 92 paths listed as scanned; default ignores remain. Narrow patterns, not complete cross-file taint analysis |
| Local rule file | SHA-256 `d1f78c89e0c5c499dac11113f6827e0e09fe70df0b162aedfea658d90cbd7390` | Rule content is versioned in SA-1, unchanged; no remote rules or autofix |
| Trivy 0.76.1 | Image `sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c`; source secret/misconfig and explicit image vulnerability scans | Zero source secret matches; one DS-0026 contextual health warning. No full Git-history/private-file scan |
| Advisory DB schema v2 | SHA-256 `a3e2a693b5f130132acc609d723f60fb546a85b3b35179d63063afa6f355d0d2`; updated 2026-10-23 13:13:41 UTC, downloaded 19:48:38 UTC during SA-1 | Preserved feed reused for reproducible comparison; not a new latest-feed certification |
| pnpm graph | Exact manifests/lock hash frozen; prior SA-2 all/prod audits reported zero | No new external registry request in SA-3. Those responses remain historical; they exclude OS and many native/bundled components |

All scanner runs were network-disabled, with read-only inputs/root filesystem, dropped capabilities, `no-new-privileges`, bounded memory/tmpfs, report-only flags, offline/update-disabled modes and no Docker socket. Source was treated as data, not executed. Reports/source remained local; hosted AI and the separate AI Security Platform were not used. Scanner images were checked not to declare anonymous volumes. [Source scan evidence](evidence/source-scans.json), [image scans](evidence/image-scans.json), [DB/catalog provenance](evidence/mongo-catalog.json), and [scripts](validation.md) identify exact flags and exclusions.

## Exact runtime artifact results

| Artifact | Final result on preserved feed | Interpretation |
| --- | --- | --- |
| API, Debian 12.15 | **228** matches | Same as SA-2, zero added/removed matches |
| Worker, Debian 12.15 | **228** | Same as SA-2 |
| Web, Alpine 3.23.4 | **134** | Same as preserved SA-1 package inventory; nginx config already hardened in SA-2 |
| Redis, Debian 12.15 | **264** | Same exact image and advisory inventory as earlier assessment |
| MongoDB, Ubuntu 24.04 | **128 OS packages / 39 matches** | Bounded catalog, not a full image or complete bundled/native scan |

The first four total **854 package/advisory appearances**, not 854 confirmed flaws. The historical count was 880; SA-2 removed exactly 13 matches per Node image by omitting unused npm/npx from the merged runtime filesystem. No other historical advisory was magically fixed, and base/build layers still contain tooling. Prior MiniZip false-positive and narrower Perl dispositions remain visible. Mongo's catalog matches overlap some advisory IDs and should not be added to a vulnerability score.

Image scans retain the original **<1 GiB image**, **<1100 MiB archive**, **>4 GiB free disk**, two-minute scan bounds; only owned temporary archives were removed. Mongo's full image is still outside that export method. Four metadata files total **136,987 bytes**, with Ubuntu's required lsb-release file, produce valid OS/package detection. This closes OS detection only. Exact image IDs appear in [images](evidence/images.json), [image scans](evidence/image-scans.json), and [component evidence](evidence/components.json).

## Bounded component follow-up

| Candidate/component | Exact observation | Final disposition / future evidence needed |
| --- | --- | --- |
| MongoDB server | 8.0.34, recorded binary SHA, Ubuntu x86_64 build, OpenSSL build identity and linked libraries | Prior sampled server advisories with affected 8.0 range before 8.0.34 stay outside that range; not an exhaustive vendor reconciliation |
| mongosh compiled bundle | **2.13.0**, embedded **Node 24.21.0**, OpenSSL **3.5.8**, Node driver **7.5.0**, libmongocrypt **1.20.0**, bindings **7.2.0**, Kerberos **7.0.0** | New precise identities narrow the earlier unknown bundle. They are not the API's Node/driver artifacts; complete embedded SBOM/advisory reconciliation remains blocked |
| mongosh libmongocrypt / CVE-2026-114655 review target | Installed component identified; no matching native record obtained from the bounded OS scanner reports | Unresolved candidate. Verify vendor affected range and embedded build/patches, then KMS/key-vault/provider input prerequisites. No confirmed Matroid exploit or application severity assigned |
| API MongoDB stack | Mongoose **9.11.2**, driver **7.7.0**; driver-context resolution cannot find `mongodb-client-encryption` | Optional peer metadata in the lockfile is not evidence of installation. Public API/connection config supplies no autoEncryption/KMS providers. This narrows normal request reachability without certifying the mongosh bundle |
| Mongo zlib CVE-2026-85091 | Ubuntu zlib1g **1:1.3.dfsg-3.1ubuntu2.2**, scanner/vendor fix **...2.3**; libz linked to mongod | Specific nonblocking gzwrite/gzprintf sequence not established from normal driver/wire handling. Source-package maintenance candidate remains open; no image/OS update performed |
| Redis Perl CVE-2026-42496 | perl-base **5.36.0-7+deb12u3**; Archive::Tar unavailable again | Required module absent from examined artifact; source-package record retained, no archive payload executed |
| Redis Perl CVE-2026-8376 | x86_64, 8-byte pointer/integer build | Vendor 32-bit prerequisite absent. No regex exploit or blanket package suppression |
| Redis Perl CVE-2026-13221 | Same Perl package; prior vendor table marks 5.36 affected while notes identify introduction in 5.37.10 | Vendor applicability discrepancy unresolved; no Matroid Perl regex path. Proposed Debian maintenance fix remains deb12u4, not implemented |
| API Node / Undici | Node **24.22.0**, embedded Undici **7.29.1**; npm/npx final runtime tree absent | Former npm-private Undici 6.28.0 matches cannot be transferred to the embedded runtime without affected-major/build evidence |
| Sharp/native codecs | Sharp **0.35.5**, libvips **8.18.7**, PNG **1.6.58**, zlib-ng **2.3.3**, full runtime version map and loaded libvips binary hash recorded after tiny generated PNG/JPEG decode | Exact loaded artifacts verified; upstream range/patch/native SBOM coverage is incomplete. Input format gate narrows supported parsers, not every decoder memory-safety issue |
| nginx native features | HTTP proxy/static routes; no enabled TLS/QUIC/image-filter configuration | Installed OS libraries alone do not prove an affected parser/crypto function is exposed. Keep unresolved native applicability visible |

The mongosh follow-up used build-info and `--nodb` process version identity, not a retained/live DB query. The tiny Sharp decode was in memory and created no retained image. [Component evidence](evidence/components.json), [structured native candidate selection](evidence/native-advisories.json) and [runtime resolution](evidence/runtime.json) preserve observations. An initial unsupported adjacent-JSON database extraction returned zero even for known CVEs; that experiment was discarded, never treated as clean. Final candidate evidence selects exact records from structured scanner output; missing native matches remain gaps.

Vendor URLs retained for future reconciliation include [MongoDB alerts](https://www.mongodb.com/resources/products/alerts), [Ubuntu zlib](https://ubuntu.com/security/CVE-2026-85091), [Debian archive](https://security-tracker.debian.org/tracker/CVE-2026-42496), [32-bit Perl](https://security-tracker.debian.org/tracker/CVE-2026-8376), and [Perl applicability discrepancy](https://security-tracker.debian.org/tracker/CVE-2026-13221). SA-3 made no live external lookup; these are previously reviewed references/future verification locations, not freshly retrieved vendor attestations.

No candidate establishes a violation of the intended local application boundary. Remaining work needs exact vendor/build affected ranges, native component inventories and supported feature invocation. Public deployment would additionally change reachable principals/protocols and require a separate exposure/authentication design. No broad dependency/image refresh, scanner suppression or automatic fix was used to lower counts.
