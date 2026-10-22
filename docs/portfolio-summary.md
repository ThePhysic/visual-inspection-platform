# Portfolio summary

## Project summary

Visual Inspection Platform is a full-stack image-inspection and human-review
application: upload a canonicalized image, process an asynchronous inspection,
edit normalized bounding boxes, save corrections, and reopen them through history.
It uses deterministic simulated inference so the software workflow is independently
demonstrable without model training or access to proprietary systems.

**Stack:** React, TypeScript, Vite, React Router, TanStack Query, react-konva;
Node/Fastify, TypeBox, MongoDB/Mongoose, Redis/BullMQ, Sharp; pnpm workspaces,
Docker Compose/nginx, Pino, process-local metrics, Vitest/Testing Library,
Playwright and GitHub Actions.

Implemented features include validated JPEG/PNG ingestion, canonical image
storage, durable asynchronous acceptance, read-only predictions, interactive
corrections, persistent current review snapshots, conflict recovery, filtered
cursor history, linked retries, structured operational diagnostics, and safe
disposable reliability/benchmark tooling.

## Engineering decisions worth discussing

1. **MongoDB-first acceptance:** queued documents carry dispatch intent. A
   post-response hint optimizes normal scheduling; startup/periodic reconciliation
   repairs missed work without making Redis a prerequisite for durable 202 acceptance.
2. **At-least-once attempts with conditional authority:** generation-specific queue
   IDs, persistent attempt budgets, expiring ownership tokens and conditional
   completion prevent stale deliveries from replacing the committed result.
3. **Separate prediction and review data:** the original inference result stays
   unchanged while a complete review snapshot uses atomic revision/write-sequence
   checks and bounded operation receipts for ambiguous-response retry safety.
4. **Canonical geometry:** EXIF orientation is applied before storage. One
   normalized image coordinate system is shared by inference, responsive canvas
   rendering and persistence; viewport pixels/Konva scale stay outside domain state.
5. **Small operational footprint:** one API, one worker and two backing services;
   internal loopback metrics and disposable fault tests instead of a monitoring
   stack or extra orchestration services.

## Evidence and limits

- [Final QA record](release-readiness.md) maps executed checks to workflow,
  concurrency, recovery and persistence evidence. Tests include real MongoDB/Redis
  behavior and actual canvas pointer interactions, not only HTTP/Konva mocks.
- [Reliability evidence](reliability.md) covers abrupt worker interruption before/
  after inference and persistence, stale-attempt rejection, bounded retries,
  dependency outages and container recreation. It distinguishes assumptions from
  observed recovery and does not promise exactly-once execution or disaster recovery.
- [Measured optimization](performance.md#task-05c-opt-observed-results): median
  simulated-inspection visibility **4,955 → 113 ms (97.7% reduction)** after prompt
  dispatch, in a local one-worker sequential workload with eight matched samples
  and 100 ms polling. Additional 24-sample runs support the normal-path observation.
  This is orchestration latency, not real-model acceleration; concurrent acceptance
  and history timing tradeoffs are reported too.

## Résumé bullet candidates

- Built a React/TypeScript and Fastify inspection platform with interactive
  bounding-box editing, MongoDB-backed review snapshots, optimistic concurrency,
  and cursor-paginated inspection history.
- Implemented a Redis/BullMQ pipeline with MongoDB-first acceptance, persistent
  idempotency, bounded retries and token-guarded result commits; validated recovery
  using real dependency interruptions and disposable Docker environments.
- Reduced median simulated-inspection result visibility **97.7% (4,955 to 113 ms)**
  by adding prompt dispatch with reconciliation fallback, measured in a local
  one-worker benchmark with matched eight-sample sequential workloads.

Use the measurement context in interviews or a linked project description.
Do not replace “simulated-inspection” with “model inference” or claim production
adoption, commercial users, real accuracy, cloud scale, or exactly-once execution.

## Simulated inference versus future ML

The current provider returns checksum-matched curated fixture regions or
content-seeded fallback output. The two labels and scores are demonstrations.
The provider boundary accepts canonical bytes/metadata and an abort signal and
returns output validated by the worker. A future real model would require a new
implementation, model/taxonomy integration, performance evidence and accuracy
evaluation; none is supplied by the current project.

## GitHub presentation suggestions (not applied remotely)

Suggested repository description:

> Full-stack visual inspection and human review with simulated inference, resilient asynchronous jobs, revisioned reviews, and Docker Compose.

Suggested topics: `typescript`, `react`, `fastify`, `mongodb`, `redis`, `bullmq`,
`docker-compose`, `playwright`, `computer-vision`, `portfolio`.

The README badge URL is derived from the existing origin
`https://github.com/ThePhysic/visual-inspection-platform.git` and actual workflow
`.github/workflows/ci.yml`; no repository URL was invented and no remote settings
were changed. User review of description, topics and visibility remains manual.

**License:** no root license exists and none was created or changed. If broad
reuse is desired, MIT is a candidate for owner approval; GitHub's
[MIT overview](https://choosealicense.com/licenses/mit/) describes its permissive
terms. [GitHub's licensing guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
explains why a public repository and an open-source license are separate decisions.
Do not advertise this project as MIT-licensed until the owner authorizes and adds it.

The [recording plan](demo.md) is ready, but no video or hosted deployment exists.
No Git commit, tag, release or push is part of this preparation task.
