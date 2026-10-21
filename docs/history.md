# Inspection history and manual recovery

## Endpoint and summaries

`GET /api/v1/inspections` accepts only `limit`, `status`, and `cursor`. The default
limit is 20 and the maximum is 50. Limits must be decimal integers without leading
zeros. Omit status for all inspections, or use `queued`, `processing`, `completed`,
or `failed`. Repeated, unknown, and malformed query parameters return 400
`INVALID_HISTORY_QUERY` in the existing error envelope.

```sh
curl 'http://127.0.0.1:3001/api/v1/inspections?status=completed&limit=20'
# Pass the returned nextCursor unchanged on the next request, retaining status:
curl 'http://127.0.0.1:3001/api/v1/inspections?status=completed&limit=20&cursor=<nextCursor>'
```

TypeBox schemas live in `packages/contracts/src/history.ts`. Responses contain
`items`, `hasMore`, and `nextCursor` only when another page exists. Each summary
has ID, asset ID, creation/update timestamps, lifecycle status, canonical-image
preview URL, and `hasReview`. Completed entries include original detection count
and, when reviewed, review revision. Failed entries include allowlisted failure
code/message. Retry entries include `retriedFrom`. Full inference, annotations,
review receipts, filesystem paths, and queue internals are never returned.

The aggregation matches the bounded query, sorts, limits to page size plus one,
and projects summary fields. Detection arrays are counted using MongoDB `$size`;
only the count reaches Node. Review projection reads the revision rather than
transferring a snapshot. No per-row asset query is required. This is not a covered
query: MongoDB still reads documents to compute summaries. No denormalized counts
or worker changes are introduced.

## Cursor and consistency

Ordering is strictly `(createdAt descending, _id descending)`. Following pages
match `createdAt < boundaryTime` or equal time with `_id < boundaryId`, plus the
same status filter. There is no `skip` and no total-count query. The lookahead row
indicates whether another page exists; the cursor is based on the last returned
row, so lookahead does not consume an item.

Cursors are opaque to clients. Internally v1 uses unpadded base64url JSON with
`version`, ISO `createdAt`, lowercase ObjectId `id`, and `status` (null for all).
The server checks length, encoding, structure, real timestamp, version, and exact
filter context. Reuse across status filters, malformed boundaries, and unsupported
versions return safe 400 `INVALID_CURSOR` / `INVALID_HISTORY_QUERY`. Cursor page
size may change within the allowed bounds. Cursors have no time-based expiry or
server-side session; they are not signed authorization tokens. Clients should
offer to restart browsing after cursor rejection.

For a stable dataset, pages have no duplicates or omissions, including timestamp
ties. This is a live view, **not snapshot isolation**. Newer inserts ahead of the
boundary appear on refresh, not later pages. Backdated inserts and records changing
status can enter/leave a filtered query between requests. Review revisions/statuses
are those observed when each page was fetched. Refresh restarts from the newest
page. The browser deduplicates overlapping IDs defensively.

## Indexes

The existing `{createdAt:-1, _id:-1}` supports all-history ordering. Task 04 adds
`{status:1, createdAt:-1, _id:-1}` for the implemented status equality filter with
the same ordering. The recovery index `{status:1, updatedAt:1}` remains unchanged.

Forward retry navigation uses one additional index:
`{retriedFrom:1, createdAt:-1, _id:-1}`. Failed-detail retrieval makes an indexed,
ID-only query limited to the newest direct child and returns optional
`latestRetryId`. This avoids writing a pointer into the original failed record.
The API's existing startup index creation installs the new indexes. No index
performance benchmark or large-history latency guarantee is claimed.

## Browser navigation and recovery

`/inspections` is linked from the main navigation. Its status filter lives in
`?status=...`. TanStack Query infinite-query keys include status; each request uses
its own cursor page parameter. Changing filters starts at the beginning without
displaying old-filter rows as matches. Load more is explicit; no entire-history
prefetch is performed. Requests do not overlap, failed page fetches retain loaded
pages, and a rejected cursor offers **Restart history browsing**. Cached pages and
the filter are preserved when returning from a detail page where practical.
There is no custom scroll/history manager or cross-reload page cache.

History uses a 30-second freshness window and does not poll. A stale remount can
refresh already loaded pages; window-focus refetch is disabled. **Refresh history**
deliberately resets to the first page. Upload acceptance, review save, and manual
retry invalidate history caches. Queued/processing detail pages retain their
existing polling behavior. Image-preview failures show a fallback without hiding
the inspection link. Previews lazily load the canonical content endpoint: this
milestone does not generate smaller thumbnail files, so large source images can
still cost bandwidth/decoding memory.

Failed details show the processing failure separately from network errors.
**Retry inspection** calls the existing `POST /api/v1/inspections/:id/retry` with
a new UUID idempotency key. A synchronous guard and disabled pending button prevent
double clicks. Recoverable failures offer **Retry submission**, preserving the
same key in the mounted component. An accepted-but-lost response therefore returns
the same child on retry. Known ineligibility returns an explicit message directing
the user to refresh status. There is no automatic retry of terminal failures.

Acceptance navigates to the new inspection; **View previous attempt** links to its
preserved predecessor. Original failed details expose **View latest retry** after
fetching current data. Multiple intentional retries can branch from one failure;
the forward link selects only the latest direct child. All attempts remain in
history with predecessor links, without a graphical tree or new collection.
Keys survive ordinary network retries, not browser reload/unmount. If leaving an
uncertain submission, inspect the latest-retry link before intentionally creating
another attempt. This does not modify existing backend retry scopes or budgets.

History and lineage links respect Task 03B's annotation navigation blocker. Dirty
review drafts are never silently replaced by history or retry cache updates.
Browser reload/close warning limitations still apply.

## Operational and verification scope

There is no authentication or authorization. History exposes all records to anyone
who can reach the API. Use this in a **trusted local/demo environment**, not an
unrestricted public deployment. Authentication, deletion/retention policies, smaller
thumbnails, and infrastructure hardening remain outside Task 04.

Vitest covers history/retry contracts and controls. Genuine MongoDB integration
tests cover timestamp ties, multi-page traversal, filtering, invalid cursors,
projected summaries, indexes, and preserved retry records. Existing real Redis/
worker suites still run. Playwright creates multiple inspections, saves a review,
browses/filters history, verifies mobile layout, reopens corrections, and checks
dirty navigation. For deterministic failure recovery it seeds one failed record
in the run's private MongoDB database referencing a genuinely uploaded asset;
retry acceptance, lost-response recovery, child execution, and lineage then use
the real API/worker/MongoDB/Redis stack. Production inference has no new fault
switch or delay. This browser test does not generate the initial provider failure;
provider-failure behavior remains covered by pipeline integration tests.
