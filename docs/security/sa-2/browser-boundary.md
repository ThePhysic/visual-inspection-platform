# Local browser and HTTP admission

Selected findings: SA1-02 and SA1-04. Their historical suspected/opportunity classifications remain unchanged. The owner selected an explicit admission requirement based on a reproducible property of the local demo; this does not transform the earlier observation into a confirmed public CSRF or DNS-rebinding exploit.

## Implemented policy

The API's [admission hook](../../../apps/api/src/admission.ts) runs from [onRequest](../../../apps/api/src/app.ts), before body parsing, schemas, staging, MongoDB inserts or inspection/review handlers. Every request must have a syntactically valid allowed Host. Defaults are exact `127.0.0.1`, `localhost`, `[::1]`, with an optional valid port. Host case is normalized; abbreviated/alternative IPv4 spellings, trailing dots, userinfo, paths, malformed/zero/out-of-range/noncanonical ports and unexpected names fail with **421 `HOST_NOT_ALLOWED`**. `API_ALLOWED_HOSTS` is an explicit comma-separated hostname list without ports/wildcards; invalid configuration fails startup without echoing the supplied value.

Compose explicitly adds private `api`/`web` service aliases. nginx filters local/service hostnames too and forwards **`$http_host`**, retaining the external port. Its hostname filter uses nginx's normalized `$host`; the API additionally validates the raw forwarded authority on API requests. nginx's early rejection is a 421 HTML response; API rejection uses the normal JSON error envelope and request ID. No arbitrary forwarded-host/protocol header is trusted by Fastify. Binding `API_HOST=0.0.0.0` inside the container does not admit that value as an HTTP hostname.

| Origin on POST/PUT/PATCH/DELETE/other methods including OPTIONS | API behavior |
| --- | --- |
| Absent | Admit native CLI/API callers, subject to existing body/contracts/readiness rules |
| Exact serialized HTTP(S) origin matching actual request protocol and forwarded Host/port | Admit; nginx and native Vite preserve browser-facing authority |
| Literal `null`, empty, malformed, userinfo, path/query/fragment, multiple values | 403 `ORIGIN_NOT_ALLOWED` |
| Different hostname/alias, port or scheme | 403 `ORIGIN_NOT_ALLOWED`, even when both addresses resolve to loopback |
| Spoofed `X-Forwarded-Host`/`X-Forwarded-Proto` | Does not change the comparison |

GET/HEAD remain readable to intended native callers and do not require matching Origin. No ACAO/credentials/CORS allowlist headers are introduced. Browser response confidentiality and mutation admission remain separate. GET readiness still performs its existing temporary storage probe. Browser image embedding/read attempts and safe-method resource use are not prevented by a mutation-only gate.

API and nginx responses set `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`, including error/deep-link/static responses tested. nginx supplies one copy of these headers for proxied responses. This restricts document framing without adding script/navigation restrictions that would break React or image/canvas use. Native Vite serves development UI directly and does not receive the nginx SPA framing policy; production/container SPA and API responses do.

## Reproduction and observations

Original [SA-1 reproduction](../sa-1/repro/browser.mjs) and [SA-1 evidence](../sa-1/evidence/browser-origin.json) are untouched. New [browser reproduction](repro/browser.mjs), [HTTP matrix](repro/http.mjs) and [same-origin workflow](repro/workflow.mjs) write separate before/after files. Baseline and hardened images used one owned stack with the same synthetic database/image volume; no demo data was used.

| Boundary | Before | After |
| --- | --- | --- |
| Multipart from unrelated loopback browser origin | Asset count 0 → 1; script sees CORS TypeError | 13 → 13; script still sees TypeError; direct equivalent receives 403 |
| JSON/custom-header and review PUT from unrelated origin | Preflight prevents mutation | Still prevented; API now rejects unexpected-origin OPTIONS with 403 rather than reaching a route |
| Cross-origin history read | CORS prevents response read | Still unreadable; no disclosure header added |
| Loopback-origin iframe | SPA child navigates; parent cannot read it | Framing refused; no Matroid child document navigation |
| Synthetic public HTTPS origin | Chromium denies loopback access; no mutation | Still denied; no broader public-network conclusion |
| Arbitrary Host | Health 200 | 421 at nginx; direct API also 421 |
| Native/no-Origin and same-origin multipart | 201 | 201; correct asset increment only on admitted calls |
| Null/malformed/alias/port/scheme/multiple/path Origins | Direct native HTTP can create assets | 403; no asset increment, no residual staging |
| Genuine same-origin browser mutations | Prior SA-1 existing workflows pass | Captured browser Origin matches target for upload 201, inspection JSON 202 and review PUT 200; reload and predictions preserved |

Evidence: [browser before](evidence/browser-before.json), [browser after](evidence/browser-after.json), [HTTP before](evidence/http-before.json), [HTTP after](evidence/http-after.json), [legitimate browser](evidence/legitimate-browser.json), and [direct API/runtime](evidence/runtime.json). Fastify tests include all mutation methods, invalid JSON rejected before parsing, forwarding-header spoof attempts, allowed aliases and framing errors. Real MongoDB ingestion tests prove rejected Host/Origins never call staging or model insertion, then prove a legitimate upload still succeeds.

Chromium **156.0.8078.4** ran headless with default protections and no permission/security bypass flags. Only the synthetic `https://sa1-public.invalid` document was fulfilled locally; Matroid traffic was unintercepted. Synthetic public-origin simulation is not an actual public server or complete private-network/DNS-rebinding assessment. Native clients can forge Host and Origin or omit Origin; these headers provide no identity or authorization. Other browsers, extension behavior and real attacker-controlled DNS remain untested.
