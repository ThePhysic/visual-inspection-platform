# Matroid static assessment and supply chain

The [source baseline](evidence/source-baseline.json) contains 143 allowlisted tracked code/configuration files. Copies were made read-only and mounted read-only into scanner containers, with a separate writable report directory, `--network none`, a read-only root filesystem, dropped capabilities and `no-new-privileges`. File hashes matched both the original and scanner snapshot afterward. No source was executed by scanners or sent to a hosted service.

## Scanner scope and results

| Tool and configuration | Result | Coverage boundary |
| --- | --- | --- |
| Semgrep CE **1.179.0**, six local rules in [semgrep-rules.yaml](repro/semgrep-rules.yaml), metrics/version checking disabled | Zero matches, zero parser/configuration errors; 91 files listed as scanned | Patterns cover raw HTML, dynamic evaluation, direct request-to-query/path sinks, shell interpretation and wildcard CORS. No general cross-file taint proof. Built-in ignore behavior left some test directories unscanned; manual test review and execution supplement it |
| Trivy **0.76.1**, explicit `secret,misconfig`, offline, built-in checks, no database/check updates | No reported secret matches; Dockerfile DS-0026 low warning | Snapshot only; no env/private instructions/history/data. Misconfiguration output covered Dockerfile, not a comprehensive Compose/Actions policy analysis; those received manual review |
| pnpm **10.34.7** `audit --json` and `audit --prod --json` against the filtered lockfile workspace | Zero advisories; graph counts reported as **425** all / **152** production | Package/advisory metadata was queried from the npm registry; no source upload. No immutable npm feed version returned; captured responses are the evidence. This excludes image OS/npm-tooling/native-library coverage |
| Offline Trivy image vulnerability scans | Four images scanned; 880 package/advisory matches / 218 distinct IDs | API, worker, web and Redis image archives only; no Docker socket mounted. MongoDB full image exceeded the input budget and fallback catalog did not produce valid coverage |

The [Semgrep report](evidence/semgrep.json), [Trivy source report](evidence/trivy.json), [pnpm responses](evidence/pnpm-audit-all.json), [production response](evidence/pnpm-audit-prod.json), and [execution metadata](evidence/static-execution.json) preserve results. [Positive controls](evidence/scanner-controls.json) detected a deliberately unexecuted evaluation sink and a synthetic GitHub-token-shaped canary. No canary was tested against GitHub or another service. Control detection does not prove exhaustive scanner coverage.

Semgrep's exact image is `sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b`; Trivy's is `sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c`. The local rule file SHA-256 is `d1f78c89e0c5c499dac11113f6827e0e09fe70df0b162aedfea658d90cbd7390`. Built-in Trivy checks/secret rules are identified by that engine image; no remote ruleset was loaded. [Semgrep ignore documentation](https://docs.semgrep.dev/ignoring-files-folders-code) explains why scanned-path inventory matters alongside configured rules.

The Trivy schema-v2 advisory database was downloaded separately with **no source or service mount**, then mounted read-only for network-disabled image scans. Its update timestamp is **2026-10-23 13:13:41 UTC**, download timestamp **19:48:38 UTC**, and database SHA-256 is `a3e2a693b5f130132acc609d723f60fb546a85b3b35179d63063afa6f355d0d2`. [Database evidence](evidence/advisory-database.json) records the registry and metadata; [Trivy documentation](https://trivy.dev/docs/latest/configuration/db/) describes separate database provisioning.

## Runtime image candidates

| Image | OS identified | Package/advisory matches | Vendor critical / high | Status |
| --- | --- | ---: | ---: | --- |
| API | Debian 12.15 | 241 | 1 / 60 | Scanned; critical zlib match closed, other candidates retained |
| Worker | Debian 12.15 | 241 | 1 / 60 | Scanned; same base-package duplication is not another application defect |
| Web | Alpine 3.23.4 | 134 | 0 / 41 | Scanned; native-library reachability not proven by presence |
| Redis | Debian 12.15 | 264 | 4 / 65 | Scanned; zlib false positive and three unresolved Perl critical candidates |
| MongoDB | Fallback detected OS `none` | **Unknown** | **Unknown** | Blocked; zero findings from the fallback is not a clean result |

Exact image IDs and every retained package/version/advisory/disposition are in [image-advisories.json](evidence/image-advisories.json); [summary](evidence/image-scan-summary.json) separates vendor severity from application severity. All source and image scans used report-only options. No fix, dependency override, ignore-CVE entry or runtime update was applied.

Manual triage separated these groups:

- **Debian zlib/MiniZip:** the three CVE-2023-45853 appearances are false positives for the installed `zlib1g` binary package. [Debian's notes](https://security-tracker.debian.org/tracker/CVE-2023-45853) explicitly describe the unbuilt vulnerable contribution. This does not close other zlib advisories.
- **Bundled npm:** 13 advisory matches in each Node application image point into `/usr/local/lib/node_modules/npm/`. Matroid starts Node directly and no application import/invocation of those copies was found. Runtime Undici is 7.29.1; the flagged npm copy is 6.28.0. These are removable-tooling/maintenance opportunities, not workspace audit contradictions or demonstrated HTTP exploits.
- **Local utility/privilege prerequisites:** util-linux mount issues require authorized mount entries and attacker-controlled path conditions. The API image's `/etc/fstab` had no active entries and the inspected service processes had zero effective capabilities. [Debian's mount advisory](https://security-tracker.debian.org/tracker/CVE-2026-53613) and [ACL advisory](https://security-tracker.debian.org/tracker/CVE-2026-54369) support narrower prerequisite analysis. No privileged race was executed, and this sample does not close every local-library candidate.
- **Web native libraries:** active nginx configuration has HTTP port 8080 and fixed proxy/static routes, with no TLS/QUIC/image-filter directives. Curl, TIFF, XML and regex-package matches do not by themselves prove that a caller reaches an affected parser. [Read-only observations](evidence/reachability.json) record configuration rather than an exploit; unresolved matches remain suspected.
- **Redis OS Perl candidates:** vendor descriptions concern Perl regex compilation or archive extraction. No application route invoking these operations was found. Package presence still needs maintenance attention and precise vendor/build triage; no malicious archive or regex was run. The 32-bit prerequisite in [CVE-2026-8376](https://security-tracker.debian.org/tracker/CVE-2026-8376) especially cautions against transferring a generic critical label to this amd64 deployment.

The remaining **851** package/advisory appearances are conservatively retained as suspected weaknesses requiring further evidence; **26** bundled-npm appearances are opportunities and **3** are vendor-supported false positives. These dispositions record incomplete exploitability analysis rather than claiming all 851 are defects. They must not be presented as confirmed vulnerability counts in a portfolio.

## Manual CI and secrets assessment

Reviewed [workflow](../../../.github/workflows/ci.yml), [Dockerfile](../../../infra/docker/Dockerfile), [workspace install policy](../../../pnpm-workspace.yaml), manifests/lockfile, environment template, ignore rules and relevant build/test wrappers. Controls include `contents: read`, push/pull-request events without `pull_request_target`, frozen installs, exact direct versions, native build allowlisting, pinned Node/nginx digests, production dependency closures, job timeouts and guarded disposable tests. No workflow deployment or explicit `secrets.*` expression was found. This does not establish hosted token settings, branch protection or alert state.

Actions use version tags rather than immutable commit IDs; checkout credential handling and fork/runner/cache settings need hosted/action-specific review before a stronger claim. MongoDB/Redis use version tags. Application images contain base-provided npm despite not needing it to start. No authenticated scanner connection or new CI security job was added.

No secret matches were returned for the exported snapshot, and no actual credentials were used in synthetic probes. Local env files, personal configuration, private instructions, Git metadata/history, data, backups, generated modules and traces were excluded. `.env.example` received manual review but was not included in the generic env-excluding scanner export. Ignoring a file prevents accidental tracking/context inclusion; it does not prove history is clean. Full filtered-history and hosted secret-alert reviews remain untested. No credential validation, rotation or disclosure was performed.

The optional AI Security Platform pilot was deferred: its approved ingestion, execution, egress and report-retention properties were not demonstrated, and its existing services were not restarted. The filtered snapshot is available for a later authorized pilot; standalone engine scans here do not imply a validated platform integration.
