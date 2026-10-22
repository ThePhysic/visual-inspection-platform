# Application-ready release candidate: QA evidence

**Status:** prepared for owner review; not published, tagged or released. No
functional release blocker was found in the executed checks below. Publication
requires the owner's final authorization and version-control actions.

## Candidate and environment

Validation/capture occurred **2026-10-22 UTC** (2026-10-21 local) on Windows
10.0.26200, Node 24.22.0, pnpm 10.34.7, Docker Desktop 29.9.1 using Linux containers
on WSL2 6.18.54.1. Compose uses MongoDB 8.0.34 and Redis 8.2.8. The source is
HEAD `7e84cc6803c1c7a85210df1c3800b9f1ccc30292` plus the uncommitted Task 06 working
tree; that HEAD alone does not contain this release preparation.

No commits, tags, releases, pushes, GitHub settings or license files were created.
The README origin/badge was derived from local Git configuration and the actual
CI workflow. New GitHub-hosted results cannot exist until the owner pushes the
candidate. Prior green CI was supplied as task context, not rerun remotely here.

## Executed checks

| Actual command | Outcome |
| --- | --- |
| `pnpm lint` | Passed, zero warnings |
| `pnpm typecheck` | Passed across shared packages, API, worker and web/tests |
| `pnpm test` | 237 Vitest unit/component cases passed; one existing Linux-only filesystem case skipped on Windows; eight Node benchmark-harness cases passed |
| `pnpm test:reliability --native --browser` | Passed in a new owned Compose project; invokes the integration, build and E2E commands below, then full-container smoke/browser and interruption checks |
| `pnpm test:integration` (inside that wrapper) | 141 cases passed against real private MongoDB/Redis, including canonicalization/queue execution for all three new images |
| `pnpm build` (standalone, also inside E2E and Docker builds) | Passed; web/API/worker runtime images built and workspace runtime packaging checked |
| `pnpm test:e2e` (inside that wrapper) | 18 Chromium browser cases passed |
| Container Playwright (inside that wrapper) | Two browser cases passed through production nginx; no host API/worker substitutes |
| `pnpm portfolio:capture` | Passed in another new owned stack; final portfolio case additionally exercised real Load more pagination after the three captures |
| Root/native/CI `docker compose ... config --quiet` | Passed; configuration-only evaluation of documented project names/overrides |

The final capture's portfolio case passed in 12.1 seconds; that is an observed
functional-test duration, not a performance threshold or model-latency result.
The first capture attempt could not locate Chromium's default cache. It was
rerun using the already-installed workspace `PLAYWRIGHT_BROWSERS_PATH`; no test
was skipped or assertion weakened. Standard installations use
`pnpm --filter @vip/web exec playwright install chromium`.

The portfolio capture test and fixture correctness cases are discovered by the
existing CI commands. CI configuration and performance thresholds are unchanged.
The final pagination-only test extension was executed by the capture command;
the broad reliability run had already executed the preceding portfolio workflow.

## Functional QA map

| Requirement | Evidence and boundary |
| --- | --- |
| Upload → inspect → edit → save → reopen → history | Real container/browser workflows; portfolio capture corrects class, moves/resizes, rejects, draws, saves, refreshes and reopens; original result equality checked |
| Manufacturing-oriented examples | Three original SVG/PNG illustrations; checksum/dimension/determinism unit checks and actual PNG canonicalization/worker integration |
| Zero detections | Real legacy and new clean-panel fixture ingestion/execution/browser checks; zero is completed, not failure |
| Failed-inspection retry | Native browser test seeds a safe failed record only in a private DB; retry, lost-response recovery, child execution and lineage use the real stack. Provider-failure generation is tested separately in integration |
| Responsive geometry | Actual canvas mouse interactions at DPR 2 in existing tests; controlled HTTP supplies landscape/portrait lifecycle fixtures. New real-stack portrait image and mobile overflow checks also pass |
| Refresh/deep links | Production nginx SPA fallback, persisted review reload and direct browser result reopening |
| Review conflict/ambiguous save | Real two-tab revision conflict and committed-save/lost-response browser tests; MongoDB concurrent-save integration checks |
| Unsaved-change warnings | Browser links, Back/Forward and reload tests; browser/mobile policy can still suppress unload warnings |
| History filtering/pagination | MongoDB timestamp-tie/keyset tests, component paging/error states, container API smoke; final portfolio browser creates 21 bounded normal requests, verifies 20 initial cards, loads the next page without duplicates, reopens the older saved review |
| Restart persistence | Container API/worker restarts and complete down/up without volume deletion preserve image bytes, inspection/review/history state; Redis marker also survives |
| Dependency recovery | Owned Redis outage/admission/API restart/recovery; MongoDB rejection and interrupted result-write recovery; readiness/worker health checks and authoritative state verification |
| Worker correctness | Existing real integration covers abrupt termination before inference, after inference and after persistence; stale tokens, duplicate delivery, lease repair and bounded retry exhaustion |
| Simulation disclosure | Application badge/text verified; fixtures/provenance and score limitations are explicit; no frontend-invented predictions |

## Setup and data safety

The documented default is:

```powershell
docker compose -p vip-demo up -d --build --wait --wait-timeout 120
```

`compose.yaml` confirms the application address **http://127.0.0.1:8080**, with
only web published on loopback, internal service hostnames and three persistent
named volumes. No `.env` or private credentials are required for full Compose.
The literal personal `vip-demo` startup was **not** executed: the same build/up/
wait configuration was exercised with generated project names, private database
namespaces, dedicated Redis/image volumes and free loopback ports. Existing
`vip-demo`/`vip-native` data was not used, changed or removed.

The wrapper validates ownership labels before every disruptive operation and
cleanup. Capture also labels/removes only its own image tags. No prune is used.
Ordinary `down` preserves volumes; only disposable, ownership-verified cleanup
uses volume deletion. The native override publishes dependencies on loopback;
native compiled API/worker/Vite-preview execution was verified by E2E. The
interactive `pnpm dev` watch session was reviewed but not separately rerun.

This was not an uncached clone/registry-network test: Docker dependency/build
caches were available. Runtime smoke proves no host Node/pnpm/source-development
tooling is needed inside the production services. The README clone command will
include this candidate only after the owner commits/pushes it.

## Presentation and artifact review

Release change manifest:

| Files | Change |
| --- | --- |
| `README.md` | Portfolio entry point, actual-origin CI badge, screenshots, measured results and concise setup |
| `docs/architecture.md`, `docs/demo.md`, `docs/portfolio-summary.md`, `docs/release-readiness.md` | Current-system explanation, recording plan, résumé evidence and this QA record |
| `docs/development.md`, `docs/api.md` | Operational/API detail moved out of README with stale statements corrected |
| `docs/containers.md`, `docs/history.md` | Current portfolio capture/browser coverage |
| `fixtures/inspections/{machined-panel,edge-component,clean-panel}.{svg,png}`, `generate.mjs`, `README.md` in that directory | Original reproducible illustrations and provenance/region/checksum map |
| `packages/backend/src/provider.ts` | Curated output for the three new checksums; legacy fixtures/fallback preserved |
| `packages/backend/test/provider.test.ts`, `apps/api/test/inspections.integration.test.ts`, `apps/web/container-test/portfolio.spec.ts` | Fixture determinism/canonicalization and actual full workflow/pagination assertions |
| `infra/portfolio/capture.mjs`, `package.json` | `pnpm portfolio:capture` wrapper reusing existing isolation safeguards |
| `docs/screenshots/{inspection,review,history}.png`, `capture.json`, `README.md` in that directory | Authentic captures and provenance |

`AGENTS.md`, dependency lockfile, Compose files, CI workflow, original regression
PNGs and every benchmark JSON report are unchanged.

- Three authentic, unretouched screenshots and source/capture metadata are in
  [screenshots](screenshots/README.md). All data is disposable illustrated demo data.
- [Demo script](demo.md) includes a timed recording plan and narration; no video,
  hosted demo, or fabricated recording URL is provided.
- README is the portfolio entry point. Detailed native/configuration and API
  information moved to [development](development.md) and [API reference](api.md);
  stale “reviews not implemented” statements were removed.
- [Current architecture](architecture.md) covers implemented services and data
  invariants. No speculative inference/cloud services are in its diagram.
- Existing benchmark JSON files/methodology are preserved. No new performance run
  was needed for this documentation/fixture change; the historical 64×64 fixture
  outputs and orchestration behavior remain unchanged.
- All 80 local Markdown file/image targets checked across 19 documentation files
  existed; external URLs, heading fragments and GitHub Mermaid rendering were not
  automatically validated. Regenerating the illustrations reproduced all three
  PNG checksums in the provider fixture definitions exactly.
- Tracked-file review found only `.env.example` among env/private-key/report/cache
  patterns. A filename-only scan found no private-key headers, AWS access-key IDs
  or GitHub classic token patterns. This is a bounded content check, not a full
  security audit or scan of Git history. Intentional fixture/screenshot assets are
  documented; local env/data/tooling/traces remain ignored.

## Remaining gates and limitations

**Publication gates:** owner review/authorization, owner-created commit/push, and
checking the new hosted CI results and rendered GitHub README. No publication
actions were performed. If advertising an open-source reuse license, select and
authorize it first; none has been added automatically.

**Optional polish:** record the 2–3 minute video and insert its real link; approve
the suggested repository description/topics and a license candidate in
[portfolio summary](portfolio-summary.md). More browser engines/CPU architectures,
touch-specific gestures and a clean uncached clone on another machine were not
tested here.

**Known design limits:** simulated inference, trusted-local unauthenticated access,
single-host storage, at-least-once execution, bounded review receipts/current-only
snapshots, best-effort navigation warnings, and no coordinated backups/high
availability. The exploratory benchmark is not a real-model or production-scale
claim. See [reliability](reliability.md) and [performance conditions](performance.md).
