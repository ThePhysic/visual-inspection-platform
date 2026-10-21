# Browser inspection workflow

The frontend uses React Router in declarative mode for `/`, `/inspections/:id`,
and `/health`. TanStack Query owns remote inspection/asset state, cancellation,
cache, and nonoverlapping polling. There is no global client-state framework.
The API, queue, and shared contracts are unchanged by the browser workflow and
local annotation editor.

`api.ts` checks HTTP status and existing TypeBox contracts. Completed inference
results also pass the shared cross-field validator before rendering. IDs and
asset-content URLs must agree with the requested resource. Error messages are
bounded client-owned messages rather than arbitrary server/network exceptions.

`UploadPage` keeps one explicit submission object containing file, generated key,
and, once acknowledged, asset metadata. It makes no POST requests from effects.
A synchronous guard and disabled controls prevent duplicate submissions. Automatic
mutation retry is disabled: users explicitly retry the same logical request.
Successful upload metadata is retained before inspection creation, so retries do
not upload again. Unmount aborts the active request and prevents late navigation.
This state lasts only for that mounted upload page, not across browser reloads.

`InspectionPage` queries by validated inspection ID. Active inspections poll every
two seconds; hidden-tab interval fetching is disabled. Terminal states and
nonrecoverable fetch errors stop interval polling. Recoverable polling errors
preserve cached state and allow manual retry. Refetches do not clear completed
predictions. Asset metadata and image-content errors are independent of predictions.

`DetectionViewer` receives only backend prediction data. A responsive `width:100%`,
`height:auto` image determines the rendered rectangle. Its unpadded, borderless
positioned wrapper reserves the canonical aspect ratio. An absolute overlay shares
that rectangle; left/top/width/height are normalized coordinates multiplied by
100 percent. There is no `object-fit`, letterboxing, canvas, resizing observer, or
page-coordinate conversion. Boxes use border-box sizing. Numbered boxes connect to
keyboard-operable list buttons, and stable class colors supplement labels/numbers.
Image and detection list in this original-prediction view remain read-only.
**Edit local draft** opens the separate [Konva annotation editor](annotation-editor.md),
which copies predictions into memory without modifying the query cache.

Vitest/Testing Library tests mock HTTP for selection, authoritative rejection,
submission/retry identity, partial success, cancellation, lifecycle polling,
background failures, direct-route reloads, and viewer states. Playwright executes
real compiled API/worker/MongoDB/Redis workflows. Separate controlled-HTTP browser
tests hold lifecycle states and provide non-square PNG fixtures to verify actual
overlay geometry at desktop/mobile sizes. They do not establish model accuracy.
