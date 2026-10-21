# Current review snapshots

`PUT /api/v1/inspections/:id/review` saves a complete human-review snapshot in
`inspection.review`, separate from the committed `inspection.result`. There are
still only `assets` and `inspections` collections. No review history or immutable
audit log is implemented. Replacing the current snapshot discards the previous
annotation snapshot; operation receipts contain hashes and revisions, not copies.

## Wire contracts

Browser-safe TypeBox schemas and semantic validators live in
`packages/contracts/src/reviews.ts`. Completed inspection GET responses include
an optional `review` and `reviewWriteSequence` (zero before any save). Existing
inspections need no migration. An absent review differs from a persisted empty
review or a review in which every prediction is rejected.

```ts
// PUT request
{
  contractVersion: 'v1',
  taxonomyVersion: 'mock-v1',
  expectedRevision: 0,       // current review.revision, or zero if absent
  expectedWriteSequence: 0, // current inspection.reviewWriteSequence
  operationId: '<UUID v4>', // keep identical across ambiguous retries
  annotations: [
    {
      origin: 'prediction', id: 'prediction:<original prediction ID>',
      predictionId: '<original prediction ID>', classId: 'edge-defect',
      disposition: 'rejected',
      boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    },
    {
      origin: 'manual', id: 'manual:<UUID v4>', classId: 'surface-mark',
      disposition: 'accepted',
      boundingBox: { x: 0.6, y: 0.6, width: 0.2, height: 0.2 }
    }
  ]
}
```

The complete array must represent every original prediction exactly once,
including rejected predictions. Annotation IDs and prediction references are
unique; prediction annotation IDs retain their original identity. Manual IDs use
a separate UUID namespace and cannot carry prediction references. Classes come
from shared `MOCK_LABELS`, never submitted display labels. The maximum is 200
annotations, including rejected entries. Empty arrays are valid only for
zero-prediction results. Finite, positive boxes must remain inside the canonical
image. No confidence, provider, label, or original-result fields are accepted.
Confidence and original labels are always read from the immutable result.

A 200 response contains `operationId`, `operationRevision`, `writeSequence`,
`outcome`, and the authoritative current `review`. A persisted review contains
`contractVersion`, `taxonomyVersion`, `revision`, `savedAt`, and `annotations`.
Malformed payloads or semantic validation errors return 400 `INVALID_REVIEW`;
missing inspections return 404 `INSPECTION_NOT_FOUND`; incomplete inspections
return 409 `INSPECTION_NOT_COMPLETED`. Conflicts use 409
`REVIEW_REVISION_CONFLICT` or `REVIEW_OPERATION_CONFLICT`. Database failures use
503 `DATABASE_FAILURE`. All use the existing `{error:{code,message,requestId}}`
envelope. Fetch the inspection again to obtain the latest revision after conflict.

## Atomicity and bounded retry identity

The API independently retrieves the completed inspection and validates its
committed inference result before accepting review fields. It never trusts
client-supplied prediction identity or confidence. The only persistence update
sets the allowlisted review subtree and `updatedAt`, increments a write sequence,
and appends a bounded receipt. Original results and lifecycle fields are untouched.

One MongoDB `findOneAndUpdate` matches inspection ID, completed status, expected
review revision, expected write sequence, and absence of the operation ID. First
save explicitly matches an absent review/control field. Two different operations
with the same base cannot both win. A losing concurrent duplicate rereads the
winning receipt. No transaction or additional index is needed for this single
document update.

Revision starts at 1; changed snapshots advance it. Semantically identical saves
keep the existing revision and save timestamp. Annotation array order and JSON
property order are insignificant; coordinates are compared exactly on the server.
Every accepted operation, including a no-op, increments the separate write
sequence. This prevents an evicted old request from being accepted after many
no-op saves that left the visible review revision unchanged.

`reviewControl` stores the last **32** accepted operation receipts, each containing
UUID, SHA-256 fingerprint, resulting revision, and write sequence. The fingerprint
covers both expected tokens, contract/taxonomy versions, and annotations sorted by
ID with fixed field order. It excludes display-only data. Receipts and the review
commit in the same update. Identical retained operations return `replayed` without
writing. Reuse with different semantic content returns `REVIEW_OPERATION_CONFLICT`.
When a later changed review exists, the retry returns `superseded`, the original
operation revision, and the latest review; the browser preserves its local draft
and requests deliberate conflict resolution. It never reports an old snapshot as
the current saved review or rolls the database backward.

An evicted original request conflicts because its write sequence is stale. Beyond
the receipt window, intentional reuse of an old UUID with rewritten current base
tokens cannot be identified as reuse; clients must generate a fresh UUID for each
new logical operation. There is no unbounded deduplication ledger. Receipts do not
provide immutable audit history or user attribution.

## Browser behavior and limitations

The workspace initializes from the saved review, enriching display labels from
the controlled vocabulary and confidence from original predictions. Otherwise it
starts from predictions. Background queries never reset the mounted draft.
Confirmed saves replace its baseline and update the query cache; further edits
use the returned revision and sequence. Reset returns to the last confirmed
baseline. Save is disabled for unchanged drafts; an unchanged, never-reviewed
result is not marked reviewed by a click. API clients may explicitly save such a
snapshot, including an empty one.

An uncertain HTTP result retains the exact request and UUID, pauses editing, and
offers **Retry save**. Validation failures retain the draft and permit correction.
Revision conflicts retain edits and offer **Load latest saved review**, with a
discard confirmation. There is no automatic merging. A failed reload also retains
the draft. Refresh/reopen recovers confirmed server data; unconfirmed local edits
are never stored in localStorage. Leaving an ambiguous save can discard the local
retry identity; reopening fetches whatever the server committed.

React Router's data router and `useBlocker` protect ordinary in-app navigation and
Back/Forward. `beforeunload` requests the browser's generic reload/close warning.
Browser policies, mobile termination, crashes, and abrupt shutdown may suppress
warnings; this is not guaranteed draft recovery. Chromium mouse workflows are
tested, not every browser/mobile lifecycle. Mongo primary failover, host power
loss, and disk durability failures are not simulated; server durability depends
on the configured MongoDB deployment/write concern.

## Tests

`pnpm test` covers wire validation, draft conversion, save/retry/conflict controls,
and navigation protection. `pnpm test:integration` uses genuine MongoDB for CAS
concurrency, connection/API reconstruction, no-op saves, bounded receipts,
prediction immutability, and an injected failure after commit before acknowledgement.
The prior real Redis pipeline suites still execute. `pnpm test:e2e` includes real
API/worker/MongoDB/Redis upload → edit/draw/reject → save → refresh/reopen, lost HTTP
response recovery, two-tab revision conflict, and browser navigation warnings.
