# MongoDB and GitHub-hosted Linux kernels

## Failure and runner selection

MongoDB 8.0.34 can reject startup when TCMalloc's per-CPU caches are active on
an incompatible Linux kernel (SERVER-121912). Docker containers share the Docker
host's kernel: choosing an Ubuntu container does not select another kernel.
The failure precedes application tests; weaker health checks or longer timeouts
cannot repair it.

The diagnostic text says “6.19 and newer”, but the
[8.0.34 versioned startup source](https://github.com/mongodb/mongo/blob/r8.0.34/src/mongo/db/startup_check_rseq.cpp)
permits versions below 6.19.0 and above 7.0.13, conditional on per-CPU cache use.
MongoDB's [production notes](https://www.mongodb.com/docs/v8.0/administration/production-notes/)
and [SERVER-125742](https://jira.mongodb.org/browse/SERVER-125742) describe the
kernel fix beginning with 7.0.14. Distribution backports and version-string checks
also require care; a major/minor label alone is insufficient evidence.

As checked on 2026-10-21, GitHub's published
[Ubuntu 24.04 manifest](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
listed image `20261012.334.1`, kernel `6.17.0-1022-azure`: a compatible published
candidate. Integration/container jobs explicitly select `ubuntu-24.04` to avoid
an implicit OS migration. This **does not pin or guarantee the allocated kernel**.
GitHub [updates runner images regularly](https://github.com/actions/runner-images);
standard workflow labels do not select an immutable image-build/kernel version.

Every job prints `uname -r` and runner image identifiers. Linux database jobs also
print Docker's kernel version **before any test services start**. Integration
dependencies are now started explicitly by a wrapper instead of job-level
`services`, whose initialization can fail before diagnostic steps execute.

## CI-only compatibility environment

Keep **mongo:8.0.34** and Redis 8.2.8. Since standard runner labels cannot guarantee
a compatible kernel, explicitly selected `compose.ci.yaml` sets only MongoDB's:

```yaml
GLIBC_TUNABLES: glibc.pthread.rseq=1
```

The normal MongoDB image sets this tunable to `0`, allowing TCMalloc to register
its own rseq area and activate per-CPU caches. Enabling glibc registration makes
TCMalloc's competing registration fail and selects its non-per-CPU fallback.
This is an inference from MongoDB's versioned
[TCMalloc registration implementation](https://github.com/mongodb/mongo/blob/r8.0.34/src/third_party/tcmalloc/dist/tcmalloc/internal/percpu.cc),
verified against the actual container image. It avoids the affected path; it
does not fake kernel versions or suppress the startup guard. This is a scoped CI
workaround based on source/runtime evidence, not a claim of vendor endorsement
for production or universal kernel compatibility.

Both wrappers query real MongoDB `serverStatus` and require version `8.0.34` and
`tcmalloc.usingPerCPUCaches === false`, before tests and again after tests or full
recreation. Missing/unknown metrics, a different version, or active per-CPU caches
fail the job. See MongoDB's [allocator metric](https://www.mongodb.com/docs/v8.0/reference/command/serverstatus/).
All actual MongoDB persistence/index/CAS/recovery, Redis and browser tests remain
enabled. Allocator memory/performance characteristics differ from ordinary local
execution; these CI results are not a performance comparison.

The override is not named `compose.override.yaml`: normal `compose.yaml`,
`compose.dev.yaml`, native defaults and existing named volumes are unchanged.
No migration, database downgrade, application code or data deletion is required.

## Alternatives assessed

- A runner-label-only change cannot guarantee compatibility as kernels roll.
- A pinned [custom larger-runner image](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/use-custom-images)
  can control the kernel, but needs account-level provisioning and maintenance.
  This repository cannot create that configuration with a `runs-on` label alone.
- A self-hosted runner or nested VM adds infrastructure/kernel maintenance.
- A MongoDB 7.x CI downgrade would stop testing the application's database
  version. Downgrading local volumes is unnecessary and unsafe here.
- Another MongoDB 8.x tag alone does not fix an affected kernel. Setting glibc
  rseq to `0` is the normal image setting, not this workaround. No guessed
  `TCMALLOC_PER_CPU_CACHES` variable or guard bypass is used.

The CI environment plus authoritative allocator assertion is smaller than new
runner infrastructure and retains the database version and functional coverage.
If it ceases to work, fail and reassess kernel/custom-runner options; do not
silently downgrade MongoDB or skip checks.

## Reproduction and remaining remote validation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Exact native CI wrapper: pnpm test:integration + pnpm test:e2e,
# against isolated MongoDB/Redis with the CI environment.
pnpm test:ci:integration
# Exact container CI wrapper, including the real nginx browser workflow:
pnpm test:reliability --browser --ci-mongodb
docker compose -f compose.yaml -f compose.ci.yaml config --quiet
```

Wrappers retain generated `vip-reliability-<token>` projects, ownership checks,
private database/queue/image volumes and guarded cleanup. They never target
existing `vip-demo`/`vip-native` data. Ordinary integration/e2e/reliability commands
remain supported without opting into this environment.

A local Docker probe on `6.18.54.1-microsoft-standard-WSL2` returned MongoDB
`8.0.34`, `usingPerCPUCaches: false` with the CI setting. That validates the local
fallback configuration, not the original failure on GitHub's kernel. After the
user pushes, verify actual runner/kernel diagnostics, allocator assertions, all
integration/Playwright results and container recovery checks. Runner allocation
and execution on the previously failing kernel require a GitHub Actions run;
a local pass is not a claim of successful remote CI.
