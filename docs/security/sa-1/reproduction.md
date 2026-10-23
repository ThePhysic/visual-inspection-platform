# Matroid assessment commands and evidence

All commands ran from the repository root. Existing workspace-local Node **24.22.0** and pnpm **10.34.7** were used. Docker client/engine **29.9.1**, Linux kernel **6.18.54.1-microsoft-standard-WSL2**, MongoDB **8.0.34**, Redis **8.2.8**, Sharp **0.35.5** / libvips **8.18.7**, Semgrep **1.179.0**, Trivy **0.76.1** and Chromium **156.0.8078.4** identify the environment. This is local evidence; no GitHub-hosted run was executed.

## Executed entry points

Commands below name the supplied reproduction scripts; each script contains the exact child argument arrays, input construction, environment scope and safety checks. Local generated paths are relative in shared evidence. **Do not run these against an existing personal stack.** `prepare` generates a fresh identity, `setup` creates a new disposable environment and `cleanup` refuses an unexpected owner/resource inventory.

```powershell
& ./.tools/node.exe docs/security/sa-1/repro/prepare.mjs
& ./.tools/node.exe docs/security/sa-1/repro/static.mjs
& ./.tools/node.exe docs/security/sa-1/repro/validation.mjs
& ./.tools/node.exe docs/security/sa-1/repro/setup.mjs
& ./.tools/node.exe docs/security/sa-1/repro/browser.mjs
& ./.tools/node.exe docs/security/sa-1/repro/http-resources.mjs
& ./.tools/node.exe docs/security/sa-1/repro/integrity.mjs
& ./.tools/node.exe docs/security/sa-1/repro/workflow.mjs
& ./.tools/node.exe docs/security/sa-1/repro/runtime.mjs
& ./.tools/node.exe docs/security/sa-1/repro/http-followup.mjs
& ./.tools/node.exe docs/security/sa-1/repro/scanner-controls.mjs
& ./.tools/node.exe docs/security/sa-1/repro/provision-advisories.mjs
& ./.tools/node.exe docs/security/sa-1/repro/image-advisories.mjs
& ./.tools/node.exe docs/security/sa-1/repro/mongo-catalog.mjs
& ./.tools/node.exe docs/security/sa-1/repro/image-triage.mjs
& ./.tools/node.exe docs/security/sa-1/repro/reachability.mjs
& ./.tools/node.exe docs/security/sa-1/repro/cleanup.mjs
& ./.tools/node.exe docs/security/sa-1/repro/verify.mjs
& ./.tools/pnpm.cmd lint
```

This is a dependency order for reproduction, not a claim that every command passed on its first attempt. The image script records completed scans before deliberately refusing a MongoDB image above its 1 GiB export limit; the catalog fallback records blocked coverage. Stop/review errors instead of blindly chaining into cleanup or interpreting exit 0 as valid scan coverage. Do not rerun `prepare` while an owned stack exists, because it replaces the local active-run pointer. Complete `cleanup` for that identity first. The final browser script intercepts only synthetic-origin HTML and the final resource script has the corrected SPA assertions.

The pnpm child commands for baseline validation were exactly `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; the launcher prepended existing `.tools` to PATH. Dependency audits were `pnpm audit --json` and `pnpm audit --prod --json` in the filtered snapshot. No install, fix, update or override command was issued against the application.

The integration command was:

```text
pnpm --filter @vip/api exec vitest run --config vitest.integration.config.ts --testNamePattern "^(?!.*(?:promptly completes concurrent idempotent acceptance|uses a unique index to serialize concurrent duplicates)).*$" --reporter=json --outputFile <private-audit-directory>/integration-vitest.json
```

Its `MONGODB_TEST_URI`/`REDIS_TEST_URL` were the recorded owned-server ports. Native browser execution was `pnpm --filter @vip/web exec playwright test` with those same dependency-server overrides and `PLAYWRIGHT_BROWSERS_PATH=<workspace>/.tools/playwright-browsers`. Existing setup creates random test database/queue/storage identities; it refuses existing web servers. No test used retained demo state.

Scanner container arguments are reproduced exactly in [static.mjs](repro/static.mjs), [scanner-controls.mjs](repro/scanner-controls.mjs) and [image-advisories.mjs](repro/image-advisories.mjs). Source/image mounts are read-only and actual scans use `--network none`; the advisory-provisioning container has no source, socket or service mount. Database preparation contacted only the public advisory registry; pnpm audit transmitted package metadata only. No hosted AI call occurred.

## Counts and outcomes

| Check | Actual outcome |
| --- | --- |
| Baseline source | Clean commit and 143 hashed allowlisted files; original and scanner copies matched after all tests |
| `pnpm typecheck` | Passed, exit 0 |
| `pnpm test` | **237 Vitest cases passed, 1 existing platform-specific case skipped**; **8 Node benchmark-harness cases passed**; no failed test |
| `pnpm build` | Passed, exit 0; also built the three audit runtime images from unchanged source |
| Selected integration suite | **139 passed, 0 failed, 2 intentionally deselected**, 141 discovered |
| Existing native browser suite | **18 passed, 0 failed**, no skips reported |
| Custom HTTP/resource probes | **51 initial assertions: 49 matched, 2 wrong SPA-route expectations**; two supplemental checks passed and resolved those expectations as false positives |
| Custom browser-origin run | **11 recorded observations**, not a unit-test pass count; final evidence uses unintercepted Matroid traffic |
| Source scans and positive controls | Zero Semgrep matches/errors, zero Trivy secret matches, one contextual health-check warning; both synthetic positive controls detected |
| pnpm audit | Both exit 0, zero advisories; reported graph counts 425 all / 152 production |
| Image scans | Four valid image results; MongoDB full export/fallback coverage blocked; package matches retained for triage |
| Preservation/cleanup | Passed source/index and unrelated inventory checks; owned containers/volumes/network removed |

Do not add browser observations, source rule matches, package/advisory matches and application test counts into a single security score. Historical release-readiness counts were not substituted for these executions.

## Failures and corrected audit expectations

| Failure or limitation | Disposition |
| --- | --- |
| Sandbox denied Docker access and Node child Git execution | Retried through the automatic sandbox approval mechanism within the authorized scope; no rejection remained |
| Diagnostic Docker image-format template referenced absent fields | Used structured image inspection instead; no application operation affected |
| First setup script used an incorrect relative import | Corrected audit script; it failed before creating resources |
| Initial lint rejected two regexes in the audit validation script | Corrected only the audit script using the standard terminal-control stripping helper |
| Later lint found an unused audit-script import | Removed that import; application source unchanged. Final lint outcome is recorded in package verification |
| Initial browser run expected 13 observations rather than 11 | Final bookkeeping assertion failed after probes; corrected and repeated. Only final complete evidence is used |
| An intermediate browser run routed all traffic through Playwright | Replaced with synthetic-origin-only fulfillment and repeated; final browser preflight conclusions use actual unintercepted Matroid HTTP and selected server events |
| Initial `/metrics` and `/queue` nginx assertions expected 404 | Original 49/2 result preserved; supplemental checks proved both responses are SPA HTML and direct API paths remain 404 |
| First advisory download exceeded a 128 MiB container tmpfs | Provisioning-only container failed; increased its isolated temporary capacity to 512 MiB. Target services/storage were unaffected; no host disk filling occurred |
| MongoDB image exceeded 1 GiB audit export budget | Export refused; no budget increase. Catalog fallback detected OS `none`, so advisory coverage remains blocked despite exit 0 |
| Initial catalog-report parser assumed a Results array | Corrected audit parser to retain unsupported/blocked output rather than crash or count it as clean |
| One read-only Docker `node -e` diagnostic was misquoted by Windows | Repeated using a structured stdin script; no exploit/configuration change occurred |
| Package verification flagged the user-supplied absolute workspace path in prose | Replaced it with a repository-root reference; shared evidence uses relative paths |

None of these audit-tool corrections is an SA-2 application remediation. Scanner findings were not fixed or suppressed.

## Evidence retention and verification

[source-baseline.json](evidence/source-baseline.json) is the authoritative source manifest; [isolation.json](evidence/isolation.json) records target identities; [preservation.json](evidence/preservation.json) records cleanup and unchanged boundaries. Scanner versions/digests/rule hash are in [static execution](evidence/static-execution.json) and database metadata/hash in [advisory database](evidence/advisory-database.json). Every integration case and disposition is in the corresponding JSON artifacts. [Package verification](evidence/package-verification.json) records final link/format/source checks and evidence hashes.

Raw tool reports, access logs and browser traces remain local/private under Git-ignored audit or existing test-report directories. Shared evidence strips scanner secret snippets and personal absolute paths. The canaries are synthetic. Evidence contains only local synthetic URLs, source-relative paths, hashes, resource identities and selected observations; it is not a data dump. Private instructions were excluded from snapshots, evidence and changes.

Reproduction requires authorized Docker access, existing pinned tools/dependencies and installed Chromium. It intentionally does not install tools, change credentials, repair the application, provision hosted integrations, stage changes, commit, push or deploy. New advisory feeds and browser versions may produce different results; preserve their identities instead of presenting an old result as current.
