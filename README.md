# Visual Inspection Platform

A full-stack TypeScript foundation with a React frontend, Fastify API, and shared,
versioned TypeBox contracts. The page checks API health and handles loading,
connection failures, incompatible responses, and retrying.

This milestone implements only the repository foundation and health workflow.
It has no database, worker, uploads, inference, or annotation editor.

## Prerequisites

- Node.js **24.22.0**, pinned in `.node-version` and `package.json`.
- pnpm **10.34.7**, pinned in `package.json`.

Install the pinned Node version using your preferred version manager or the
official Node distribution. With that Node version active, install pnpm:

```sh
npm install --global pnpm@10.34.7
node --version
pnpm --version
```

The versions should print `v24.22.0` and `10.34.7`. Engine checks reject an
incompatible runtime. No Docker or external services are required.

## Install and develop

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:5173>. The API listens on
<http://127.0.0.1:3001/api/v1/health>. Stop development processes with Ctrl+C.

`pnpm dev` builds contracts first, then watches contracts, API code, and frontend
code together. To run the applications in separate terminals instead:

```sh
pnpm dev:api
```

```sh
pnpm dev:web
```

The separate commands build contracts on startup; use `pnpm dev` when editing
contracts to keep their compiled output up to date automatically.

## Configuration

Configuration is optional: defaults work without an env file. To override them,
copy `.env.example` to `.env` at the repository root.

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_HOST` | `127.0.0.1` | API bind address |
| `API_PORT` | `3001` | API port; integer from 1 through 65535 |

The web app requests relative `/api` URLs. Vite's development and preview servers
proxy them to `127.0.0.1:API_PORT`; keep the API reachable on loopback when using
these commands. Restart development servers after changing `.env`. Environment
variables set in the shell take precedence. No secrets or browser environment
variables are required.

## Validation

Run from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- **Lint:** ESLint for JavaScript, TypeScript, and React hooks.
- **Typecheck:** strict TypeScript across production code, tests, and Vite config.
- **Test:** Vitest contract checks, Fastify injection tests, configuration tests,
  and React Testing Library smoke tests in jsdom. Tests do not require a running
  API or external network access.
- **Build:** contracts first, followed by API JavaScript and frontend assets.

GitHub Actions runs the same four checks after a frozen-lockfile install on
Linux and Windows. The workflow does not publish or deploy anything.

## Run compiled output locally

```sh
pnpm build
pnpm --filter @vip/api start
```

In another terminal:

```sh
pnpm --filter @vip/web preview
```

Open <http://127.0.0.1:4173>. Vite preview is a local build check, not a production
hosting solution. The API does not serve frontend assets. A future deployment
must route `/api` requests to the API and serve `apps/web/dist` separately.

## Structure and contracts

```text
apps/api/             Fastify construction, startup, configuration, and tests
apps/web/             React health page, Vite configuration, and smoke tests
packages/contracts/   Browser-safe schemas, derived types, and validation
.github/workflows/    CI validation
```

`apps/api/src/app.ts` constructs an app without listening or reading environment
variables. `server.ts` owns startup, logging, configuration, and signal handling.
Contracts build to `dist` and are consumed as a normal workspace package by both
applications. No TypeScript path aliases or server dependencies are required in
the contracts package.

`GET /api/v1/health` returns HTTP 200:

```json
{
  "apiVersion": "v1",
  "service": "visual-inspection-api",
  "status": "ok"
}
```

The endpoint accepts no query parameters. It reports API process health only;
there are no dependency-readiness checks in this milestone. TypeBox defines the
response schema and derives its TypeScript type; Fastify uses the schema for
serialization, and the frontend validates received JSON against the same schema.
Incompatible wire changes require a new API version.

Errors use `{ "error": { "code", "message", "requestId" } }`. Validation failures
return 400, missing routes return 404, and unexpected server errors return a safe
500 message while logging exception details on the server.

Before Milestone 2, agree on image-format/resource limits, canonical image
handling, and durable queue/retry behavior. Persistence and asynchronous
processing require a separately authorized implementation task.
