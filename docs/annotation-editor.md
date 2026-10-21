# Local annotation editor

Completed inspections start in the original read-only viewer. **Edit local draft**
loads the Konva editor. Select a box or a list item, drag the selected box, or
resize it with the eight handles. Use the controlled class selector to relabel.
Rotation, flipping, image transforms, pan/zoom, and undo/redo are not implemented.

Predictions start accepted. Accepting an already accepted prediction changes
nothing. Rejecting preserves its identity, confidence, class, and box in the draft
and side panel but hides the box from the canvas. **Restore prediction** returns
that same annotation to the overlay. Choose a class, click **Add annotation**, and
drag in either direction to mark a missed object. A completed drawing selects the
manual annotation and leaves drawing mode. Tiny drawings are ignored. Escape or
Cancel drawing abandons drawing. Manual annotations can be moved, resized,
relabeled, and removed; they have no prediction identity or model confidence.
Selection, class, disposition, and removal controls support keyboard use. Canvas
geometry operations require a pointing device.

## Client draft boundary

`ReviewWorkspace`, keyed by inspection ID, owns a reducer with distinct initial
and current snapshots, selection, and interaction mode. Returning to **View
original predictions** shows unchanged server output and retains the draft.
Refetching the same immutable result does not reset edits. Another inspection
mounts a new workspace with independent draft and image state. Konva is loaded
only when editing opens.

`ReviewDraft` is a client TypeScript model, not a new wire contract:

```ts
{
  draftVersion: 'v1',
  taxonomyVersion: 'mock-v1',
  inspectionId: string,
  annotations: ReviewAnnotation[]
}
```

Every annotation contains a stable ID, controlled `classId`/`label`, and normalized
`boundingBox`. Prediction entries have `origin: 'prediction'`, `predictionId`,
read-only `originalConfidence`, and `accepted | rejected` disposition. Manual
entries have `origin: 'manual'` and a generated UUID-based ID; they omit prediction
identity/confidence/disposition. Every original prediction remains represented.
Class IDs come from shared `MOCK_LABELS`, never display-label transformations.

Initialization copies boxes. Reducer actions replace arrays/changed objects and
cannot patch source identity/confidence. They never modify query-cache predictions.
Canvas pixels, node scale, pointer offsets, and provisional drawing stay outside
the draft. Only normalized canonical geometry enters domain state.

## Image and coordinates

A proportional HTML image defines the rectangle. The borderless, unpadded wrapper
reserves its canonical aspect ratio, and the transparent Konva stage overlays the
same actual rendered rectangle. Editor image height is capped through an
aspect-preserving width constraint for portrait usability. There is no
letterboxing or object-fit offset. ResizeObserver measures actual image content.
Konva rounds canvas dimensions, so the logical stage uses integer dimensions and
a DOM scale maps it to the exact fractional CSS rectangle. Pointer conversions
use that same logical viewport; minimum sizes are converted from CSS pixels too.
Konva handles high-density backing-store pixels separately. No backing-store
dimensions enter draft state.

`annotations/geometry.ts` centralizes all conversions and constraints:

- Multiply normalized geometry by the logical stage viewport to display; divide
  by that same viewport on commit. The DOM scale maps it to the rendered image.
  Do not round ordinary coordinates.
- Dragging preserves dimensions and clamps position inside the image.
- Resize candidates are clipped to image edges. Nonpositive/flipped or undersized
  candidates are refused. New drawings require 12 CSS pixels per side (or the full
  dimension when the viewport is smaller than 12 pixels). Existing tiny predictions
  may retain their smaller dimensions; merely selecting/dragging never enlarges them.
- Transform end multiplies node dimensions by positive scales, converts to
  normalized coordinates, and resets scale to one. Negative scales are discarded.
- Finite numbers, positive sizes, and canonical boundaries are validated. An
  epsilon of `1e-10` absorbs arithmetic noise at boundaries and in dirty comparison;
  practical coordinate changes remain meaningful.

Viewport or mode changes remount the stage, abandoning provisional gestures
measured against the previous rectangle. Drag/transform end commits geometry;
selection alone does not. Drawing mode makes existing boxes noninteractive and
has no transformer, so resizing cannot accidentally draw. Pointer cancellation,
blur, and Escape abandon provisional drawings. The canonical image must load and
match metadata dimensions before geometry editing starts. Loading failures retain
draft/form controls. Observers and listeners are disconnected on unmount.

## Dirty state and limits

Meaningful annotation identity, source metadata, class, geometry, and disposition
are compared with the initial snapshot. Selection/mode changes, redundant accepts,
and arithmetic noise do not mark a draft dirty. Restoring original values or
adding then removing a manual annotation returns to clean state. Changed
annotations are listed. Reset requires confirmation and restores the initial
snapshot, selection, and mode.

There is no Save button, review endpoint, MongoDB review data, localStorage draft,
audit trail, or revision checking. Drafts live only in mounted page memory.
Ordinary same-tab application links ask before discarding changes; beforeunload
requests the browser's generic reload/close warning, which browsers may suppress.
With the existing declarative router, SPA Back/Forward and programmatic navigation
are not intercepted and may discard drafts without warning. The UI states this
limitation. Discarded drafts cannot be recovered.

Task 03B will define validation and persistence of complete snapshots. Review
server-side immutable prediction lookup, manual-annotation limits, and navigation
blocking needs before that task. No persistence implementation is included here.

## Verification

Vitest covers draft operations/immutability and centralized geometry, including
boundary clamping, all edge/corner candidates, negative scales, minimum sizes,
nonfinite inputs, and responsive precision round trips. Testing Library covers
standard controls, reset confirmation, image failures, and observer cleanup. Its
canvas doubles do not establish pointer geometry correctness.

Playwright performs real canvas selection, dragging, resize-handle movement, and
drawing at DPR two for portrait/landscape images. It checks normalized outputs,
actual image/stage alignment, painted strokes, responsive layout, boundaries,
minimums, empty results, navigation/reset confirmation, and image failure/retry.
Controlled HTTP isolates these cases. A real API/worker/MongoDB/Redis test verifies
local edits send no review writes and leave stored predictions unchanged. Previous
browser workflows remain in the suite. Touch gestures and other browser engines
are not established by these Chromium mouse tests.
